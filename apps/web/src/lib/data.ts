import "server-only";

export interface SessionView {
  userId: string;
  email: string;
}

/**
 * Server-only data access boundary.
 *
 * Placeholder only: DB-backed session loading lands with the auth chapter.
 * The `server-only` import makes accidental use from client components a build
 * error.
 */
export async function getSessionUser(): Promise<SessionView | null> {
  return null;
}
