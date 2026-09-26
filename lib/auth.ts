import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export const authOptions: NextAuthOptions = {
  secret: env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: env.NEXTAUTH_SESSION_MAX_AGE,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID || "drift-dev-google-client-id",
      clientSecret:
        env.GOOGLE_CLIENT_SECRET || "drift-dev-google-client-secret",
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          if (
            user?.passwordHash &&
            (await bcrypt.compare(credentials.password, user.passwordHash))
          ) {
            return {
              id: user.id,
              name: user.name ?? credentials.email,
              email: user.email,
              image: `https://avatar.vercel.sh/${encodeURIComponent(user.email)}`,
            };
          }
        } catch (error) {
          console.error("Auth DB lookup failed:", error);
        }

        // Demo Authenticated User — persist custom credentials into Prisma DB
        if (env.NODE_ENV !== "production") {
          try {
            const passwordHash = await bcrypt.hash(credentials.password, 10);
            const nameFromEmail = credentials.email.split("@")[0];
            const createdUser = await prisma.user.upsert({
              where: { email: credentials.email },
              update: {},
              create: {
                email: credentials.email,
                name:
                  nameFromEmail.charAt(0).toUpperCase() +
                  nameFromEmail.slice(1),
                passwordHash,
              },
            });

            return {
              id: createdUser.id,
              name: createdUser.name ?? credentials.email,
              email: createdUser.email,
              image: `https://avatar.vercel.sh/${encodeURIComponent(createdUser.email)}`,
            };
          } catch (e) {
            console.error("Failed to persist custom login user into DB:", e);
          }
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }: any) {
      if (account?.provider === "google" && user?.email) {
        try {
          await prisma.user.upsert({
            where: { email: user.email },
            update: {
              name: user.name ?? undefined,
              image: user.image ?? undefined,
            },
            create: {
              email: user.email,
              name: user.name ?? "Google User",
              image: user.image,
            },
          });
        } catch (e) {
          console.warn(
            "Prisma user upsert skipped in Google signIn callback:",
            e
          );
        }
      }
      return true;
    },
    async session({ session, token }: any) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.name = token.name;
        session.user.email = token.email;
      }
      return session;
    },
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
  },
};
