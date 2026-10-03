# infra — local services

**Owner:** P3 (Tanishq Chavan). Reviewer P4. **Status:** M6 — docker compose for Postgres, Redis and S3-compatible storage (M0), and Jaeger for traces behind a profile (M6).

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

## Questions an examiner might ask

- **Why SeaweedFS and not MinIO?** In September 2026 the `minio/minio` Docker Hub repository returns 404 and the GitHub repository is archived, so there are no maintained images (PLAN risk R8). SeaweedFS is Apache-2.0, actively maintained, and its `mini` mode creates credentials and a bucket from the environment. Code talks only S3, so production can use S3 or R2.
- **Why is Jaeger behind a profile?** Tracing is optional (off when no endpoint is set) and Jaeger keeps traces in memory; most local work does not need it.
- **Why bind ports to 127.0.0.1?** The defaults are weak by design (local only). Binding to loopback keeps them unreachable from the network.
