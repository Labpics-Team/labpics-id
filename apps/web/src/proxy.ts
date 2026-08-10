import { type NextRequest, NextResponse } from "next/server";

// Placeholder session cookie name. The real name is fixed by the auth chapter
// (Better Auth sets its own cookie); until then this only drives proxy routing.
const SESSION_COOKIE_NAME = "labpics_session";
const LOGIN_PATH = "/auth/login";

/**
 * Auth-aware routing at the edge.
 *
 * NO database access here: the proxy runtime must stay dependency-free, so
 * session state is inferred from the presence of the session cookie only.
 * Anything under a non-public path without the cookie is redirected to the
 * login page.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public surface.
  if (pathname === "/" || pathname.startsWith("/auth")) {
    return NextResponse.next();
  }
  // Assets and API routes pass through.
  if (pathname.startsWith("/_next") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Everything else is treated as protected placeholder surface.
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
