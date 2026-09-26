# infra — local services

**Owner:** P3 (Tanishq Chavan). Reviewer P4. **Status:** M0 — docker compose for Postgres, Redis and S3-compatible storage.

## Services

| Service        | Image                      | Port (127.0.0.1) | Purpose                             |
| -------------- | -------------------------- | ---------------- | ----------------------------------- |
| `postgres`     | `postgres:18-alpine`       | 5432             | Platform database (M5)              |
| `redis`        | `redis:8.8-alpine`         | 6379             | Queue, pub/sub, rate limits (M6)    |
| `object-store` | `chrislusf/seaweedfs:4.47` | 8333 (S3 API)    | Artifacts; bucket `drift-artifacts` |

```bash
docker compose -f infra/docker-compose.yml up -d --wait   # waits for all healthchecks
docker compose -f infra/docker-compose.yml down           # add -v to delete data
```

Credentials are local-only defaults, overridable in `infra/.env` (see `infra/.env.example`). The S3 endpoint rejects unsigned and wrongly signed requests (HTTP 403), which was checked during M0.

## Questions an examiner might ask

- **Why SeaweedFS and not MinIO?** In September 2026 the `minio/minio` Docker Hub repository returns 404 and the GitHub repository is archived, so there are no maintained images (PLAN risk R8). SeaweedFS is Apache-2.0, actively maintained, and its `mini` mode creates credentials and a bucket from the environment. Code talks only S3, so production can use S3 or R2.
- **Why bind ports to 127.0.0.1?** The defaults are weak by design (local only). Binding to loopback keeps them unreachable from the network.
