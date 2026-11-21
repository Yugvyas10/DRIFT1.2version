# ADR-0008: Hosting on Fly.io, Neon and Cloudflare R2

Status: Accepted (2026-10-04; the Redis host, Decision 4, on 2026-10-05)
Date: 2026-10-04
Owner: P4 (decision). Operations owner to be agreed; P3 is suggested, as the owner of the database, storage and worker.

## Context

PLAN Q13 left public hosting open ("local `docker compose` is enough for the definition of done"). It was due by M6 and is still open after M7. Three things now need a hosted instance:

- **M8's GitHub App** receives webhooks, which needs a public HTTPS address.
- **One shared demo** for the team and examiners, so that nobody has to run Docker to show DRIFT.
- **The legacy deployment** (`driftapi.vercel.app`, INVENTORY §5) should be replaced and taken down (PLAN Q4).

The platform has five parts:

1. the Next.js web app (pages, REST API, SSE);
2. the BullMQ worker (a long-running process that runs the engine in piscina threads);
3. Postgres 18;
4. Redis (queue, run events, rate limits);
5. S3-compatible object storage.

Risk R11 already rules out plain serverless hosting: SSE streams stay open for minutes, and the worker must run all the time.

Hosting does not shrink the developers' machines: they still build and test the code. That problem is handled separately (Consequences).

## Decision

1. **Fly.io runs the web app and the worker.**
   - One Fly app, built from one image.
   - Two process groups: `web` (`next start`) and `worker` (`node apps/worker/dist/main.js`). The `http_service` attaches to `web` only.
   - **Migrations run as the `release_command`** (`prisma migrate deploy`). Fly runs it in a temporary Machine with the new image and the app's secrets, before any Machine is updated. If it fails, the deploy stops, so code never runs against an unmigrated database.
   - **The Fly health check is `/healthz`, not `/readyz`.** `/readyz` queries Postgres, so a check every few seconds would keep Neon's compute awake and spend its compute hours. `/readyz` stays for manual checks and for `drift-worker --check`.
   - **`web` keeps one Machine running** (`min_machines_running = 1`), so a demo doesn't wait for a cold start. The `worker` group has no service, so the proxy never stops it.
   - **SSE:** the existing 15-second heartbeat (ADR-0004) keeps Fly's proxy from treating an open event stream as idle.
2. **Neon hosts Postgres 18.**
   - **The app connects with the direct (unpooled) connection string.** The web app and worker are long-lived processes with small node-postgres pools, not serverless functions, so they don't need Neon's pooler. Prisma's migrations need the direct connection anyway, so one `DATABASE_URL` serves both.
   - **The URL carries `connect_timeout=15`.** Waking a compute that has scaled to zero takes a few seconds (Neon's docs). Prisma's migration engine reads this parameter, and its default of 5 seconds could fail the `release_command` against a sleeping database. node-postgres ignores the parameter and waits for the connection.
   - If the number of Machines grows, switch the runtime to the `-pooler` host and keep the direct string for the `release_command`.
3. **Cloudflare R2 stores artifacts and the stage cache.**
   - **One bucket, `drift-artifacts`, with the `apac` location hint** (best effort, not a guarantee).
   - **Endpoint and region:** `https://<account>.r2.cloudflarestorage.com`, region `auto`.
   - **Credentials:** an API token limited to object read and write on that one bucket.
   - **The S3 client is unchanged.** `createS3Store` already sends checksums only when required (`requestChecksumCalculation: "WHEN_REQUIRED"`), and the server verifies SHA-256 itself (SECURITY T29).
   - **Pre-signed URLs:** R2 supports pre-signed GET and PUT on the S3 endpoint (not on custom domains), up to 7 days. We keep our 15- and 5-minute expiries (T14).
   - **No CORS rules:** no browser calls the bucket with `fetch`. The CLI and the Action PUT from outside a browser, the run pages redirect to signed GET URLs (a navigation, not a cross-origin request), and browser uploads go through a server action.
4. **Redis: Redis 8.8 on its own Fly Machine** (accepted 2026-10-05).
   - **Setup:** the same image as local development, a Fly volume for its data, `appendonly yes`, `maxmemory-policy noeviction` (BullMQ needs it) and a password.
   - **Reachable only on the Fly organisation's private network** (`<redis-app>.internal`, IPv6, encrypted between Fly hosts). It has no public service. ioredis looks up IPv4 addresses by default, so `REDIS_URL` ends in `?family=6`.
   - The managed alternative is Upstash on Fly. Fly's own documentation advises a fixed-price plan rather than pay-per-request for BullMQ, because BullMQ polls continuously.
   - **Chosen over Upstash:** our own Redis costs one small Machine and a volume, and behaves exactly like local development. The price is that we operate it ourselves: upgrades, and the volume's snapshots for backup. The queue and the event history are short-lived, so losing them loses in-flight runs, not stored results (those are in Postgres and R2).
5. **Regions: Singapore for all three:**
   - Fly `sin`;
   - Neon `aws-ap-southeast-1`;
   - R2 `apac`.

   Neither Fly nor Neon has an Indian region today. Keeping all three in Singapore keeps the database and storage close to the processes that call them on every request.

6. **Configuration** lives in Fly secrets:
   - `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`;
   - `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`;
   - `GITHUB_ID`/`GITHUB_SECRET` when an OAuth app exists.

   `APP_URL` is the public `https://` address. The env validation (T4) refuses to start without the required values. Nothing is committed.

7. **Deploys:**
   - **By hand** (`fly deploy --remote-only`) until the first release works. The image is built on Fly's builders, so a deploy needs no Docker and no disk space on the laptop.
   - **Then from GitHub Actions**, on `master` after CI passes, with a deploy token scoped to the app and the Fly action pinned to a commit SHA (T3).
8. **The public instance holds demo data only** (a DEMO organisation, PLAN Q12) until the team decides otherwise.

## Alternatives considered

- **Vercel for the web app** (where the legacy app ran). It can't run the worker, and function time limits cut SSE streams (R11). The worker would still need another host, and runs would cross two providers.
- **Render, Railway or Google Cloud Run.** All can run both processes. Fly was chosen by the team. It has a Singapore region, runs migrations as a release step with the new image, and runs both process groups from one image in one config file.
- **Fly Managed Postgres.** It would keep everything with one provider. The team chose Neon, which offers a free tier, scale-to-zero and branching (a database branch per preview deploy later).
- **AWS S3 instead of R2.** Equivalent through the S3 API. R2 has no egress fees, which matters when the stage cache and reports are read back often.
- **One VM running `docker compose`.** It would be the closest copy of local development, with the least new work. But we would also own the OS, TLS and backups for the database and storage.

## Consequences

- **R11 is resolved:** both processes run all the time on Fly.
- **M8 gets its public webhook URL.**
- The legacy `driftapi.vercel.app` can be taken down once the new instance is live.
- **Changes in the repository (the deploy PR):**
  - a Dockerfile (multi-stage, building only the web app, the worker and their packages);
  - `fly.toml` with the two process groups, the release command and the health check;
  - the Redis Machine's config;
  - a deploy workflow;
  - `docs/modules/infra.md`;
  - SECURITY entries for the public instance;
  - the `fly` commands in `CLAUDE.md`.

  No application code changes are expected. The S3 client, the health endpoints, the SSE heartbeat and the env validation are already in place.

- **To verify on the first deploy:**
  - the integration of R2 with path-style requests (our client sets `forcePathStyle`);
  - the client address Fly writes into `X-Forwarded-For`, which the rate limits use (T16);
  - SSE through Fly's proxy with `curl -N`;
  - `drift-worker --check` against the hosted database, Redis and storage.
- **Costs:**
  - Fly needs a payment method on the account.
  - Neon's and R2's free tiers have limits.
  - Whose account pays is the team's decision. Check current pricing before the first deploy; no numbers are recorded here because they change.
- **Exposure:** a public instance with open registration lets anyone create an account and store contracts. The rate limits (T16) apply. An invite-only switch for registration should be considered before the URL is shared widely.
- **Local development is unchanged.** To use less disk on a laptop, developers can leave the integration and end-to-end tests to CI (they run on every PR) and run only `pnpm turbo run typecheck lint test` locally, which needs no Docker.

## Questions an examiner might ask

- **Why not deploy the whole thing on Vercel?** The worker is a long-running process and the event streams last minutes. Serverless functions are stopped after a time limit, so the queue would stop and live runs would disconnect (risk R11).
- **How do you stop a deploy from breaking the database?** Migrations run first, in a temporary Machine with the new image; if they fail, nothing is updated. So far every migration has been additive, and CI checks the migrations against the schema (`migrate diff`).
- **Doesn't Neon's scale-to-zero break the app?** The first query after an idle period waits for the compute to wake up (a few seconds, within `connect_timeout=15`). The health check avoids the database so that it doesn't keep the compute awake.
- **Why no CORS on the bucket?** Nothing in a browser calls the bucket with `fetch`: the browser only follows redirects to signed URLs, and uploads go through the server. Without CORS rules, other sites' scripts can't use the bucket from a browser either.
- **Where do secrets live?** In Fly secrets, available to the processes and the release Machine as environment variables. They are never in the repository or the image, and the logs never print them (T17).
- **Why Singapore when the team is in India?** Neither Fly nor Neon offers an Indian region. Putting the processes, the database and storage in the same place matters more than the distance to the browser, because every request makes several database and storage calls but only one browser round trip.
