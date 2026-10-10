// @ts-check
// apps/web adds the Next.js, React, hooks and jsx-a11y rules to the root config.
// The root config comes second so its TypeScript parser and type-aware settings win.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import { defineConfig } from "eslint/config";
import rootConfig from "../../eslint.config.mjs";

export default defineConfig(
  nextCoreWebVitals,
  rootConfig,
  { settings: { next: { rootDir: import.meta.dirname } } },
  { ignores: [".next/**", "next-env.d.ts"] }
);
