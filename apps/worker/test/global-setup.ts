import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GenericContainer, Wait } from "testcontainers";
import type { TestProject } from "vitest/node";

const BUCKET = "drift-artifacts";

/**
 * The worker's integration tests run against a real Postgres (migrated with the committed migrations), Redis and
 * S3-compatible store (SeaweedFS), the images of infra/docker-compose.yml, in throw-away containers on random ports.
 */
export default async function setup(project: TestProject) {
  const [postgres, objectStore, redis] = await Promise.all([
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
    new GenericContainer("redis:8.8-alpine")
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
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
  project.provide("databaseUrl", databaseUrl);
  project.provide("redisUrl", `redis://${redis.getHost()}:${String(redis.getMappedPort(6379))}`);
  project.provide("s3", {
    endpoint: `http://${objectStore.getHost()}:${String(objectStore.getMappedPort(8333))}`,
    region: "us-east-1",
    bucket: BUCKET,
    accessKeyId: "drift",
    secretAccessKey: "integration-test",
  });
  return async () => {
    await Promise.all([postgres.stop(), objectStore.stop(), redis.stop()]);
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
    s3: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string };
  }
}
