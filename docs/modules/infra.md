# infra — local services and hosting

**Owner:** P3 (Tanishq Chavan). Reviewer P4. **Status:** M7+ — docker compose for Postgres, Redis and S3-compatible storage (M0), Jaeger for traces behind a profile (M6), and the hosting setup on Fly.io, Neon and Cloudflare R2 (ADR-0008): written and tested in CI, **not deployed yet**.

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

## Hosting (ADR-0008)

The public instance runs on **Fly.io** (web app and worker), **Neon** (Postgres 18) and **Cloudflare R2** (storage), with **Redis on its own Fly Machine**, all in Singapore.

| File                           | Role                                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`                   | One image for the web app and the worker: dependencies installed and built inside it, Prisma's migration engine fetched at build time, runs as the `node` user. Nothing in it is specific to Fly. |
| `.dockerignore`                | Keeps env files (with real secrets), `.git`, `node_modules`, build output and caches out of every build: `fly deploy` uploads the developer's directory.                                          |
| `fly.toml`                     | Process groups `web` and `worker`, the release command (migrations), the `/healthz` check, one web Machine always running, the non-secret settings.                                               |
| `infra/fly/*.sh`               | The commands of the release step and the two process groups, so CI runs exactly what Fly runs.                                                                                                    |
| `infra/fly/redis/`             | Redis 8.8 (the local version) with a Fly volume, append-only persistence, `noeviction` and a password from a secret, written to a config file rather than the command line. No public service.    |
| `.github/workflows/deploy.yml` | Deploys after CI passes on a push to `master`, or by hand, once `FLY_DEPLOY_ENABLED` is `true` and the `production` environment holds `FLY_API_TOKEN`. Redis is deployed by hand.                 |

CI job `images` builds both images on every PR (with planted `.env` files that must not reach the image) and runs them against the compose services: the release command applies the migrations, the worker's `--check` passes, the web process answers `/healthz`, `/readyz` and `/`; Redis refuses to start without a password, then requires it, keeps every key and keeps the password off its command line.

### First deploy

You need accounts on Fly.io (with a payment method), Neon and Cloudflare, and `flyctl` on your machine. `--remote-only` builds images on Fly's builders: no Docker and no disk space needed locally.

1. **Neon:** create a project in AWS Asia Pacific (Singapore), `aws-ap-southeast-1`, with Postgres 18. Copy the **direct** connection string (the host without `-pooler`) and add `&connect_timeout=15` (Prisma's migration engine gives up after 5 s otherwise, while a sleeping compute wakes up).
2. **R2:** create the bucket `drift-artifacts` with the location hint Asia-Pacific, no public access and no CORS rules. Create an R2 API token with **Object Read & Write on that bucket only**; note its access key id, secret and your account id.
3. **Redis** (steps 3 and 4 in the same terminal: step 4 uses `$REDIS_PASSWORD`):

   ```bash
   cd infra/fly/redis
   fly apps create drift-platform-redis
   fly volumes create redis_data --region sin --size 1 --app drift-platform-redis
   REDIS_PASSWORD=$(openssl rand -hex 32)
   fly secrets set --app drift-platform-redis --stage REDIS_PASSWORD="$REDIS_PASSWORD"
   fly deploy --remote-only
   cd ../../..
   ```

4. **Platform:** from the repository root,

   ```bash
   fly apps create drift-platform
   fly secrets set --app drift-platform --stage \
     DATABASE_URL='postgresql://…neon.tech/neondb?sslmode=require&connect_timeout=15' \
     REDIS_URL="redis://default:$REDIS_PASSWORD@drift-platform-redis.internal:6379?family=6" \
     AUTH_SECRET="$(openssl rand -base64 32)" \
     S3_ENDPOINT='https://<account id>.r2.cloudflarestorage.com' \
     S3_ACCESS_KEY_ID='<R2 access key id>' S3_SECRET_ACCESS_KEY='<R2 secret>'
   fly deploy --remote-only
   ```

   `?family=6`: Fly's private network is IPv6 and ioredis looks up IPv4 by default. If either app name is taken, change `app` in its `fly.toml`, and `APP_URL` or the Redis host to match.

5. **Check it:** `fly logs`; `curl https://drift-platform.fly.dev/readyz` (database, Redis and storage); `fly ssh console --command "/app/infra/fly/worker.sh --check"`; register, create an organisation, a project and a key, then `drift run … --api-url https://drift-platform.fly.dev` and follow it with `curl -N` on its events. Also check, in the logs, the client address the rate limits see (SECURITY T16).
6. **Demo data:** mark an organisation as DEMO and fill it with `demo:seed` (`CLAUDE.md`), with `--api-url https://drift-platform.fly.dev`, `DATABASE_URL` set to the Neon string and an API key from the instance.
7. **Automatic deploys:** in the GitHub repository, create the environment `production` (optionally with required reviewers) holding the secret `FLY_API_TOKEN` (`fly tokens create deploy --app drift-platform`), then set the repository variable `FLY_DEPLOY_ENABLED` to `true`.
8. **Legacy:** take down `driftapi.vercel.app` (PLAN Q4).

Backups: Neon keeps the database's history (point-in-time restore within the plan's window); take Fly volume snapshots for Redis (`fly volumes snapshots`), whose contents are short-lived anyway. Logs: `fly logs` shows both process groups' JSON logs.

## Questions an examiner might ask

- **Why SeaweedFS and not MinIO?** In September 2026 the `minio/minio` Docker Hub repository returns 404 and the GitHub repository is archived, so there are no maintained images (PLAN risk R8). SeaweedFS is Apache-2.0, actively maintained, and its `mini` mode creates credentials and a bucket from the environment. Code talks only S3, so production can use S3 or R2.
- **Why is Jaeger behind a profile?** Tracing is optional (off when no endpoint is set) and Jaeger keeps traces in memory; most local work does not need it.
- **Why bind ports to 127.0.0.1?** The defaults are weak by design (local only). Binding to loopback keeps them unreachable from the network.
- **Why one image for the web app and the worker?** They share the engine, the database client and the platform package, and must run the same version: one build, one release step that migrates once, two commands.
- **What stops a developer's secrets from ending up in the image?** `.dockerignore` excludes every env file, and CI plants `.env` files before building and fails if their contents or any env file appear in the image.
- **Is Redis exposed to the internet?** No. Its Fly app has no service, so only apps of the same Fly organisation reach it, over the private (WireGuard) network, and it requires a 32+ character password.
