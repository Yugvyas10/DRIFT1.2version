/** Shared class names of the app's forms and tables (the design tokens are in app/globals.css). */
export const ui = {
  input:
    "w-full rounded-md border border-border bg-background-2 px-3 py-2 text-sm placeholder:text-muted-foreground/60",
  label: "block text-sm font-medium",
  button:
    "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50",
  buttonQuiet:
    "inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50",
  panel: "glass-panel rounded-lg p-6",
  th: "px-3 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase",
  td: "px-3 py-2 text-sm",
  error: "rounded-md border border-breaking/40 bg-breaking/10 px-3 py-2 text-sm text-breaking",
} as const;
