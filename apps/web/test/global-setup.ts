import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GenericContainer, Wait } from "testcontainers";
import type { TestProject } from "vitest/node";

const BUCKET = "drift-artifacts";

/**
 * Integration tests run against a real Postgres and a real S3-compatible store (SeaweedFS, as in
 * infra/docker-compose.yml), started here in throw-away containers on random ports (PLAN M5: Testcontainers).
 * The schema is applied with the committed migrations, so the tests also prove the migrations work.
 */
export default async function setup(project: TestProject) {
  const [postgres, objectStore] = await Promise.all([
    new GenericContainer("postgres:18-alpine")
      .withEnvironment({ POSTGRES_USER: "drift", POSTGRES_PASSWORD: "integration-test", POSTGRES_DB: "drift" })
      .withExposedPorts(5432)
      // Postgres logs this once during initialisation and again when it is really ready.
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start(),
    new GenericContainer("chrislusf/seaweedfs:4.47")
      .withCommand(["mini", "-dir=/data", `-bucket=${BUCKET}`])
      .withEnvironment({ AWS_ACCESS_KEY_ID: "drift", AWS_SECRET_ACCESS_KEY: "integration-test" })
      .withExposedPorts(8333)
      .withWaitStrategy(Wait.forHttp("/healthz", 8333))
      .start(),
  ]);
  const databaseUrl = `postgresql://drift:integration-test@${postgres.getHost()}:${String(postgres.getMappedPort(5432))}/drift`;
  const prisma = (...args: string[]) =>
    execFileSync("pnpm", ["exec", "prisma", ...args], {
      cwd: fileURLToPath(new URL("../../../packages/db/", import.meta.url)),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });
  prisma("migrate", "deploy");
  // The migrated database must be exactly what schema.prisma describes: a schema change without a migration
  // (or the reverse) makes this exit non-zero and fails the run.
  prisma("migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code");
  project.provide("databaseUrl", databaseUrl);
  project.provide("s3", {
    endpoint: `http://${objectStore.getHost()}:${String(objectStore.getMappedPort(8333))}`,
    region: "us-east-1",
    bucket: BUCKET,
    accessKeyId: "drift",
    secretAccessKey: "integration-test",
  });
  return async () => {
    await Promise.all([postgres.stop(), objectStore.stop()]);
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
    s3: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string };
  }
}
