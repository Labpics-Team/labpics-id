export type TokenPurpose = "email_verification" | "password_reset" | "session_refresh";

export interface IssueTokenCommand {
  readonly purpose: TokenPurpose;
  readonly subject: string;
}

export interface IssuedToken {
  readonly raw: string;
  readonly digest: string;
  readonly expiresAt: Date;
}

export interface TokenPort {
  issue(command: IssueTokenCommand): Promise<IssuedToken>;
}
