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
  {
    // PLAN M7: product pages show data from the database and the engine, never data written into the code. A
    // module-level array or object of arrays in a product route is how the legacy app faked its results, so it
    // is refused here (vocabulary such as stage names lives in src/lib and comes from @drift/report-schema).
    files: ["src/app/(product)/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...[
          "VariableDeclarator > ArrayExpression.init",
          "VariableDeclarator > TSAsExpression.init > ArrayExpression.expression",
          "VariableDeclarator > TSSatisfiesExpression.init > ArrayExpression.expression",
          "VariableDeclarator > ObjectExpression.init ArrayExpression",
          "VariableDeclarator > TSAsExpression.init > ObjectExpression.expression ArrayExpression",
        ].flatMap((declarator) =>
          [
            `Program > VariableDeclaration > ${declarator}`,
            `Program > ExportNamedDeclaration > VariableDeclaration > ${declarator}`,
          ].map((selector) => ({
            selector,
            message:
              "No module-level data arrays in product pages (PLAN M7): show data from the database or the engine, or move vocabulary to src/lib.",
          }))
        ),
      ],
    },
  },
  { ignores: [".next/**", "next-env.d.ts"] }
);
