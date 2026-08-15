import { type NextRequest, NextResponse } from "next/server";

// Placeholder session cookie name. The real name is fixed by the auth chapter
// (Better Auth sets its own cookie); until then this only drives proxy routing.
const SESSION_COOKIE_NAME = "labpics_session";
const LOGIN_PATH = "/auth/login";

/**
 * Navigation-only routing hint at the edge.
 *
 * NO database access here: the proxy runtime must stay dependency-free, so
 * Cookie presence is untrusted and never authorizes protected data. Server/API
 * handlers must verify the session independently before returning such data.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public surface.
  if (pathname === "/" || pathname.startsWith("/auth") || pathname.startsWith("/interaction")) {
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
  const response = NextResponse.next();
  response.headers.set("x-labpics-navigation-hint", "cookie-present-unverified");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
