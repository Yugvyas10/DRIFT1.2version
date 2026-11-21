import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-forms";
import { Logo } from "@/components/logo";
import { ui } from "@/components/ui";
import { githubEnabled } from "@/server/context";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
        <Logo className="size-7" />
        <span>DRIFT</span>
      </Link>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Create an account</h1>
      <div className={`mt-6 ${ui.panel}`}>
        <AuthForm mode="register" github={githubEnabled} />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Already registered?{" "}
        <Link className="text-primary hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </main>
  );
}
