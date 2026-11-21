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
];

// Pages get their Content-Security-Policy, with a per-request nonce, from src/proxy.ts. The API serves JSON only,
// so it gets the strictest policy there is.
const apiHeaders = [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Prisma's driver and the AWS SDK are loaded from node_modules at run time, not bundled.
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  // A stage re-run from the browser may carry a traffic file of up to 25 MiB (MAX_BROWSER_UPLOAD_BYTES), through
  // src/proxy.ts, which buffers request bodies.
  experimental: { serverActions: { bodySizeLimit: "26mb" }, proxyClientMaxBodySize: "26mb" },
  headers: () =>
    Promise.resolve([
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: apiHeaders },
    ]),
};

export default nextConfig;
