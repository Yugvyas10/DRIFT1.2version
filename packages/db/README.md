# @drift/db

Prisma schema, migrations and client for the DRIFT platform (Postgres).

```bash
pnpm --filter @drift/db run build            # prisma generate + tsc
DATABASE_URL=postgresql://drift:drift-local-only@localhost:5432/drift \
  pnpm --filter @drift/db run migrate:deploy # apply the committed migrations
pnpm --filter @drift/db run migrate:check    # exit 2 if the database differs from schema.prisma
```

- `prisma/schema.prisma`: the data model. `prisma/migrations/`: the SQL that creates it, including the trigger that makes `AuditLog` append-only.
- `src/client.ts`: `createDb(connectionString)`, a Prisma client over node-postgres. `src/ids.ts`: `newId(kind)`, application-generated ids such as `run_…`.
- The generated client (`src/generated/`) is not committed; the build generates it.

Owner: P3 — Tanishq Chavan. Module documentation: [`docs/modules/db.md`](../../docs/modules/db.md).
