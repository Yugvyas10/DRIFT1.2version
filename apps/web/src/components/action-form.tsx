"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/app/actions";
import { ui } from "./ui";

/**
 * A form bound to a server action. Shows the action's error, and its secret (a new API key or invitation token)
 * once: the secret only ever exists in this component's state, so leaving the page loses it for good.
 */
export function ActionForm({
  action,
  submit,
  secretLabel,
  quiet = false,
  children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submit: string;
  /** What the secret is, for the "copy it now" note. */
  secretLabel?: string;
  quiet?: boolean;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={quiet ? "inline" : "space-y-4"}>
      {children}
      {state.error !== undefined && (
        <p role="alert" className={ui.error}>
          {state.error}
        </p>
      )}
      {state.notice !== undefined && (
        <p role="status" className="rounded-md border border-safe/40 bg-safe/10 px-3 py-2 text-sm text-safe">
          {state.notice}
        </p>
      )}
      {state.secret !== undefined && secretLabel !== undefined && (
        <div role="status" className="rounded-md border border-safe/40 bg-safe/10 p-3 text-sm">
          <p className="font-medium text-safe">Copy this {secretLabel} now. It is not shown again.</p>
          <code data-testid="secret" className="mt-2 block font-mono text-xs break-all text-foreground">
            {state.secret}
          </code>
        </div>
      )}
      <button type="submit" disabled={pending} className={quiet ? ui.buttonQuiet : ui.button}>
        {pending ? "Working…" : submit}
      </button>
    </form>
  );
}
