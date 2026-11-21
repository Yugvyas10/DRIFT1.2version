import { defineConfig } from "prisma/config";

// The connection string comes from the environment (DATABASE_URL); `prisma generate` and `migrate diff` against
// the schema need none, so it is only read when a command connects.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
