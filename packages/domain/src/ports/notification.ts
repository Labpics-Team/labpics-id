import type { Email } from "../value-objects/email";

export type IdentityNotification =
  | { readonly kind: "email_verification"; readonly recipient: Email; readonly token: string }
  | { readonly kind: "password_reset"; readonly recipient: Email; readonly token: string };

export interface NotificationPort {
  enqueue(notification: IdentityNotification): Promise<void>;
}
