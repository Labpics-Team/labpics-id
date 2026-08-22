import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import type { ConsumeOtpChallengeOutcome, OtpPurpose } from "@labpics/domain";
import { Email, otpChallengeId, userId } from "@labpics/domain";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  createDb,
  createDbPool,
  outbox,
  PostgresOtpChallengeStore,
  PostgresUnitOfWork,
  RandomOtpCodePort,
} from "../src";

const connectionString = process.env.TEST_DATABASE_URL;

const NOW = new Date("2026-08-22T12:00:00.000Z");
const EXPIRES = new Date("2026-08-22T12:10:00.000Z");
const PURPOSE: OtpPurpose = "email_otp_login";

const codes = new RandomOtpCodePort();

describe.skipIf(connectionString === undefined)("otp challenge store", () => {
  const pool = connectionString === undefined ? null : createDbPool(connectionString);
  const store = new PostgresOtpChallengeStore();

  beforeAll(async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    await migrate(createDb(pool), { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
  });
  beforeEach(async () => {
    await pool?.query("TRUNCATE otp_challenges, outbox");
  });
  afterAll(async () => pool?.end());

  function uow(): PostgresUnitOfWork {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    return new PostgresUnitOfWork(createDb(pool));
  }

  async function seed(rawId: string, code: string, email = "employee@lab.pics") {
    await uow().run(async (context) =>
      store.create(context, {
        id: otpChallengeId(rawId),
        email: Email.from(email),
        purpose: PURPOSE,
        accountId: null,
        codeDigest: await codes.digest(code),
        createdAt: NOW,
        expiresAt: EXPIRES,
        maxAttempts: 5,
      }),
    );
  }

  async function consume(rawId: string, code: string, now = NOW, purpose: OtpPurpose = PURPOSE) {
    const codeDigest = await codes.digest(code);
    return uow().run((context) =>
      store.consume(context, { id: otpChallengeId(rawId), purpose, codeDigest, now }),
    );
  }

  it("creates and consumes a challenge, returning the full record", async () => {
    const rawId = `challenge-${crypto.randomUUID()}`;
    await seed(rawId, "111111");

    const outcome = await consume(rawId, "111111");

    expect(outcome.kind).toBe("consumed");
    if (outcome.kind === "consumed") {
      expect(outcome.challenge.id).toBe(otpChallengeId(rawId));
      expect(outcome.challenge.email.value).toBe("employee@lab.pics");
      expect(outcome.challenge.purpose).toBe(PURPOSE);
      expect(outcome.challenge.expiresAt).toEqual(EXPIRES);
      expect(outcome.challenge.remainingAttempts).toBe(5);
      expect(outcome.challenge.accountId).toBeNull();
    }
  });

  it("round-trips the account binding made at creation", async () => {
    if (pool === null) throw new Error("TEST_DATABASE_URL is required");
    const boundUserId = crypto.randomUUID();
    await pool.query("INSERT INTO users (id, name, email) VALUES ($1, 'OTP Bound', $2)", [
      boundUserId,
      `bound-${boundUserId}@lab.pics`,
    ]);
    const rawId = `challenge-${crypto.randomUUID()}`;
    await uow().run(async (context) =>
      store.create(context, {
        id: otpChallengeId(rawId),
        email: Email.from(`bound-${boundUserId}@lab.pics`),
        purpose: PURPOSE,
        accountId: userId(boundUserId),
        codeDigest: await codes.digest("111111"),
        createdAt: NOW,
        expiresAt: EXPIRES,
        maxAttempts: 5,
      }),
    );

    const outcome = await consume(rawId, "111111");

    expect(outcome.kind).toBe("consumed");
    if (outcome.kind === "consumed") {
      expect(outcome.challenge.accountId).toBe(userId(boundUserId));
    }
  });

  it("never stores the raw challenge id in any column (INV-09)", async () => {
    const rawId = `challenge-${crypto.randomUUID()}`;
    await seed(rawId, "111111");

    const rows = await pool?.query("SELECT * FROM otp_challenges");
    expect(rows?.rowCount).toBe(1);
    const row = (rows?.rows[0] ?? {}) as Record<string, unknown>;
    expect(Object.keys(row).length).toBeGreaterThan(0);
    for (const [column, value] of Object.entries(row)) {
      expect(`${column}=${String(value)}`).not.toContain(rawId);
    }
  });

  it("rejects an expired challenge even with the correct code", async () => {
    const rawId = `challenge-${crypto.randomUUID()}`;
    await seed(rawId, "111111");

    const late = new Date(EXPIRES.getTime() + 1);
    expect(await consume(rawId, "111111", late)).toEqual({ kind: "expired" });
  });

  it("reports not_found on purpose mismatch", async () => {
    // A row with a foreign purpose (seeded at SQL level: the type system
    // forbids expressing it through the port) must be invisible to consume.
    const rawId = `challenge-${crypto.randomUUID()}`;
    const digestOfRaw = new Bun.CryptoHasher("sha256").update(rawId).digest("hex");
    await pool?.query(
      `INSERT INTO otp_challenges
         (challenge_id_digest, purpose, email, code_verifier, attempts_remaining, expires_at, created_at)
       VALUES ($1, 'password_reset', 'employee@lab.pics', $2, 5, $3, $4)`,
      [digestOfRaw, await codes.digest("111111"), EXPIRES, NOW],
    );

    expect(await consume(rawId, "111111")).toEqual({ kind: "not_found" });
  });

  it("reports already_consumed on replay after a successful consume", async () => {
    const rawId = `challenge-${crypto.randomUUID()}`;
    await seed(rawId, "111111");
    await consume(rawId, "111111");

    expect(await consume(rawId, "111111")).toEqual({ kind: "already_consumed" });
  });

  it("reports not_found for an unknown challenge", async () => {
    expect(await consume(`challenge-${crypto.randomUUID()}`, "111111")).toEqual({
      kind: "not_found",
    });
  });

  it("decrements attempts only for the attacked challenge (INV-13 independence)", async () => {
    const attacked = `challenge-${crypto.randomUUID()}`;
    const untouched = `challenge-${crypto.randomUUID()}`;
    await seed(attacked, "111111", "same@lab.pics");
    await seed(untouched, "222222", "same@lab.pics");

    expect(await consume(attacked, "999999")).toEqual({
      kind: "invalid_code",
      remainingAttempts: 4,
    });
    expect(await consume(attacked, "999999")).toEqual({
      kind: "invalid_code",
      remainingAttempts: 3,
    });
    expect(await consume(untouched, "222222")).toMatchObject({ kind: "consumed" });
  });

  it("blocks even the correct code after attempts are exhausted", async () => {
    const rawId = `challenge-${crypto.randomUUID()}`;
    await seed(rawId, "111111");

    for (let attempt = 5; attempt >= 1; attempt -= 1) {
      expect(await consume(rawId, "000000")).toEqual({
        kind: "invalid_code",
        remainingAttempts: attempt - 1,
      });
    }
    // Exhausted budget maps to not_found: dead == unknown (port contract).
    expect(await consume(rawId, "111111")).toEqual({ kind: "not_found" });
  });

  it("admits exactly one winner among 8 parallel consumes with the correct code (INV-11)", async () => {
    if (connectionString === undefined) throw new Error("TEST_DATABASE_URL is required");
    const rawId = `challenge-${crypto.randomUUID()}`;
    await seed(rawId, "111111");
    const codeDigest = await codes.digest("111111");

    // Independent pools -> independent connections -> real concurrency.
    const pools = Array.from({ length: 8 }, () => createDbPool(connectionString));
    try {
      const results: ConsumeOtpChallengeOutcome[] = await Promise.all(
        pools.map((competitor) =>
          new PostgresUnitOfWork(createDb(competitor)).run((context) =>
            store.consume(context, {
              id: otpChallengeId(rawId),
              purpose: PURPOSE,
              codeDigest,
              now: NOW,
            }),
          ),
        ),
      );
      const wins = results.filter((result) => result.kind === "consumed");
      const replays = results.filter((result) => result.kind === "already_consumed");
      expect(wins).toHaveLength(1);
      expect(replays).toHaveLength(7);
    } finally {
      await Promise.all(pools.map((competitor) => competitor.end()));
    }
  });

  it("rolls back challenge AND outbox together when the transaction fails (INV-20)", async () => {
    const rawId = `challenge-${crypto.randomUUID()}`;

    await expect(
      uow().run(async (context) => {
        await store.create(context, {
          id: otpChallengeId(rawId),
          email: Email.from("employee@lab.pics"),
          purpose: PURPOSE,
          accountId: null,
          codeDigest: await codes.digest("111111"),
          createdAt: NOW,
          expiresAt: EXPIRES,
          maxAttempts: 5,
        });
        await context.transaction.insert(outbox).values({
          type: "identity.otp.requested",
          payload: { idempotencyKey: `identity.otp.requested:${rawId}` },
        });
        throw new Error("injected fault before commit");
      }),
    ).rejects.toThrow("injected fault before commit");

    const challenges = await pool?.query("SELECT 1 FROM otp_challenges");
    const events = await pool?.query("SELECT 1 FROM outbox");
    expect(challenges?.rowCount).toBe(0);
    expect(events?.rowCount).toBe(0);
  });

  it("commits challenge AND outbox together on success (INV-20)", async () => {
    const rawId = `challenge-${crypto.randomUUID()}`;

    await uow().run(async (context) => {
      await store.create(context, {
        id: otpChallengeId(rawId),
        email: Email.from("employee@lab.pics"),
        purpose: PURPOSE,
        accountId: null,
        codeDigest: await codes.digest("111111"),
        createdAt: NOW,
        expiresAt: EXPIRES,
        maxAttempts: 5,
      });
      await context.transaction.insert(outbox).values({
        type: "identity.otp.requested",
        payload: { idempotencyKey: `identity.otp.requested:${rawId}` },
      });
    });

    const challenges = await pool?.query("SELECT 1 FROM otp_challenges");
    const events = await pool?.query("SELECT 1 FROM outbox WHERE type = 'identity.otp.requested'");
    expect(challenges?.rowCount).toBe(1);
    expect(events?.rowCount).toBe(1);
  });
});

describe("otp code port", () => {
  it("generates 6-digit codes with a matching digest", async () => {
    const port = new RandomOtpCodePort();
    const { code, digest } = await port.generate();

    expect(code).toMatch(/^\d{6}$/);
    expect(await port.digest(code)).toBe(digest);
  });

  it("generates varying codes", async () => {
    const port = new RandomOtpCodePort();
    const seen = new Set<string>();
    for (let index = 0; index < 32; index += 1) {
      seen.add((await port.generate()).code);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
