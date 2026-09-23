'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Zap, ShieldCheck, GitBranch } from 'lucide-react';
import { Logo } from '@/components/site/logo';

const benefits = [
  { icon: Zap, title: 'Sub-second analysis', desc: 'Catch breaking changes before your PR merges.' },
  { icon: ShieldCheck, title: 'Zero false positives', desc: 'Only true breaking changes surface.' },
  { icon: GitBranch, title: 'Pipeline-native', desc: 'Drop into GitHub, GitLab, or Jenkins in minutes.' },
];

export function AuthLayout({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: 'signin' | 'signup';
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1fr]">
      {/* Left: form */}
      <div className="relative flex flex-col px-6 py-8 sm:px-12 bg-background">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="font-display text-lg font-semibold tracking-tight text-foreground">DRIFT</span>
        </Link>

        <div className="flex flex-1 items-center justify-center py-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-sm"
          >
            {children}
          </motion.div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {mode === 'signin' ? (
            <>New to DRIFT? <Link href="/register" className="font-medium text-primary hover:underline">Create an account</Link></>
          ) : (
            <>Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link></>
          )}
        </p>
      </div>

      {/* Right: showcase */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-background-2 via-background to-background-2 lg:block">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
        <div className="pointer-events-none absolute -top-1/4 left-1/2 h-[80vh] w-[80vh] -translate-x-1/2 rounded-full bg-primary/15 blur-[140px] animate-pulse-glow" />
        <div className="pointer-events-none absolute bottom-0 -right-20 h-[40vh] w-[40vh] rounded-full bg-chart-2/10 blur-[100px] animate-float" />

        <div className="relative flex h-full flex-col justify-center p-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <h2 className="font-display text-4xl font-semibold tracking-tight text-foreground text-balance">
              Stop API drift <span className="gradient-text">before it ships.</span>
            </h2>
            <p className="mt-4 max-w-md text-base text-muted-foreground leading-relaxed">
              The contract-aware regression engine trusted by API-first engineering teams worldwide.
            </p>
            <div className="mt-10 space-y-5">
              {benefits.map((b, i) => (
                <motion.div
                  key={b.title}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 + i * 0.1 }}
                  className="flex items-start gap-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <b.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{b.title}</p>
                    <p className="text-sm text-muted-foreground">{b.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
