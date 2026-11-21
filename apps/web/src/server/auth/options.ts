import type { Db } from "@drift/db";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import { checkCredentials, userForGitHub } from "../services/users";
import { SESSION_MAX_AGE_SECONDS } from "./session";

declare module "next-auth" {
  interface User {
    tokenVersion?: number;
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    tv?: number;
  }
}

export interface AuthSettings {
  secret: string;
  github?: { clientId: string; clientSecret: string } | undefined;
}

/**
 * next-auth v4, for identity only (ADR-0007): email and password (bcrypt), and GitHub OAuth when configured.
 * Sessions are encrypted JWTs that carry the user's id and `tokenVersion`, nothing about roles: authorisation is
 * `requireAuth`, against the database, on every request. There is no development login in any build.
 */
export function authOptions(db: Db, settings: AuthSettings): NextAuthOptions {
  return {
    secret: settings.secret,
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
    pages: { signIn: "/login", error: "/login" },
    providers: [
      CredentialsProvider({
        name: "Email and password",
        credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
        async authorize(credentials) {
          if (!credentials?.email || !credentials.password) return null;
          const user = await checkCredentials(db, credentials.email, credentials.password);
          return user ? { id: user.id, email: user.email, name: user.name, tokenVersion: user.tokenVersion } : null;
        },
      }),
      ...(settings.github ? [GitHubProvider(settings.github)] : []),
    ],
    callbacks: {
      async signIn({ user, account, profile }) {
        if (account?.provider !== "github") return true;
        const email = profile?.email ?? user.email;
        if (!email) return "/login?error=GitHubEmail";
        const found = await userForGitHub(db, {
          providerAccountId: account.providerAccountId,
          email,
          name: user.name ?? null,
        });
        // An existing password account with this address is not taken over by a GitHub sign-in.
        if (!found) return "/login?error=AccountExists";
        user.id = found.id;
        user.tokenVersion = found.tokenVersion;
        return true;
      },
      jwt({ token, user }) {
        // `user` is only present at sign-in (next-auth's types say always): that is when the claims are set.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (user) {
          token.uid = user.id;
          token.tv = user.tokenVersion ?? 0;
        }
        return token;
      },
      session({ session }) {
        return session;
      },
    },
  };
}
