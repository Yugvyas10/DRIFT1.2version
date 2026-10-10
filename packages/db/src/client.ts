import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.ts";

export type Db = PrismaClient;

/**
 * A database client for one connection string, over node-postgres (Prisma 7 driver adapter). The caller owns it:
 * the web app keeps one per process, tests create one per database and `$disconnect()` it.
 */
export function createDb(connectionString: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
