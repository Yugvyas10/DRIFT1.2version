/**
 * The Content-Security-Policy of every page (SECURITY T6). Scripts run only with the per-request nonce
 * (`strict-dynamic` lets Next.js's own loader add its chunks); nothing is loaded from other origins; the page
 * cannot be framed. In development React needs `eval` for its error overlay, and Next.js injects styles inline.
 */
export function contentSecurityPolicy(nonce: string, development: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    development ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://github.com",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}

/** Pages that need a signed-in user (PLAN M5). The pages check the database too; this only saves a render. */
export function isProtectedPath(pathname: string): boolean {
  return /^\/(dashboard|settings)(\/|$)/.test(pathname);
}
