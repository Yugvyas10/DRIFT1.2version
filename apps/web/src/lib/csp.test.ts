import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, isProtectedPath } from "./csp";

describe("contentSecurityPolicy", () => {
  it("allows scripts only with the nonce, nothing from other origins, and no framing", () => {
    const csp = contentSecurityPolicy("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic';");
    expect(csp).toContain("style-src 'self' 'nonce-abc123'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toMatch(/https?:\/\/(?!github\.com)/);
  });

  it("relaxes only what development needs", () => {
    const csp = contentSecurityPolicy("abc123", true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });
});

describe("isProtectedPath", () => {
  it("covers /dashboard and /settings and everything under them, and nothing else", () => {
    for (const path of ["/dashboard", "/dashboard/acme", "/settings", "/settings/acme/keys"])
      expect(isProtectedPath(path)).toBe(true);
    for (const path of ["/", "/login", "/register", "/dashboards", "/api/v1/orgs", "/settingsx"])
      expect(isProtectedPath(path)).toBe(false);
  });
});
