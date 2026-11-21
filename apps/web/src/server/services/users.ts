import { newId, type Db } from "@drift/db";
import type { z } from "zod";
import { hashPassword, verifyPassword } from "../auth/password";
import { conflict } from "../http";
import { isUniqueViolation } from "./orgs";
import type { Register } from "./schemas";

export interface UserView {
  id: string;
  email: string;
  name?: string;
}

/** Registers a user with an email address and a password (stored as a bcrypt hash). */
export async function register(db: Db, input: z.infer<typeof Register>, cost?: number): Promise<UserView> {
  const id = newId("user");
  try {
    await db.user.create({
      data: {
        id,
        email: input.email,
        name: input.name ?? null,
        passwordHash: await hashPassword(input.password, cost),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("An account with that email address exists.");
    throw error;
  }
  return { id, email: input.email, ...(input.name === undefined ? {} : { name: input.name }) };
}

/** The user for an email and password, or undefined. Takes the same time whether or not the account exists. */
export async function checkCredentials(
  db: Db,
  email: string,
  password: string
): Promise<{ id: string; email: string; name: string | null; tokenVersion: number } | undefined> {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  const ok = await verifyPassword(password, user?.passwordHash);
  return ok && user ? { id: user.id, email: user.email, name: user.name, tokenVersion: user.tokenVersion } : undefined;
}

/**
 * The user for a GitHub identity. A known identity signs in; a new one creates a user, unless a password account
 * already has that email address: silently merging the two would let whoever controls the GitHub account take
 * over the existing one, so it is refused (undefined).
 */
export async function userForGitHub(
  db: Db,
  profile: { providerAccountId: string; email: string; name: string | null }
): Promise<{ id: string; email: string; name: string | null; tokenVersion: number } | undefined> {
  const account = await db.account.findUnique({
    where: { provider_providerAccountId: { provider: "github", providerAccountId: profile.providerAccountId } },
    include: { user: true },
  });
  if (account) {
    const { id, email, name, tokenVersion } = account.user;
    return { id, email, name, tokenVersion };
  }
  const email = profile.email.toLowerCase();
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) return undefined;
  const id = newId("user");
  await db.$transaction([
    db.user.create({ data: { id, email, name: profile.name } }),
    db.account.create({
      data: { id: newId("account"), userId: id, provider: "github", providerAccountId: profile.providerAccountId },
    }),
  ]);
  return { id, email, name: profile.name, tokenVersion: 0 };
}
