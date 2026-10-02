import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-forms";
import { Logo } from "@/components/logo";
import { ui } from "@/components/ui";
import { githubEnabled } from "@/server/context";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
        <Logo className="size-7" />
        <span>DRIFT</span>
      </Link>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Sign in</h1>
      <div className={`mt-6 ${ui.panel}`}>
        <AuthForm
          mode="login"
          github={githubEnabled}
          {...(callbackUrl === undefined ? {} : { callbackUrl })}
          {...(error === undefined ? {} : { initialError: error })}
        />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        No account yet?{" "}
        <Link className="text-primary hover:underline" href="/register">
          Create one
        </Link>
      </p>
    </main>
  );
}
