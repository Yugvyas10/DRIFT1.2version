import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { GenericContainer, Wait } from "testcontainers";
import { E2E_PORT, E2E_URL } from "../playwright.config";

const BUCKET = "drift-artifacts";
const web = fileURLToPath(new URL("../", import.meta.url));

/** Real Postgres and S3 in containers, the committed migrations, and the built app on E2E_PORT. */
export default async function globalSetup() {
  const [postgres, objectStore] = await Promise.all([
    new GenericContainer("postgres:18-alpine")
      .withEnvironment({ POSTGRES_USER: "drift", POSTGRES_PASSWORD: "end-to-end-test", POSTGRES_DB: "drift" })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start(),
    new GenericContainer("chrislusf/seaweedfs:4.47")
      .withCommand(["mini", "-dir=/data", `-bucket=${BUCKET}`])
      .withEnvironment({ AWS_ACCESS_KEY_ID: "drift", AWS_SECRET_ACCESS_KEY: "end-to-end-test" })
      .withExposedPorts(8333)
      .withWaitStrategy(Wait.forHttp("/healthz", 8333))
      .start(),
  ]);
  const databaseUrl = `postgresql://drift:end-to-end-test@${postgres.getHost()}:${String(postgres.getMappedPort(5432))}/drift`;
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: fileURLToPath(new URL("../../../packages/db/", import.meta.url)),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  const server = spawn("pnpm", ["exec", "next", "start", "--port", String(E2E_PORT)], {
    cwd: web,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      APP_URL: E2E_URL,
      DATABASE_URL: databaseUrl,
      // A fresh signing secret for this run only.
      AUTH_SECRET: randomBytes(32).toString("base64"),
      GITHUB_ID: "",
      GITHUB_SECRET: "",
      S3_ENDPOINT: `http://${objectStore.getHost()}:${String(objectStore.getMappedPort(8333))}`,
      S3_REGION: "us-east-1",
      S3_BUCKET: BUCKET,
      S3_ACCESS_KEY_ID: "drift",
      S3_SECRET_ACCESS_KEY: "end-to-end-test",
    },
  });
  let log = "";
  server.stdout.on("data", (chunk: Buffer) => (log += chunk.toString()));
  server.stderr.on("data", (chunk: Buffer) => (log += chunk.toString()));

  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(`${E2E_URL}/readyz`)).ok) break;
    } catch {
      // not listening yet
    }
    if (server.exitCode !== null || Date.now() > deadline) {
      server.kill();
      await Promise.all([postgres.stop(), objectStore.stop()]);
      throw new Error(`the app did not become ready on ${E2E_URL}:\n${log}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return async () => {
    server.kill();
    await Promise.all([postgres.stop(), objectStore.stop()]);
  };
}
