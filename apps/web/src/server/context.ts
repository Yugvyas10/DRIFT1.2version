import { createDb, type Db } from "@drift/db";
import { env } from "@/env";
import { createApi, type Api } from "./api/handlers";
import { authOptions as buildAuthOptions } from "./auth/options";
import { sessionReader } from "./auth/session";
import { createS3Store } from "./storage";

/**
 * The live database client, object store, session reader and API of this process. Everything else in
 * `src/server` takes these as arguments, so only this file reads the environment.
 */
const secure = env.APP_URL.startsWith("https://");
// next-auth builds its callback URLs and picks its cookie names from NEXTAUTH_URL; it is the same as APP_URL.
process.env.NEXTAUTH_URL ??= env.APP_URL;

// One client per process; in development, module reloads would otherwise open a new pool each time.
const globals = globalThis as { __driftDb?: Db };
export const db: Db = (globals.__driftDb ??= createDb(env.DATABASE_URL));

export const store = createS3Store({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
});

export const session = sessionReader(env.AUTH_SECRET, secure);

export const authOptions = buildAuthOptions(db, {
  secret: env.AUTH_SECRET,
  github: env.GITHUB_ID && env.GITHUB_SECRET ? { clientId: env.GITHUB_ID, clientSecret: env.GITHUB_SECRET } : undefined,
});

export const githubEnabled = env.GITHUB_ID !== undefined;

export const api: Api = createApi({ db, store, session });
