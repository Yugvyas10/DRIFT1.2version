'use client';

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EASE } from "@/lib/motion";

export default function NotFound() {
  return (
    <div className="pt-36 pb-24 flex flex-col items-center justify-center text-center px-4 min-h-[80vh] relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-30" />
      <div className="pointer-events-none absolute -top-20 left-1/2 h-[40vh] w-[50vw] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, scale: 0.85, filter: "blur(6px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.7, ease: EASE }}
        className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive mb-6 shadow-[0_0_30px_rgba(244,63,94,0.2)]"
      >
        <ShieldAlert className="h-8 w-8" />
      </motion.div>

      <motion.span
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
        className="relative font-mono text-xs font-semibold tracking-widest text-primary uppercase"
      >
        404 — Contract Out of Bounds
      </motion.span>

      <motion.h1
        initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.7, delay: 0.25, ease: EASE }}
        className="relative mt-3 text-4xl sm:text-5xl font-extrabold text-foreground tracking-tight"
      >
        Endpoint Not Found
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.35, ease: EASE }}
        className="relative mt-4 text-muted-foreground max-w-md text-sm leading-relaxed"
      >
        The route or API contract definition you requested does not exist in the sentinel registry.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.45, ease: EASE }}
        className="relative mt-8"
      >
        <Button asChild variant="default">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Return to Baseline
          </Link>
        </Button>
      </motion.div>
    </div>
  );
}
