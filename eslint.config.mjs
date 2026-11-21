// @ts-check
// Root ESLint config. Applies to every package; apps/web extends it with Next.js rules.
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Modules the engine must never import directly: I/O goes through injected adapters (PLAN §3.2). */
const CORE_FORBIDDEN_MODULES = [
  "fs",
  "node:fs",
  "fs/promises",
  "node:fs/promises",
  "http",
  "node:http",
  "https",
  "node:https",
  "http2",
  "node:http2",
  "net",
  "node:net",
  "dgram",
  "node:dgram",
  "child_process",
  "node:child_process",
];

export default defineConfig(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/next-env.d.ts",
      "packages/db/src/generated/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // The engine is pure: no network, DB, file system or process access, and deterministic output.
    files: ["packages/core/src/**/*.ts"],
    ignores: ["packages/core/src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: CORE_FORBIDDEN_MODULES.map((name) => ({
            name,
            message: "packages/core must not do I/O directly; accept an adapter instead (PLAN §3.2).",
          })),
          patterns: [
            {
              group: ["pg", "ioredis", "bullmq", "@prisma/*", "@aws-sdk/*", "next", "next/*", "react", "react-dom"],
              message: "packages/core must stay free of infrastructure and UI dependencies (PLAN §3.2).",
            },
            {
              group: [
                "@drift/cli",
                "@drift/github-action",
                "@drift/db",
                "@drift/platform",
                "@drift/bench",
                "@drift/web",
                "@drift/worker",
              ],
              message: "packages/core may depend only on @drift/report-schema and @drift/rules (PLAN §3.2).",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Engine output must be deterministic; use a seeded generator (ADR-0006).",
        },
      ],
    },
  },
  {
    // The contract packages sit below the engine and must not depend on anything above them.
    files: ["packages/report-schema/src/**/*.ts", "packages/rules/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@drift/core",
                "@drift/cli",
                "@drift/github-action",
                "@drift/db",
                "@drift/platform",
                "@drift/bench",
              ],
              message: "report-schema and rules are leaf packages (PLAN §3.2).",
            },
          ],
        },
      ],
    },
  }
);
