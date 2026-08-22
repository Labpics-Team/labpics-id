import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  type ConsumeOtpResult,
  createDb,
  createDbPool,
  PostgresOtpChallengeAdapter,
  PostgresUnitOfWork,
} from "../src";

const connectionString = process.env.TEST_DATABASE_URL;

const NOW = new Date("2026-08-22T12:00:00.000Z");
const EXPIRES = new Date("2026-08-22T12:10:00.000Z");

function verifier(code: string, challengeIdDigest: string): string {
  return new Bun.CryptoHasher("sha256").update(`${code}:${challengeIdDigest}`).digest("hex");
}

describe.skipIf(connectionString === undefined)("otp challenge store", () => {
  const pool = connectionString === undefined ? null : createDbPool(connectionString);
  const adapter = new PostgresOtpChallengeAdapter();

  beforeAll(async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    await migrate(createDb(pool), { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
  });
  beforeEach(async () => {
    await pool?.query("TRUNCATE otp_challenges");
  });
  afterAll(async () => pool?.end());

  function uow(): PostgresUnitOfWork {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    return new PostgresUnitOfWork(createDb(pool));
  }

  async function seed(challengeIdDigest: string, code: string, email = "employee@lab.pics") {
    await uow().run((context) =>
      adapter.createChallenge(context, {
        challengeIdDigest,
        purpose: "email_otp_login",
        email,
        accountId: null,
        codeVerifier: verifier(code, challengeIdDigest),
        expiresAt: EXPIRES,
        sourceDigest: "source-digest",
      }),
    );
  }

  function consume(challengeIdDigest: string, code: string, now = NOW) {
    return uow().run((context) =>
      adapter.consumeChallenge(context, {
        challengeIdDigest,
        codeVerifier: verifier(code, challengeIdDigest),
        now,
      }),
    );
  }

  it("creates and consumes a challenge, returning the bound identity", async () => {
    const digest = `challenge-${crypto.randomUUID()}`;
    await seed(digest, "111111");

    expect(await consume(digest, "111111")).toEqual({
      kind: "consumed",
      accountId: null,
      email: "employee@lab.pics",
    });
  });

  it("rejects an expired challenge even with the correct code", async () => {
    const digest = `challenge-${crypto.randomUUID()}`;
    await seed(digest, "111111");

    const late = new Date(EXPIRES.getTime() + 1);
    expect(await consume(digest, "111111", late)).toEqual({ kind: "expired" });
  });

  it("rejects replay after a successful consume", async () => {
    const digest = `challenge-${crypto.randomUUID()}`;
    await seed(digest, "111111");
    await consume(digest, "111111");

    expect(await consume(digest, "111111")).toEqual({ kind: "replayed" });
  });

  it("reports not_found for an unknown challenge", async () => {
    expect(await consume(`challenge-${crypto.randomUUID()}`, "111111")).toEqual({
      kind: "not_found",
    });
  });

  it("decrements attempts only for the attacked challenge (INV-10 independence)", async () => {
    const attacked = `challenge-${crypto.randomUUID()}`;
    const untouched = `challenge-${crypto.randomUUID()}`;
    await seed(attacked, "111111", "same@lab.pics");
    await seed(untouched, "222222", "same@lab.pics");

    expect(await consume(attacked, "999999")).toEqual({
      kind: "invalid_code",
      attemptsRemaining: 4,
    });
    expect(await consume(attacked, "999999")).toEqual({
      kind: "invalid_code",
      attemptsRemaining: 3,
    });

    const rows = await pool?.query<{ challenge_id_digest: string; attempts_remaining: number }>(
      "SELECT challenge_id_digest, attempts_remaining FROM otp_challenges WHERE challenge_id_digest = $1",
      [untouched],
    );
    expect(rows?.rows[0]?.attempts_remaining).toBe(5);
    expect(await consume(untouched, "222222")).toMatchObject({ kind: "consumed" });
  });

  it("blocks even the correct code after attempts are exhausted", async () => {
    const digest = `challenge-${crypto.randomUUID()}`;
    await seed(digest, "111111");

    for (let attempt = 5; attempt >= 1; attempt -= 1) {
      expect(await consume(digest, "000000")).toEqual({
        kind: "invalid_code",
        attemptsRemaining: attempt - 1,
      });
    }
    expect(await consume(digest, "111111")).toEqual({ kind: "invalid_code", attemptsRemaining: 0 });
  });

  it("admits exactly one winner among 8 parallel consumes with the correct code (INV-11)", async () => {
    if (connectionString === undefined) throw new Error("TEST_DATABASE_URL is required");
    const digest = `challenge-${crypto.randomUUID()}`;
    await seed(digest, "111111");

    // Independent pools -> independent connections -> real concurrency.
    const pools = Array.from({ length: 8 }, () => createDbPool(connectionString));
    try {
      const results: ConsumeOtpResult[] = await Promise.all(
        pools.map((competitor) =>
          new PostgresUnitOfWork(createDb(competitor)).run((context) =>
            adapter.consumeChallenge(context, {
              challengeIdDigest: digest,
              codeVerifier: verifier("111111", digest),
              now: NOW,
            }),
          ),
        ),
      );
      const wins = results.filter((result) => result.kind === "consumed");
      const replays = results.filter((result) => result.kind === "replayed");
      expect(wins).toHaveLength(1);
      expect(replays).toHaveLength(7);
    } finally {
      await Promise.all(pools.map((competitor) => competitor.end()));
    }
  });
});
