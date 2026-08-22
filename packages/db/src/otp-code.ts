import type { OtpCodePort } from "@labpics/domain";

const CODE_LENGTH = 6;
const CODE_SPACE = 10 ** CODE_LENGTH;

/**
 * OTP code generator/digester (INV-09: the raw code lives in memory only).
 *
 * generate() draws a uniform 6-digit code via rejection sampling over a
 * 32-bit word — no modulo bias.
 *
 * digest() is plain sha256(code). The 10^6 space is NOT protected by the hash:
 * the online budget (5 attempts per challenge, 10-minute TTL, rate limits)
 * bounds guessing, and the digest never leaves its DB row, so offline attack
 * requires DB compromise — at which point a challenge-scoped digest adds only
 * per-row salt against a 10^6 dictionary, negligible. The port's digest(code)
 * signature (code alone) makes this the honest contract rather than implying
 * strength the scheme doesn't have.
 */
export class RandomOtpCodePort implements OtpCodePort {
  async generate(): Promise<{ readonly code: string; readonly digest: string }> {
    const code = randomCode();
    return { code, digest: await this.digest(code) };
  }

  digest(code: string): Promise<string> {
    return Promise.resolve(new Bun.CryptoHasher("sha256").update(code).digest("hex"));
  }
}

function randomCode(): string {
  // Rejection sampling: accept only values below the largest multiple of
  // CODE_SPACE representable in 32 bits, so every code is equally likely.
  const limit = Math.floor(0x1_0000_0000 / CODE_SPACE) * CODE_SPACE;
  const word = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(word);
    const value = word[0];
    if (value !== undefined && value < limit) {
      return (value % CODE_SPACE).toString().padStart(CODE_LENGTH, "0");
    }
  }
}
