'use client';

import { motion, useScroll, useSpring, useReducedMotion } from 'framer-motion';

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 28,
    restDelta: 0.001,
  });
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return null;

  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-primary via-chart-2 to-primary"
      style={{ scaleX }}
    />
  );
}
