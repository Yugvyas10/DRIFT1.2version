import { Variants } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  DRIFT motion design tokens                                         */
/*  Cinematic, luxurious motion: long expressive durations, soft       */
/*  decelerating curves. Never snappy, never gimmicky.                 */
/* ------------------------------------------------------------------ */

/** Expressive decelerate — the signature "agency" ease. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** Softer, more neutral ease for large surface movement. */
export const EASE_SOFT = [0.22, 1, 0.36, 1] as const;

/** Almost-linear ease for long scroll-linked motion. */
export const EASE_LINEAR = [0.25, 0.1, 0.25, 1] as const;

export const DUR = {
  fast: 0.35,
  base: 0.6,
  slow: 0.9,
  hero: 1.1,
} as const;

/* ------------------------------------------------------------------ */
/*  Shared variants                                                    */
/* ------------------------------------------------------------------ */

/** Masked rise used for word-by-word headline reveals. */
export const maskUp: Variants = {
  hidden: { y: "110%" },
  show: {
    y: "0%",
    transition: { duration: 0.85, ease: EASE },
  },
};

/** Soft rise + blur + slight scale — the default editorial reveal. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 28, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.9, ease: EASE },
  },
};

/** Directional slide reveals for alternating editorial rows. */
export const slideLeft: Variants = {
  hidden: { opacity: 0, x: -40 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.9, ease: EASE },
  },
};

export const slideRight: Variants = {
  hidden: { opacity: 0, x: 40 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.9, ease: EASE },
  },
};

/** Cinematic scale-in for panels, code blocks, and visuals. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94, filter: "blur(8px)" },
  show: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.95, ease: EASE },
  },
};

/** Stagger container + child used across card grids. */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.08 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 26, filter: "blur(5px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.8, ease: EASE },
  },
};

export const staggerItemHard: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASE_SOFT },
  },
};

/* ------------------------------------------------------------------ */
/*  Backwards-compatible aliases (used by older components)            */
/* ------------------------------------------------------------------ */

export const fadeInVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASE_SOFT },
  },
};

export const slideInUpVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE },
  },
};

export const slideInLeftVariants: Variants = {
  hidden: { opacity: 0, x: -30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: EASE },
  },
};

export const scaleInVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.7, ease: EASE },
  },
};

export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.09,
      delayChildren: 0.05,
    },
  },
};

export const hoverCardVariants: Variants = {
  initial: { y: 0, boxShadow: "0 4px 20px 0 rgba(0,0,0,0.2)" },
  hover: {
    y: -4,
    boxShadow: "0 12px 30px -10px rgba(0, 240, 255, 0.2)",
    transition: { duration: 0.25, ease: "easeOut" },
  },
};
