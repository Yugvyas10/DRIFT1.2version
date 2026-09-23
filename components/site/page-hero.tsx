'use client';

import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { WordReveal } from '@/components/site/primitives';
import { EASE } from '@/lib/motion';

export function PageHero({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();

  // Cinematic scroll-out: content drifts up and dissolves as the hero
  // leaves the viewport, while the background grid parallaxes slower.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const contentBlur = useTransform(scrollYProgress, [0, 0.9], [0, 6]);
  const gridY = useTransform(scrollYProgress, [0, 1], [0, 60]);
  const glowY = useTransform(scrollYProgress, [0, 1], [0, 120]);

  const contentStyle = reduceMotion
    ? undefined
    : { y: contentY, opacity: contentOpacity, filter: contentBlur };

  return (
    <section
      ref={ref}
      className={cn(
        'relative overflow-hidden pt-32 pb-16 sm:pt-36 md:pt-44 md:pb-20',
        className
      )}
    >
      <motion.div
        style={reduceMotion ? undefined : { y: gridY }}
        className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40"
      />
      <motion.div
        style={reduceMotion ? undefined : { y: glowY }}
        className="pointer-events-none absolute -top-20 left-1/2 h-[50vh] w-[60vw] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]"
      />
      <div className="container-max relative px-6 sm:px-8 md:px-12 lg:px-16">
        <motion.div style={contentStyle} className="mx-auto flex max-w-3xl flex-col items-center text-center">
          {eyebrow && (
            <motion.span
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
              {eyebrow}
            </motion.span>
          )}
          <WordReveal
            as="h1"
            delay={0.08}
            stagger={0.045}
            className="mt-6 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl text-balance"
          >
            {title}
          </WordReveal>
          {description && (
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.35, ease: EASE }}
              className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg md:text-xl leading-relaxed"
            >
              {description}
            </motion.p>
          )}
          {children && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.5, ease: EASE }}
              className="mt-10 w-full"
            >
              {children}
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
