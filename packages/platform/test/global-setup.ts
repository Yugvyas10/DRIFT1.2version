import { GenericContainer, Wait } from "testcontainers";
import type { TestProject } from "vitest/node";

const BUCKET = "drift-artifacts";

/** Real Redis and a real S3-compatible store (the images of infra/docker-compose.yml) on random ports. */
export default async function setup(project: TestProject) {
  const [redis, objectStore] = await Promise.all([
    new GenericContainer("redis:8.8-alpine")
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start(),
    new GenericContainer("chrislusf/seaweedfs:4.47")
      .withCommand(["mini", "-dir=/data", `-bucket=${BUCKET}`])
      .withEnvironment({ AWS_ACCESS_KEY_ID: "drift", AWS_SECRET_ACCESS_KEY: "integration-test" })
      .withExposedPorts(8333)
      .withWaitStrategy(Wait.forHttp("/healthz", 8333))
      .start(),
  ]);
  project.provide("redisUrl", `redis://${redis.getHost()}:${String(redis.getMappedPort(6379))}`);
  project.provide("s3", {
    endpoint: `http://${objectStore.getHost()}:${String(objectStore.getMappedPort(8333))}`,
    region: "us-east-1",
    bucket: BUCKET,
    accessKeyId: "drift",
    secretAccessKey: "integration-test",
  });
  return async () => {
    await Promise.all([redis.stop(), objectStore.stop()]);
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    redisUrl: string;
    s3: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string };
  }
}
