import { InvalidEmailError } from "../errors";

const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email value object: canonical, lower-cased, validated at construction. */
export class Email {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static from(raw: string): Email {
    const normalized = raw.trim().toLowerCase();
    if (normalized.length === 0 || normalized.length > MAX_EMAIL_LENGTH) {
      throw new InvalidEmailError("email must be between 1 and 254 characters");
    }
    if (!EMAIL_PATTERN.test(normalized)) {
      throw new InvalidEmailError("email does not match the expected address shape");
    }
    return new Email(normalized);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
