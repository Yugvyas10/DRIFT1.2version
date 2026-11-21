import type { NextConfig } from "next";
import { parseWebEnv } from "./src/lib/env-schema";

// Fail fast: `next dev`, `next build` and `next start` stop here with a readable error
// when the environment is invalid, instead of starting in a half-configured state.
parseWebEnv(process.env);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Script and style sources need per-request nonces; the full CSP lands with auth in M5 (docs/SECURITY.md).
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  headers: () => Promise.resolve([{ source: "/:path*", headers: securityHeaders }]),
};

export default nextConfig;
