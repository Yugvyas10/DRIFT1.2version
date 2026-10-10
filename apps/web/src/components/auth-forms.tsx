"use client";

import { signIn, signOut } from "next-auth/react";
import { useState, type SubmitEvent } from "react";
import { ui } from "./ui";

const MESSAGES: Record<string, string> = {
  CredentialsSignin: "That email address and password do not match an account.",
  AccountExists: "An account with that email address already exists. Sign in with its password.",
  GitHubEmail: "GitHub did not share an email address for that account.",
};

function safeCallback(url: string | undefined): string {
  // Only paths on this site: an attacker cannot use the sign-in page as an open redirect.
  return url !== undefined && /^\/(?!\/)/.test(url) ? url : "/dashboard";
}

/** Email and password sign-in or registration, and GitHub when the server has it configured. */
export function AuthForm({
  mode,
  github,
  callbackUrl,
  initialError,
}: {
  mode: "login" | "register";
  github: boolean;
  callbackUrl?: string;
  initialError?: string;
}) {
  const target = safeCallback(callbackUrl);
  const [error, setError] = useState(
    initialError === undefined ? undefined : (MESSAGES[initialError] ?? "Sign-in failed.")
  );
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    const field = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" ? value : "";
    };
    const email = field("email");
    const password = field("password");
    try {
      if (mode === "register") {
        const name = field("name").trim();
        const response = await fetch("/api/v1/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, ...(name === "" ? {} : { name }) }),
        });
        if (!response.ok) {
          const problem = (await response.json()) as { detail?: string; title?: string };
          setError(problem.detail ?? problem.title ?? "Registration failed.");
          return;
        }
      }
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError(MESSAGES[result.error] ?? "Sign-in failed.");
        return;
      }
      window.location.assign(target);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {mode === "register" && (
          <div>
            <label htmlFor="name" className={ui.label}>
              Name
            </label>
            <input id="name" name="name" autoComplete="name" maxLength={100} className={`mt-1 ${ui.input}`} />
          </div>
        )}
        <div>
          <label htmlFor="email" className={ui.label}>
            Email
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className={`mt-1 ${ui.input}`} />
        </div>
        <div>
          <label htmlFor="password" className={ui.label}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={mode === "register" ? 10 : 1}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            aria-describedby={mode === "register" ? "password-hint" : undefined}
            className={`mt-1 ${ui.input}`}
          />
          {mode === "register" && (
            <p id="password-hint" className="mt-1 text-xs text-muted-foreground">
              At least 10 characters.
            </p>
          )}
        </div>
        {error !== undefined && (
          <p role="alert" className={ui.error}>
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className={`w-full ${ui.button}`}>
          {pending ? "Working…" : mode === "register" ? "Create account" : "Sign in"}
        </button>
      </form>
      {github && (
        <button
          type="button"
          onClick={() => void signIn("github", { callbackUrl: target })}
          className={`w-full ${ui.buttonQuiet}`}
        >
          Continue with GitHub
        </button>
      )}
    </div>
  );
}

export function SignOutButton() {
  return (
    <button type="button" onClick={() => void signOut({ callbackUrl: "/" })} className={ui.buttonQuiet}>
      Sign out
    </button>
  );
}
