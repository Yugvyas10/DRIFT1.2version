import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./logo";

/** The frame of the public pages other than the landing page: docs and about (Q11). */
export function MarketingShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <header className="border-b border-border/60 bg-background/70">
        <nav aria-label="Main" className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <Logo className="size-7" />
            <span>DRIFT</span>
          </Link>
          <ul className="flex items-center gap-6 text-sm text-muted-foreground">
            <li>
              <Link className="hover:text-foreground" href="/docs">
                Docs
              </Link>
            </li>
            <li>
              <Link className="hover:text-foreground" href="/about">
                About
              </Link>
            </li>
            <li>
              <Link className="hover:text-foreground" href="/login">
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl space-y-10 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {children}
      </main>
    </>
  );
}

/** A titled section of a public page. */
export function Topic({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3 leading-relaxed">
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A command or file, shown literally. */
export function Code({ children }: { children: string }) {
  return (
    <pre tabIndex={0} className="glass-panel overflow-x-auto rounded-md p-4 font-mono text-xs">
      {children}
    </pre>
  );
}
