# @drift/web — dashboard and REST API

**Owners:** UI P1 (Prathamesh Yewale); auth, RBAC and API keys P2 (Yug Vyas). **Status:** M0 — landing page, env validation, security headers.

## What exists (M0)

- **Next.js 16 (App Router) + Tailwind 4.** The design tokens are ported from the legacy app (tag `legacy-v1`) into `src/app/globals.css`: dark navy surfaces, teal primary, cyan accent, and one colour each for BREAKING, RISKY and SAFE.
- **`src/app/page.tsx`, the landing page.** It describes the design, is labelled "In development", and shows no numbers or results. Server-rendered, with no client JavaScript of its own.
- **`src/lib/env-schema.ts`, environment validation.** `next.config.ts` calls it, so `next dev`, `build`, `start` and `typegen` fail fast. `src/env.ts` exposes the validated values to server code.
- **Security headers in `next.config.ts`:** see SECURITY.md T5. The nonce-based CSP comes in M5.

## Run it

```bash
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @drift/web dev   # http://localhost:3000
```

## Known limitations

- Unit coverage measures `src/lib` only. Pages are checked by `next build` (type-checked, pre-rendered) and, from M5, by Playwright.
- The web app's ESLint config runs Next's rules first and the root config second, so the root's TypeScript parser and type-aware settings win.

## Questions an examiner might ask

- **Why validate env in `next.config.ts` rather than lazily?** A missing variable should stop the process at startup with a clear message, not surface as a runtime error on the first request that needs it.
- **Why no full CSP yet?** Next.js hydration uses inline scripts. A strict `script-src` needs per-request nonces from the proxy layer, which arrives with auth in M5. The directives that don't affect scripts are already set.
