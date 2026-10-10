# Handoff: hosting and deployment state (as of 2026-10-10)

What is decided and committed lives in [ADR-0008](../adr/0008-hosting.md), [ADR-0009](../adr/0009-azure-container-apps.md) and the deploy guide in [`docs/modules/infra.md`](../modules/infra.md). This note holds what is **not** in those files: the state of the accounts, open decisions, the dependency fix of 2026-10-10, and the facts gathered while choosing a host. It contains no secrets.

## 1. Where things stand

- **Branches and PRs** (`Yugvyas10/DRIFT1.2version`): #1–#10 are all open and stacked (#1 `rebuild/m0-foundations` → `master`, each next one on the previous). Merge from #1 upwards. The top four:
  - #7 `rebuild/m6-worker` → `rebuild/m5-platform` (M6, awaiting review; Auto-fix on);
  - #8 `rebuild/m7-ui` → `rebuild/m6-worker` (M7, **approved by P4 on 2026-10-04**, not merged; Auto-fix on);
  - #9 `rebuild/hosting` → `rebuild/m7-ui` (ADR-0008);
  - #10 `rebuild/deploy` → `rebuild/hosting` (Azure: images, Bicep, deploy script, ADR-0009). Auto-fix is **not** on; P4 was asked and hasn't answered.
- **This workspace** (`/Users/pruthvig/DRIFT_Master_Version`) is a clone of `rebuild/deploy` (cloned at `fdd6dab`, before the dependency fix). The old checkout (`~/Downloads/DRIFT1.2version`) was deleted on 2026-10-10.
- **Nothing is deployed.** No Azure resources exist yet, no images have been published (no `images-*` tag was pushed), and no Fly apps were created.

## 2. Accounts set up by P4 (Pruthvi)

| Service                       | State                                                                                                                                                                                                                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Neon**                      | Project created in **AWS Asia Pacific (Singapore), `aws-ap-southeast-1`**. Only the **Postgres database** service is enabled.                                                                                                     | Object storage, Functions, AI gateway and Neon Auth are off on purpose (R2 does storage; next-auth does sign-in). Advised to choose **Postgres 18**; not confirmed in chat. P4 holds the **direct** (non-`-pooler`) connection string with `&connect_timeout=15` in an **offline file outside the repository**. It goes only into `DATABASE_URL` for `deploy.sh`, and the file should be deleted afterwards. |
| **Cloudflare R2**             | Walked through creating bucket **`drift-artifacts`**: location hint Asia-Pacific, Standard storage class, no public access, no CORS. Also an **Account API token** with **Object Read & Write** on that bucket only, TTL forever. | P4 moved on to the next step, so presumably done; confirm. P4 holds the account id (endpoint `https://<account id>.r2.cloudflarestorage.com`), the access key id and the secret, which Cloudflare shows only once.                                                                                                                                                                                           |
| **Fly.io**                    | `flyctl` installed (Homebrew) and logged in to P4's personal organisation. **No apps, volumes or secrets created; no card added.**                                                                                                | Abandoned: Fly's trial is 2 h of Machine runtime or 7 days, and there's no free tier after it. `brew uninstall flyctl` is optional.                                                                                                                                                                                                                                                                          |
| **Azure for Students**        | Chosen 2026-10-08 (ADR-0009). **Activation not confirmed;** no resource group yet.                                                                                                                                                | $100 a year, no card; full-time university students; the subscription is disabled, not billed, when the credit runs out. Needed for about **2 months of 24/7**.                                                                                                                                                                                                                                              |
| **GitHub container registry** | No packages yet.                                                                                                                                                                                                                  | After the first publish, `ghcr.io/yugvyas10/drift-platform` and `drift-redis` are private by default. Either **Yug** (the repository owner) makes both public (recommended; CI checks the images hold no secrets), or P4 creates a classic token with only `read:packages` and exports `GHCR_USERNAME`/`GHCR_TOKEN` for `deploy.sh`.                                                                         |

## 3. Fixed 2026-10-10: `pnpm audit` failures across the stack

CI run `37802921928` (PR #10, commit `fdd6dab`, 2026-10-08) failed only on `pnpm audit --prod --audit-level high`; typecheck, lint, tests, build and every other job passed. It reported three high advisories, all published after the dependencies were pinned and present on **every** branch of the stack:

| Package                | Problem                                                         | Fixed in   |
| ---------------------- | --------------------------------------------------------------- | ---------- |
| `next` (pinned 16.3.6) | Server-side request forgery in Image Optimization               | `>=16.3.8` |
| `sharp` (via Next)     | librsvg vulnerability, CVE-2026-96889                           | `>=0.35.5` |
| `source-map-js`        | Event-loop denial of service through source-map section offsets | `>=1.2.2`  |

**The fix:**

- **Commit `388d4f8` on `rebuild/m0-foundations`** (PR #1): `next` and `eslint-config-next` move to 16.3.8. `sharp` (Next allows `^0.35.4`) and `source-map-js` are updated within their existing ranges, so no overrides are needed. `pnpm audit --prod` then reports no known vulnerabilities at any level.
- **Merged up the stack** branch by branch, from M1 to `deploy`:
  - each merge keeps the branch's own `apps/web/package.json` (M5 conflicted only on neighbouring lines);
  - the lockfile is re-resolved, not text-merged;
  - each branch was checked for `next@16.3.8`, `sharp@0.35.5` and `source-map-js@1.2.2`, a clean audit and a frozen-lockfile install.
- **What each branch changed** compared with GitHub: only `apps/web/package.json` and `pnpm-lock.yaml`. Each PR's own diff is unchanged (checked for PR #2).
- **Local results:** the full check passed on M0 (24/24 tasks) and on `deploy` (40/40); CI runs on every PR after the push.

## 4. Open decisions (P4 to answer)

1. **Auto-fix on PR #10?** Asked, not answered.
2. **Publish the images:** push a tag, e.g. `git tag images-azure-1 && git push origin images-azure-1`, at the commit to deploy. I offered to do it once CI is green; that needs P4's go-ahead. Publish a commit that has the dependency fix, not `fdd6dab`.
3. **Image access:** packages made public by Yug, or P4's `read:packages` token.
4. **API contract version:** the dogfood comment on PR #8 recommends a minor bump of `apps/web/openapi/drift-api.yaml` (0.3.0 → 0.4.0) for the additive run-list filters. Offered, not answered.
5. **Who runs operations** (P3 suggested in the ADRs) and who watches the budget alert.
6. **Invite-only registration** before the public URL is shared widely (SECURITY T40; not built).

## 5. The deploy, in one place

The full guide is in `docs/modules/infra.md` ("First deploy"). In short:

1. Make sure PR #10's CI is green (it has the dependency fix since 2026-10-10).
2. Publish the images (an `images-*` tag now; pushes to `master` after the stack merges).
3. Make the packages pullable (see section 2).
4. Sign in and prepare the subscription: `az login`, select the Azure for Students subscription, register `Microsoft.App` and `Microsoft.OperationalInsights`, then `az group create --name drift-demo --location southeastasia`.
5. Export the settings: `DATABASE_URL`, `S3_SECRET_ACCESS_KEY` and `AUTH_SECRET` (with `read -rs`), and `S3_ENDPOINT` and `S3_ACCESS_KEY_ID`. Generate `AUTH_SECRET` once and keep it, because a new one signs everybody out.
6. Run `infra/azure/deploy.sh drift-demo`. It deploys the environment and the migration job, waits for the migrations, then deploys the app, and prints the URL.
7. Add a **$40/month budget alert** (Cost Management → Budgets).
8. Verify: `/readyz`; the worker's `--check` through `az containerapp exec`; a real `drift run` with `curl -N` on its events; R2 path-style requests; Neon cold starts; the worker's memory; the client IP the rate limits see.
9. When the demo ends: `az group delete --name drift-demo --yes`. Then take down the legacy `driftapi.vercel.app` (PLAN Q4).

Use **Azure Cloud Shell** (nothing to install) or `brew install azure-cli`. Images are never built on the laptop: disk space is tight, and CI builds them.

## 6. Facts gathered while choosing (2026-10-08)

**Prices.** Azure list prices for Singapore (`southeastasia`), from the public Retail Prices API, in USD:

| Item                                                | Price                                               |
| --------------------------------------------------- | --------------------------------------------------- |
| Container Apps vCPU, active                         | 0.000034 / s                                        |
| Container Apps vCPU, idle                           | 0.000004 / s                                        |
| Container Apps memory (active and idle)             | 0.000004 / GiB-s                                    |
| Requests                                            | 0.40 / million                                      |
| VM `B1s` / `B1ms` / `B2ats v2` / `B2pts v2` / `B2s` | 0.0132 / 0.0264 / 0.0118 / 0.0106 / 0.0528 per hour |
| Standard static public IPv4                         | 0.005 / h                                           |
| E4 standard SSD disk                                | 2.40 / month                                        |
| Log Analytics ingestion                             | first 5 GB a month free, then 2.99 / GB             |

The Container Apps free grant is 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests a month per subscription.

**Cost estimate for our app** (web 0.5 vCPU/1 GiB, worker 0.5/1 GiB, Redis 0.25/0.5 GiB, always on, mostly idle): about $29–37 a month, so two months fit in the $100 credit. A 2 GB VM (`B1ms`) would cost about $25 a month.

**Container Apps facts that shaped the design:**

| Fact                                                                                                                         | Consequence                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| TCP ingress between apps needs a custom virtual network.                                                                     | Redis became a **sidecar** on 127.0.0.1 instead of its own app.             |
| Default health probes are added only to the main (first) container.                                                          | `web` comes first and gets explicit `/healthz` startup and liveness probes. |
| A Consumption-only environment allows at most 2 vCPU / 4 GiB per app, and the containers' total must be a valid combination. | Ours totals 1.25 / 2.5 GiB.                                                 |
| HTTP requests end after 240 s.                                                                                               | Event streams reconnect with `Last-Event-ID`.                               |
| The ingress passes only the client's IP in `X-Forwarded-For`.                                                                | The rate limits read the last entry, which is the right one.                |
| Images must be `linux/amd64`, at most 8 GB per replica.                                                                      | Our platform image is 1.3 GB (from the CI log).                             |

**Prisma and Neon:**

- Prisma's migration engine honours `connect_timeout` (its default is 5 s). node-postgres ignores it and waits without a timeout.
- `pg` warns that `sslmode=require` will change meaning in pg 9. Keep Neon's string as given.
- Prisma's engine needs `openssl` in the image (installed) and is fetched at build time.

**Free hosts we rejected:**

| Host               | Why not                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Render             | No free background workers; free web services sleep after 15 minutes.                                                               |
| Koyeb              | One free web service only; it sleeps after an hour; reportedly needs a card since February 2026; being acquired by Mistral.         |
| Cloud Run          | Needs a billing account.                                                                                                            |
| Oracle Always Free | Now 2 OCPU / 12 GB on A1; needs card verification; idle instances may be reclaimed (under 20% CPU, network and memory over 7 days). |

## 7. Local environment notes (this Mac)

- **Disk is tight.** On 2026-10-03, P4 deleted the Claude desktop app's `vm_bundles` (about 11 GB), which left about 13–14 GB free. Don't build Docker images locally.
- **Docker Desktop** may be stopped. If its backend hangs after a full disk (`open -a Docker` fails with error -1712), stop the `com.docker.backend` processes (SIGKILL if needed; P4 approved this once), then `open -a Docker`.
- **Node 24 isn't the default `node` in non-interactive shells.** Put `/Users/pruthvig/Library/Application Support/Herd/config/nvm/versions/node/v24.21.0/bin` first on `PATH`.
- **Validating the Bicep template without Azure:** download the Bicep CLI (`https://github.com/Azure/bicep/releases/latest/download/bicep-osx-arm64`, about 111 MB) to a temporary folder and run `bicep build infra/azure/main.bicep`.
- **Local data from the M7 checks** lives in the Docker compose volumes (project `drift`), not in the checkout:
  - organisation `m6-demo-01266` (DEMO-flagged) with project `petstore`, about a dozen runs, a project policy `failOn: risky` and one suppression (change `760d32eee71daae3`);
  - organisation `local-check`.

  The local test account's password was in a temporary folder that has since been cleared, so register a new local account if needed.
