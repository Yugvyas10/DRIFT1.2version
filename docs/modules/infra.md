# infra — local services and hosting

**Owner:** P3 (Tanishq Chavan). Reviewer P4. **Status:** M7+ — docker compose for Postgres, Redis and S3-compatible storage (M0), Jaeger for traces behind a profile (M6), and the hosting setup on Azure Container Apps, Neon and Cloudflare R2 (ADR-0008, ADR-0009): written and tested in CI, **not deployed yet**.

## Services

| Service        | Image                         | Port (127.0.0.1)        | Purpose                                               |
| -------------- | ----------------------------- | ----------------------- | ----------------------------------------------------- |
| `postgres`     | `postgres:18-alpine`          | 5432                    | Platform database (M5)                                |
| `redis`        | `redis:8.8-alpine`            | 6379                    | Queue, pub/sub, rate limits (M6)                      |
| `object-store` | `chrislusf/seaweedfs:4.47`    | 8333 (S3 API)           | Artifacts; bucket `drift-artifacts`                   |
| `jaeger`       | `jaegertracing/jaeger:2.21.0` | 4318 (OTLP), 16686 (UI) | Traces; only with `--profile tracing`, kept in memory |

```bash
docker compose -f infra/docker-compose.yml up -d --wait   # waits for all healthchecks
docker compose -f infra/docker-compose.yml down           # add -v to delete data
docker compose -f infra/docker-compose.yml --profile tracing up -d --wait   # also Jaeger: http://localhost:16686
```

With Jaeger running, set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` in `apps/web/.env.local` and `apps/worker/.env`. A server-side run then shows as one trace: the web request, the worker's `run` span and one span per stage.

Credentials are local-only defaults, overridable in `infra/.env` (see `infra/.env.example`). The S3 endpoint rejects unsigned and wrongly signed requests (HTTP 403), which was checked during M0.

## Hosting (ADR-0008, ADR-0009)

The public instance runs on **Azure Container Apps** (web app, worker and a Redis sidecar, on the Azure for Students credit), **Neon** (Postgres 18) and **Cloudflare R2** (storage), all in Singapore. At Azure's list prices it costs about $29–37 a month, so the $100 credit covers the planned two months.

| File                           | Role                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Dockerfile`                   | One image for the web app, the worker and the migrations: built inside the image, Prisma's migration engine fetched at build time, runs as the `node` user, pinned by digest.                                            |
| `.dockerignore`                | Keeps env files (with real secrets), `.git`, `node_modules`, build output and caches out of any build.                                                                                                                   |
| `infra/container/*.sh`         | The commands of the web and worker containers and of the migration job, so CI runs exactly what Azure runs.                                                                                                              |
| `infra/container/redis/`       | Redis 8.8 as a sidecar: bound to 127.0.0.1, `noeviction`, no persistence, a password from a secret written to a config file rather than the command line.                                                                |
| `infra/azure/main.bicep`       | The resource group's contents: a Log Analytics workspace (capped below its free 5 GB a month), a Consumption-only environment, the migration job and the app (web + worker + Redis, one replica, 1.25 vCPU and 2.5 GiB). |
| `infra/azure/deploy.sh`        | Deploys in order: environment and job with the new image, the migrations (waited on; a failure stops here), then the app. Secrets come from the environment and reach Azure in a parameters file only you can read.      |
| `.github/workflows/images.yml` | Publishes both images to `ghcr.io/<owner>/drift-platform` and `drift-redis`, tagged with the commit SHA, on pushes to `master` and on `images-*` tags.                                                                   |

CI job `images` builds both images on every PR, with planted `.env` files that must not reach the image, and runs them against the compose services:

- the migration script migrates;
- the worker's `--check` passes, also against the Redis sidecar on the loopback with its password, as in Azure;
- the web process answers `/healthz`, `/readyz` and `/`;
- Redis refuses to start without a password, then requires it, keeps every key and keeps the password off its command line;
- the Azure template compiles without warnings.

### First deploy

You need:

- an **Azure for Students** subscription (azure.microsoft.com/free/students, with the university email);
- the Neon connection string (step 1 of ADR-0008's setup: direct, with `&connect_timeout=15`);
- the R2 account id, access key id and secret.

Run the commands either in **Azure Cloud Shell** (Bash, in the browser: nothing to install; clone the repository there) or locally with the Azure CLI (`brew install azure-cli`).

1. **Publish the images** for the commit you deploy. Pushes to `master` do it automatically; for a branch, push a tag and wait for the **Images** workflow:

   ```bash
   git tag images-azure-1 && git push origin images-azure-1
   ```

2. **Let Azure pull them.** Either make both packages public (the repository owner: GitHub → Packages → `drift-platform` and `drift-redis` → Package settings → Change visibility → Public; the images hold no secrets, which CI checks), or create a classic GitHub token with only `read:packages` and export `GHCR_USERNAME` (your GitHub login) and `GHCR_TOKEN` in step 4.
3. **Sign in and create the resource group:**

   ```bash
   az login
   az account set --subscription "Azure for Students"
   az provider register --namespace Microsoft.App --wait
   az provider register --namespace Microsoft.OperationalInsights --wait
   az group create --name drift-demo --location southeastasia
   ```

4. **Settings**, in the same shell. `read -rs` keeps secrets off the screen and out of the shell history; paste, then press Enter:

   ```bash
   read -rs DATABASE_URL && export DATABASE_URL
   read -rs S3_SECRET_ACCESS_KEY && export S3_SECRET_ACCESS_KEY
   read -rs AUTH_SECRET && export AUTH_SECRET     # first time: openssl rand -base64 32, and keep it
   export S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
   export S3_ACCESS_KEY_ID=<R2 access key id>
   ```

   Keep `AUTH_SECRET` in a password manager: every deploy needs the same value, and a new one signs everybody out.

5. **Deploy** the commit whose images you published (default: the checked-out commit):

   ```bash
   infra/azure/deploy.sh drift-demo
   ```

   It prints the URL (`https://drift.<environment domain>`) once `/healthz` answers.

6. **Budget:** Azure portal → Cost Management → Budgets → Add: the Azure for Students subscription, $40 a month, email alerts at 80% and 100%.
7. **Check it:**
   - `curl <url>/readyz` checks the database, Redis and storage;
   - `az containerapp exec --name drift --resource-group drift-demo --container worker --command "/app/infra/container/worker.sh --check"`;
   - register, create an organisation, a project and a key, then run `drift run … --api-url <url>` and follow it with `curl -N` on its events;
   - logs: `az containerapp logs show --name drift --resource-group drift-demo --container web --follow`.
8. **Demo data:** mark an organisation as DEMO and fill it with `demo:seed` (`CLAUDE.md`), with `--api-url <url>`, `DATABASE_URL` set to the Neon string and an API key from the instance.
9. **Later deploys:** publish the images for the new commit, then run `deploy.sh` again with the same settings. Redis restarts with every deploy, so deploy when no run is in progress.
10. **When the demo ends:** `az group delete --name drift-demo --yes` removes everything Azure bills for. Take down the legacy `driftapi.vercel.app` once the new instance is live (PLAN Q4).

## Questions an examiner might ask

- **Why SeaweedFS and not MinIO?** In September 2026 the `minio/minio` Docker Hub repository returns 404 and the GitHub repository is archived, so there are no maintained images (PLAN risk R8). SeaweedFS is Apache-2.0, actively maintained, and its `mini` mode creates credentials and a bucket from the environment. Code talks only S3, so production can use S3 or R2.
- **Why is Jaeger behind a profile?** Tracing is optional (off when no endpoint is set) and Jaeger keeps traces in memory; most local work does not need it.
- **Why bind ports to 127.0.0.1?** The defaults are weak by design (local only). Binding to loopback keeps them unreachable from the network.
- **Why one image for the web app, the worker and the migrations?** They share the engine, the database client and the platform package, and must run the same version: one build, a migration job that runs once per deploy, two long-running commands.
- **What stops a developer's secrets from ending up in the image?** `.dockerignore` excludes every env file, and CI plants `.env` files before building and fails if their contents or any env file appear in the image.
- **Is Redis exposed to the internet?** No. It is a sidecar bound to 127.0.0.1, which only the containers of the same replica share; it has no ingress, and it still requires a 32+ character password, new on every deploy.
- **Why not Fly.io, as first decided?** Fly needs a card after a short trial; Azure for Students covers the planned two months without one (ADR-0009).
