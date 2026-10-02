import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { env } from "@/env";
import type { Actor } from "./auth/actor";
import type { Permission } from "./auth/permissions";
import { authenticate, authorize } from "./auth/require-auth";
import { db, session } from "./context";
import { HttpError } from "./http";

/** The request of the page or server action being rendered, as far as authentication needs it: its cookies. */
async function currentRequest(): Promise<Request> {
  return new Request(env.APP_URL, { headers: { cookie: (await headers()).get("cookie") ?? "" } });
}

/**
 * The signed-in user of a page or server action, checked against the database exactly as API requests are
 * (`authenticate`). Redirects to /login without one.
 */
export async function pageUser(): Promise<{ userId: string; email: string; name: string | null }> {
  let userId: string;
  try {
    const identity = await authenticate(await currentRequest(), { db, session });
    if (identity.kind !== "user") redirect("/login");
    userId = identity.userId;
  } catch (error) {
    if (error instanceof HttpError) redirect("/login");
    throw error;
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true } });
  return { userId, ...user };
}

/**
 * The actor for a page about one organisation. Someone who is not a member gets the 404 page, as in the API.
 * With `permission`, a member who lacks it gets `undefined`, so the page can say so instead of crashing.
 */
export async function pageActor(orgSlug: string, permission: Permission): Promise<Actor | undefined> {
  const user = await pageUser();
  try {
    return await authorize({ kind: "user", userId: user.userId }, { slug: orgSlug }, permission, { db });
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    if (error instanceof HttpError && error.status === 403) return undefined;
    throw error;
  }
}
