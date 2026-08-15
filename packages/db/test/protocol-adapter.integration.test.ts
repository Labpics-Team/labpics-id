import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createDbPool, PostgresProtocolAdapter } from "../src";

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(connectionString === undefined)("platform protocol stores", () => {
  const pool = connectionString === undefined ? null : createDbPool(connectionString);
  const now = new Date("2026-08-15T00:00:00.000Z");
  const future = new Date("2026-08-15T01:00:00.000Z");

  beforeAll(async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    await migrate(createDb(pool), { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
  });

  afterAll(async () => pool?.end());

  function adapterOf() {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    return { adapter: new PostgresProtocolAdapter(createDb(pool)), pool };
  }

  async function insertClient(clientId: string) {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    await pool.query(
      "INSERT INTO oauth_clients (client_id, client_name, subject_type, token_endpoint_auth_method) VALUES ($1, $2, 'public', 'none')",
      [clientId, `name-${clientId}`],
    );
  }

  it("reads a full client aggregate and misses unknown clients", async () => {
    const { adapter, pool } = adapterOf();
    const clientId = `client-${crypto.randomUUID()}`;
    await insertClient(clientId);
    await pool.query("INSERT INTO oauth_client_redirect_uris (client_id, uri) VALUES ($1, $2)", [
      clientId,
      "https://app.lab.pics/callback",
    ]);
    await pool.query("INSERT INTO oauth_client_allowed_scopes (client_id, scope) VALUES ($1, $2)", [
      clientId,
      "openid",
    ]);
    await pool.query(
      "INSERT INTO oauth_client_allowed_grants (client_id, grant_type) VALUES ($1, 'authorization_code')",
      [clientId],
    );

    const record = await adapter.getClient(clientId);
    expect(record).toMatchObject({
      clientId,
      subjectType: "public",
      tokenEndpointAuthMethod: "none",
      isActive: true,
      redirectUris: ["https://app.lab.pics/callback"],
      allowedScopes: ["openid"],
      allowedGrants: ["authorization_code"],
    });
    expect(await adapter.getClient(`missing-${crypto.randomUUID()}`)).toBeNull();
  });

  it("enforces exact redirect URI uniqueness and rejects fragments at the database", async () => {
    const { pool } = adapterOf();
    const clientId = `client-${crypto.randomUUID()}`;
    await insertClient(clientId);
    await pool.query("INSERT INTO oauth_client_redirect_uris (client_id, uri) VALUES ($1, $2)", [
      clientId,
      "https://app.lab.pics/cb",
    ]);

    expect(
      pool.query("INSERT INTO oauth_client_redirect_uris (client_id, uri) VALUES ($1, $2)", [
        clientId,
        "https://app.lab.pics/cb",
      ]),
    ).rejects.toThrow(/duplicate key/);
    expect(
      pool.query("INSERT INTO oauth_client_redirect_uris (client_id, uri) VALUES ($1, $2)", [
        clientId,
        "https://app.lab.pics/cb#fragment",
      ]),
    ).rejects.toThrow(/oauth_client_redirect_uris_no_fragment/);
  });

  it("upserts, reads and revokes consent with a single active row per subject+client", async () => {
    const { adapter } = adapterOf();
    const subjectId = `subject-${crypto.randomUUID()}`;
    const clientId = `client-${crypto.randomUUID()}`;
    await insertClient(clientId);

    await adapter.upsertConsent(subjectId, clientId, ["openid"], now);
    const replaced = await adapter.upsertConsent(subjectId, clientId, ["openid", "email"], now);
    expect(replaced.scopes).toEqual(["openid", "email"]);

    const read = await adapter.getConsent(subjectId, clientId);
    expect(read?.scopes).toEqual(["openid", "email"]);

    await adapter.revokeConsent(subjectId, clientId, now);
    expect(await adapter.getConsent(subjectId, clientId)).toBeNull();
  });

  it("consumes an artifact exactly once under concurrency", async () => {
    const { adapter } = adapterOf();
    const id = `code-${crypto.randomUUID()}`;
    await adapter.putArtifact("AuthorizationCode", id, { sub: "s1" }, { expiresAt: future });

    const results = await Promise.all([
      adapter.consumeArtifact("AuthorizationCode", id, now),
      adapter.consumeArtifact("AuthorizationCode", id, now),
      adapter.consumeArtifact("AuthorizationCode", id, now),
    ]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);

    const after = await adapter.getArtifact("AuthorizationCode", id);
    expect(after?.consumedAt).toEqual(now);
  });

  it("refuses to consume an expired artifact", async () => {
    const { adapter } = adapterOf();
    const id = `code-${crypto.randomUUID()}`;
    const past = new Date(now.getTime() - 1000);
    await adapter.putArtifact("AuthorizationCode", id, {}, { expiresAt: past });
    expect(await adapter.consumeArtifact("AuthorizationCode", id, now)).toBeNull();
  });

  it("revokes every unconsumed artifact of a grant transactionally", async () => {
    const { adapter, pool } = adapterOf();
    const clientId = `client-${crypto.randomUUID()}`;
    await insertClient(clientId);
    const grantId = `grant-${crypto.randomUUID()}`;
    await pool.query(
      "INSERT INTO oauth_grants (id, client_id, subject_id, expires_at) VALUES ($1, $2, 's', $3)",
      [grantId, clientId, future],
    );

    await adapter.putArtifact("AccessToken", `at-${grantId}`, {}, { grantId, expiresAt: future });
    await adapter.putArtifact("RefreshToken", `rt-${grantId}`, {}, { grantId, expiresAt: future });
    const alreadyConsumed = `rt2-${grantId}`;
    await adapter.putArtifact("RefreshToken", alreadyConsumed, {}, { grantId, expiresAt: future });
    await adapter.consumeArtifact("RefreshToken", alreadyConsumed, now);

    const revoked = await adapter.revokeArtifactsByGrantId(grantId, now);
    expect(revoked).toBe(2);
    const at = await adapter.getArtifact("AccessToken", `at-${grantId}`);
    expect(at?.consumedAt).toEqual(now);
  });

  it("finds device artifacts by uid and userCode", async () => {
    const { adapter } = adapterOf();
    const id = `dc-${crypto.randomUUID()}`;
    const uid = `uid-${crypto.randomUUID()}`;
    const userCode = `WDJB-${crypto.randomUUID().slice(0, 8)}`;
    await adapter.putArtifact("DeviceCode", id, { d: 1 }, { expiresAt: future, uid, userCode });

    expect((await adapter.findArtifactByUid("DeviceCode", uid))?.id).toBe(id);
    expect((await adapter.findArtifactByUserCode("DeviceCode", userCode))?.id).toBe(id);
    expect(await adapter.findArtifactByUid("DeviceCode", "nope")).toBeNull();
  });

  it("destroys artifacts and cleans up expired plus long-consumed rows only", async () => {
    const { adapter } = adapterOf();
    const gone = `gone-${crypto.randomUUID()}`;
    await adapter.putArtifact("Interaction", gone, {}, { expiresAt: future });
    await adapter.destroyArtifact("Interaction", gone);
    expect(await adapter.getArtifact("Interaction", gone)).toBeNull();

    const expired = `expired-${crypto.randomUUID()}`;
    const fresh = `fresh-${crypto.randomUUID()}`;
    const oldConsumed = `oldconsumed-${crypto.randomUUID()}`;
    const past = new Date(now.getTime() - 1000);
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    await adapter.putArtifact("AccessToken", expired, {}, { expiresAt: past });
    await adapter.putArtifact("AccessToken", fresh, {}, { expiresAt: future });
    await adapter.putArtifact("AuthorizationCode", oldConsumed, {}, { expiresAt: future });
    await adapter.consumeArtifact("AuthorizationCode", oldConsumed, eightDaysAgo);

    const removed = await adapter.cleanupExpiredArtifacts(now);
    expect(removed).toBeGreaterThanOrEqual(2);
    expect(await adapter.getArtifact("AccessToken", expired)).toBeNull();
    expect(await adapter.getArtifact("AuthorizationCode", oldConsumed)).toBeNull();
    expect(await adapter.getArtifact("AccessToken", fresh)).not.toBeNull();
  });

  it("keeps consumed and revoked state across a dump/restore-shaped copy", async () => {
    // Restore-model contract: a logical dump of the artifact table carries
    // consumed_at with it, so a restored consumed code can never be re-consumed.
    const { adapter, pool } = adapterOf();
    const id = `restore-${crypto.randomUUID()}`;
    await adapter.putArtifact("AuthorizationCode", id, { s: 1 }, { expiresAt: future });
    await adapter.consumeArtifact("AuthorizationCode", id, now);

    await pool.query(
      "CREATE TEMP TABLE protocol_artifacts_dump AS SELECT * FROM protocol_artifacts WHERE id = $1",
      [id],
    );
    await pool.query("DELETE FROM protocol_artifacts WHERE id = $1", [id]);
    await pool.query("INSERT INTO protocol_artifacts SELECT * FROM protocol_artifacts_dump");
    await pool.query("DROP TABLE protocol_artifacts_dump");

    expect(await adapter.consumeArtifact("AuthorizationCode", id, future)).toBeNull();
    const restored = await adapter.getArtifact("AuthorizationCode", id);
    expect(restored?.consumedAt).toEqual(now);
  });

  it("lists active and retiring verification keys through rotation and rejects retired", async () => {
    const { adapter, pool } = adapterOf();
    await pool.query("DELETE FROM protocol_signing_keys");
    const jwk = JSON.stringify({ kty: "OKP", crv: "Ed25519", x: "A" });
    await pool.query(
      "INSERT INTO protocol_signing_keys (kid, status, algorithm, public_key_jwk) VALUES ('k1', 'active', 'EdDSA', $1), ('k2', 'next', 'EdDSA', $1)",
      [jwk],
    );

    // Exactly one active key is a database invariant, not a convention.
    expect(
      pool.query(
        "INSERT INTO protocol_signing_keys (kid, status, algorithm, public_key_jwk) VALUES ('k3', 'active', 'EdDSA', $1)",
        [jwk],
      ),
    ).rejects.toThrow(/duplicate key/);

    // Rotation: k1 active -> retiring, k2 next -> active. Overlap window: both verify.
    await pool.query("UPDATE protocol_signing_keys SET status = 'retiring' WHERE kid = 'k1'");
    await pool.query("UPDATE protocol_signing_keys SET status = 'active' WHERE kid = 'k2'");
    const overlap = await adapter.listSigningKeys();
    const verifying = overlap.filter((k) => k.status === "active" || k.status === "retiring");
    expect(verifying.map((k) => k.kid).sort()).toEqual(["k1", "k2"]);

    // Retirement: k1 leaves the verification set.
    await pool.query(
      "UPDATE protocol_signing_keys SET status = 'retired', retired_at = $1 WHERE kid = 'k1'",
      [now],
    );
    const after = await adapter.listSigningKeys();
    const verifyingAfter = after.filter((k) => k.status === "active" || k.status === "retiring");
    expect(verifyingAfter.map((k) => k.kid)).toEqual(["k2"]);
    expect(after.find((k) => k.kid === "k1")?.status).toBe("retired");
  });

  it("stores only public JWK material and hashed client credentials", async () => {
    const { pool } = adapterOf();
    const clientId = `client-${crypto.randomUUID()}`;
    await insertClient(clientId);
    await pool.query(
      "INSERT INTO oauth_client_credentials (client_id, credential_hash) VALUES ($1, $2)",
      [clientId, "$argon2id$v=19$m=65536,t=2,p=1$dummy$dummy"],
    );
    const columns = await pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'oauth_client_credentials'",
    );
    const names = columns.rows.map((row) => row.column_name);
    expect(names).toContain("credential_hash");
    expect(names).not.toContain("secret");
    expect(names).not.toContain("client_secret");
  });
});
