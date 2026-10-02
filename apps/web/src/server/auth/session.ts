import { decode, encode } from "next-auth/jwt";
import type { SessionClaims } from "./require-auth";

/** Sessions last a working day (ADR-0007: JWT sessions with a short lifetime). */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/** next-auth's session cookie: `__Secure-` prefixed when the app is served over HTTPS. */
export function sessionCookieName(secure: boolean): string {
  return secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

function cookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

/** The claims DRIFT puts in a session token: the user's id and the `tokenVersion` they signed in with. */
export function sessionToken(claims: SessionClaims): { uid: string; tv: number } {
  return { uid: claims.userId, tv: claims.tokenVersion };
}

/**
 * Reads the session of a request: the next-auth cookie only (an `Authorization` header never carries a session),
 * decrypted and checked for expiry with the app's secret. Returns the claims; `authenticate` then checks them
 * against the database, so the token alone never grants anything.
 */
export function sessionReader(
  secret: string,
  secure: boolean
): (request: Request) => Promise<SessionClaims | undefined> {
  const name = sessionCookieName(secure);
  return async (request) => {
    const token = cookie(request.headers.get("cookie"), name);
    if (token === undefined) return undefined;
    try {
      const claims = await decode({ token, secret });
      if (typeof claims?.uid !== "string" || typeof claims.tv !== "number") return undefined;
      return { userId: claims.uid, tokenVersion: claims.tv };
    } catch {
      return undefined; // forged, expired or made with another secret
    }
  };
}

/** A session token as next-auth would issue it (tests and the end-to-end setup). */
export function issueSessionToken(
  claims: SessionClaims,
  secret: string,
  maxAge = SESSION_MAX_AGE_SECONDS
): Promise<string> {
  return encode({ token: sessionToken(claims), secret, maxAge });
}
