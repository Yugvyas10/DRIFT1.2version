'use client';

import { cn } from '@/lib/utils';
import {
  motion,
  useInView,
  useScroll,
  useSpring,
  useTransform,
  useMotionValue,
  useReducedMotion,
  type Variants,
} from 'framer-motion';
import { useMemo, useRef, useEffect, useState, type ReactNode } from 'react';
import { InteractiveCard } from '@/components/ui/spotlight-card';
import {
  EASE,
  EASE_SOFT,
  maskUp,
  rise,
  slideLeft,
  slideRight,
  scaleIn,
} from '@/lib/motion';

export { staggerContainer, staggerItem, staggerItemHard } from '@/lib/motion';

/* ---------- Reveal ---------- */
type RevealVariant = 'up' | 'fade' | 'blur' | 'scale' | 'left' | 'right';

export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
  once = true,
  variant = 'up',
  duration = 0.9,
  blur = 6,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
  variant?: RevealVariant;
  duration?: number;
  blur?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, margin: '-72px' });

  const hidden = useMemo(() => {
    switch (variant) {
      case 'fade':
        return { opacity: 0 };
      case 'scale':
        return { opacity: 0, scale: 0.95, filter: `blur(${blur}px)` };
      case 'left':
        return { opacity: 0, x: -48 };
      case 'right':
        return { opacity: 0, x: 48 };
      case 'blur':
        return { opacity: 0, filter: `blur(${blur}px)` };
      default:
        return { opacity: 0, y, filter: `blur(${blur}px)` };
    }
  }, [variant, y, blur]);

  const shown = useMemo(() => {
    switch (variant) {
      case 'fade':
        return { opacity: 1 };
      case 'left':
        return { opacity: 1, x: 0 };
      case 'right':
        return { opacity: 1, x: 0 };
      default:
        return { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' };
    }
  }, [variant]);

  return (
    <motion.div
      ref={ref}
      initial={hidden}
      animate={inView ? shown : hidden}
      transition={{ duration, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ---------- Word reveal ---------- */
/**
 * Cinematic masked word-by-word headline reveal. Strings are split into
 * individual words; nested elements (e.g. gradient spans) animate as a
 * single masked unit so styling is preserved.
 */
export function WordReveal({
  children,
  className,
  delay = 0,
  stagger = 0.035,
  once = true,
  as: Tag = 'span',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
  once?: boolean;
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'p' | 'div';
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once, margin: '-40px' });
  const reduceMotion = useReducedMotion();

  const { words, plainText } = useMemo(() => {
    const out: { id: number; node: ReactNode }[] = [];
    const textParts: string[] = [];
    let counter = 0;

    const collectText = (node: ReactNode) => {
      if (typeof node === 'string') {
        const trimmed = node.trim();
        if (trimmed) textParts.push(trimmed);
      } else if (Array.isArray(node)) {
        node.forEach((child) => collectText(child));
      } else if (node && typeof node === 'object' && 'props' in (node as any)) {
        collectText((node as React.ReactElement).props.children);
      }
    };

    const walk = (node: ReactNode) => {
      if (typeof node === 'string') {
        node.split(/\s+/).filter(Boolean).forEach((w) => {
          out.push({ id: counter++, node: w });
        });
      } else if (Array.isArray(node)) {
        node.forEach((child) => walk(child));
      } else if (node && typeof node === 'object' && 'props' in (node as any)) {
        const el = node as React.ReactElement;
        if (el.type === 'br') {
          out.push({ id: counter++, node: <span className="block w-full" aria-hidden="true" /> });
        } else {
          out.push({ id: counter++, node: el });
        }
      }
    };

    collectText(children);
    walk(children);
    return { words: out, plainText: textParts.join(' ') };
  }, [children]);

  const Comp = motion[Tag] as typeof motion.span;

  return (
    <Comp
      ref={ref as React.RefObject<HTMLSpanElement>}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      aria-label={plainText || undefined}
      className={cn('inline-block', className)}
    >
      {words.map((w, i) => (
        <span
          key={w.id}
          aria-hidden="true"
          className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom"
        >
          <motion.span
            className="inline-block"
            variants={maskUp}
            transition={{ duration: 0.9, ease: EASE, delay: delay + i * stagger }}
            initial={reduceMotion ? { y: '0%' } : undefined}
          >
            {w.node}
          </motion.span>
          {i < words.length - 1 && <span>&nbsp;</span>}
        </span>
      ))}
    </Comp>
  );
}

export { WordReveal as SplitText };

/* ---------- Stagger ---------- */
export function StaggerGroup({
  children,
  className,
  stagger = 0.09,
  delayChildren = 0.08,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delayChildren?: number;
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, margin: '-60px' });
  const containerVariants: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren } },
  };
  return (
    <motion.div
      ref={ref}
      variants={containerVariants}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ---------- Section heading ---------- */
export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
  align = 'center',
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' && 'items-center text-center',
        className
      )}
    >
      {eyebrow && (
        <Reveal variant="fade" y={0}>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
            {eyebrow}
          </span>
        </Reveal>
      )}
      <WordReveal
        as="h2"
        delay={0.05}
        className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl text-balance"
      >
        {title}
      </WordReveal>
      {description && (
        <Reveal delay={0.12} variant="fade">
          <p
            className={cn(
              'max-w-2xl text-base text-muted-foreground sm:text-lg leading-relaxed',
              align === 'center' && 'mx-auto'
            )}
          >
            {description}
          </p>
        </Reveal>
      )}
    </div>
  );
}

/* ---------- Count-up number ---------- */
export function Counter({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  duration = 1.6,
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduceMotion = useReducedMotion();
  const started = useRef(false);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setDisplay(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduceMotion]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* ---------- Glow card ---------- */
export function GlowCard({
  children,
  className,
  glow = 'primary',
}: {
  children: ReactNode;
  className?: string;
  glow?: 'primary' | 'blue' | 'none';
}) {
  return (
    <InteractiveCard
      spotlightColor={glow === 'blue' ? 'rgba(56, 189, 248, 0.06)' : 'rgba(45, 212, 191, 0.06)'}
      glowColor={glow === 'blue' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(45, 212, 191, 0.12)'}
      enableTilt={glow !== 'none'}
      className={className}
    >
      {children}
    </InteractiveCard>
  );
}

/* ---------- Parallax layer ---------- */
export function Parallax({
  children,
  className,
  speed = 0.3,
  fade = false,
}: {
  children: ReactNode;
  className?: string;
  speed?: number;
  fade?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [speed * 120, -speed * 120]);
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.25, 1, 0.25]);

  return (
    <motion.div
      ref={ref}
      style={{
        y: reduceMotion ? 0 : y,
        opacity: reduceMotion || !fade ? undefined : opacity,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ---------- Magnetic wrapper ---------- */
export function Magnetic({
  children,
  className,
  strength = 0.35,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 180, damping: 16, mass: 0.35 });
  const sy = useSpring(y, { stiffness: 180, damping: 16, mass: 0.35 });

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduceMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - (rect.left + rect.width / 2)) * strength);
    y.set((e.clientY - (rect.top + rect.height / 2)) * strength);
  };

  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ x: reduceMotion ? 0 : sx, y: reduceMotion ? 0 : sy }}
      className={cn('inline-block', className)}
    >
      {children}
    </motion.div>
  );
}

/* ---------- Marquee ---------- */
export function Marquee({
  children,
  className,
  reverse = false,
  hoverPause = true,
}: {
  children: ReactNode;
  className?: string;
  reverse?: boolean;
  hoverPause?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex overflow-hidden mask-fade-x',
        hoverPause && 'marquee-pause-hover',
        className
      )}
    >
      <div
        className={cn(
          'flex shrink-0',
          reverse ? 'animate-marquee-rev' : 'animate-marquee'
        )}
      >
        {children}
        {children}
      </div>
    </div>
  );
}

/* ---------- Aurora background ---------- */
export function Aurora({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className
      )}
    >
      <div className="absolute -top-1/3 left-1/2 h-[60vh] w-[60vh] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px] animate-pulse-glow" />
      <div className="absolute top-1/4 -right-20 h-[40vh] w-[40vh] rounded-full bg-chart-2/10 blur-[100px] animate-float" />
      <div className="absolute bottom-0 -left-20 h-[40vh] w-[40vh] rounded-full bg-accent/10 blur-[100px] animate-float" style={{ animationDelay: '2s' }} />
    </div>
  );
}

/* ---------- Section divider ---------- */
export function SectionDivider({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'pointer-events-none relative mx-auto w-full max-w-7xl',
        className
      )}
      aria-hidden="true"
    >
      <div className="hairline" />
      <div className="absolute -top-px left-1/2 h-px w-1/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
    </div>
  );
}
