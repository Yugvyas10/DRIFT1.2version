import NextAuth from "next-auth";
import { authOptions } from "@/server/context";

// Sign-in, sign-out and the OAuth callback (next-auth v4, ADR-0007).
const handler = NextAuth(authOptions) as (request: Request, context: unknown) => Promise<Response>;

export { handler as GET, handler as POST };
