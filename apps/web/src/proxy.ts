import { decode } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, isProtectedPath } from "@/lib/csp";

/**
 * Runs before every page (not the API, not static files):
 * 1. sends visitors without a valid session cookie away from /dashboard and /settings to /login;
 * 2. sets the Content-Security-Policy with a fresh nonce.
 *
 * The cookie check here is cryptographic only (is this a token we issued, and unexpired?). Each protected page
 * then authenticates against the database (deleted user, raised tokenVersion, membership), so this redirect is
 * a convenience, never the access control.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (isProtectedPath(request.nextUrl.pathname) && !(await hasSession(request))) {
    const login = new URL("/login", request.url);
    login.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

async function hasSession(request: NextRequest): Promise<boolean> {
  const secure = (process.env.APP_URL ?? "").startsWith("https://");
  const token = request.cookies.get(secure ? "__Secure-next-auth.session-token" : "next-auth.session-token")?.value;
  const secret = process.env.AUTH_SECRET;
  if (token === undefined || secret === undefined) return false;
  try {
    return typeof (await decode({ token, secret }))?.uid === "string";
  } catch {
    return false;
  }
}

export const config = {
  matcher: [
    {
      // Everything except the API, Next.js's static files and the health checks.
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|healthz|readyz).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
