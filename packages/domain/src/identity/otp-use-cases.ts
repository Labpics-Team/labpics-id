/**
 * Email-OTP use-case factory (CH08). Contract only: the implementation lands
 * in a later slice; until then every call fails so the committed RED tests
 * exercise the frozen contract without passing by accident.
 */
import type { ClockPort } from "../ports/clock";
import type { OtpChallengeStore, OtpCodePort } from "../ports/otp-challenge";
import type { RateLimitPort } from "../ports/rate-limit";
import type { UnitOfWork } from "../ports/unit-of-work";
import type { OtpSessionOwner, OtpUseCases } from "./otp-contract";

export interface OtpUseCaseDependencies {
  readonly challenges: OtpChallengeStore;
  readonly codes: OtpCodePort;
  readonly sessions: OtpSessionOwner;
  readonly rateLimit: RateLimitPort;
  readonly clock: ClockPort;
  readonly unitOfWork: UnitOfWork;
}

export function createOtpUseCases(_deps: OtpUseCaseDependencies): OtpUseCases {
  return {
    async requestOtp() {
      throw new Error("not implemented");
    },
    async redeemOtp() {
      throw new Error("not implemented");
    },
  };
}
