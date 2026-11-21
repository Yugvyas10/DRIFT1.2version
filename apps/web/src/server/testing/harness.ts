import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ContractChecker, ingestSpec, type ContractProblem } from "@drift/core";
import { createDb, newId, type Db, type Role } from "@drift/db";
import { inject } from "vitest";
import { createApi, type Api } from "../api/handlers";
import { dispatch } from "../api/routes";
import { unlimited } from "../rate-limit";
import {
  createRedis,
  createRunQueue,
  createS3Store,
  RunEventHub,
  type ObjectStore,
  type Redis,
  type RunQueue,
} from "@drift/platform";

const contractFile = fileURLToPath(new URL("../../../openapi/drift-api.yaml", import.meta.url));

let contract: Promise<ContractChecker> | undefined;
/** The API contract (apps/web/openapi/drift-api.yaml), checked with the engine's own validators. */
function loadContract(): Promise<ContractChecker> {
  contract ??= ingestSpec(contractFile, {
    reader: {
      size: async (path) => (await stat(path)).size,
      readText: (path) => readFile(path, "utf8"),
      realpath: (path) => realpath(path),
    },
  }).then((result) => {
    if (!result.spec) throw new Error("apps/web/openapi/drift-api.yaml is not a valid contract");
    return new ContractChecker(result.spec.ir);
  });
  return contract;
}

export interface Caller {
  /** A signed-in user (the test session header), or an API key. */
  user?: { id: string; tokenVersion?: number };
  key?: string;
}

export interface Reply<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
  /** Where the exchange does not follow the contract. Response-side problems fail the test in `call`. */
  problems: ContractProblem[];
}

export interface Harness {
  db: Db;
  store: ObjectStore;
  redis: Redis;
  queue: RunQueue;
  hub: RunEventHub;
  api: Api;
  /**
   * Sends a request through the same dispatcher the Next.js route uses, and checks the exchange against the
   * contract. A response the contract does not allow throws. With `valid: false` (a deliberately bad request)
   * the request side is not required to follow the contract.
   */
  call<T = unknown>(
    method: string,
    path: string,
    options?: Caller & { body?: unknown; headers?: Record<string, string>; valid?: boolean; raw?: string }
  ): Promise<Reply<T>>;
  /** A registered user with a unique email address. */
  user(name?: string): Promise<{ id: string; email: string }>;
  /** An organisation owned by a new user, with a unique slug. */
  org(): Promise<{ slug: string; id: string; owner: { id: string; email: string } }>;
  /** Adds an existing user to an organisation with a role (directly in the database). */
  join(orgId: string, userId: string, role: Role): Promise<void>;
  unique(prefix: string): string;
}

let shared: Pick<Harness, "db" | "store" | "redis" | "queue" | "hub" | "api"> | undefined;

/** One database client, object store and API per test file, against the containers of test/global-setup.ts. */
export function harness(): Harness {
  shared ??= (() => {
    const db = createDb(inject("databaseUrl"));
    const store = createS3Store(inject("s3"));
    const redis = createRedis(inject("redisUrl"), { failFast: true });
    const queue = createRunQueue(redis);
    const hub = new RunEventHub(redis);
    const api = createApi({
      db,
      store,
      redis,
      queue,
      hub,
      // Rate limits have their own tests; here they would make unrelated tests depend on call counts.
      limits: unlimited,
      heartbeatMs: 200,
      // The session cookie is next-auth's concern (covered by session.test.ts and the end-to-end tests). Here a
      // header stands in for a verified session, so the tests reach the authorisation code directly.
      session: (request) => {
        const [userId, version] = (request.headers.get("x-test-session") ?? "").split(":");
        return Promise.resolve(userId ? { userId, tokenVersion: Number(version ?? "0") } : undefined);
      },
      passwordCost: 4,
    });
    return { db, store, redis, queue, hub, api };
  })();
  const { db, store, redis, queue, hub, api } = shared;
  const unique = (prefix: string) => `${prefix}-${newId("run").slice(4, 16)}`;

  const call: Harness["call"] = async (method, path, options = {}) => {
    const headers: Record<string, string> = { ...options.headers };
    if (options.user) headers["x-test-session"] = `${options.user.id}:${String(options.user.tokenVersion ?? 0)}`;
    if (options.key !== undefined) headers.authorization = `Bearer ${options.key}`;
    const payload = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    if (payload !== undefined) headers["content-type"] ??= "application/json";
    const response = await dispatch(
      api,
      new Request(`http://drift.test${path}`, { method, headers, ...(payload === undefined ? {} : { body: payload }) })
    );
    const text = await response.text();
    const contentType = response.headers.get("content-type");
    const body = text === "" ? undefined : (JSON.parse(text) as unknown);
    // The credentials are how the test signs in, not part of the contract's parameters.
    const contractHeaders = Object.fromEntries(
      Object.entries(headers).filter(([name]) => name !== "authorization" && name !== "x-test-session")
    );
    const problems = (await loadContract()).check({
      method,
      path,
      headers: contractHeaders,
      ...(options.raw === undefined && options.body !== undefined ? { requestBody: options.body as never } : {}),
      status: response.status,
      ...(contentType === null ? {} : { responseHeaders: { "content-type": contentType } }),
      ...(body === undefined ? {} : { responseBody: body as never }),
    });
    const fatal = problems.filter((problem) => problem.side === "response" || options.valid !== false);
    if (fatal.length > 0) {
      throw new Error(
        `${method} ${path} → ${String(response.status)} does not follow drift-api.yaml:\n${fatal.map((p) => `  ${p.side} ${p.pointer}: ${p.message}`).join("\n")}`
      );
    }
    return { status: response.status, body: body as never, headers: response.headers, problems };
  };

  const user: Harness["user"] = async (name) => {
    const email = `${unique("user")}@example.com`;
    const reply = await call<{ user: { id: string } }>("POST", "/api/v1/auth/register", {
      body: { email, password: "correct horse battery", ...(name === undefined ? {} : { name }) },
    });
    if (reply.status !== 201) throw new Error(`could not register a test user: ${String(reply.status)}`);
    return { id: reply.body.user.id, email };
  };

  const org: Harness["org"] = async () => {
    const owner = await user();
    const slug = unique("org");
    const reply = await call<{ org: { id: string } }>("POST", "/api/v1/orgs", {
      user: owner,
      body: { name: "Test org", slug },
    });
    if (reply.status !== 201) throw new Error(`could not create a test organisation: ${String(reply.status)}`);
    return { slug, id: reply.body.org.id, owner };
  };

  const join: Harness["join"] = async (orgId, userId, role) => {
    await db.membership.create({ data: { id: newId("membership"), orgId, userId, role } });
  };

  return { db, store, redis, queue, hub, api, call, user, org, join, unique };
}
