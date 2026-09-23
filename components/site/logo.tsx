'use client';

import { motion } from 'framer-motion';

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <motion.circle
        cx="16"
        cy="16"
        r="13"
        stroke="hsl(174 72% 51%)"
        strokeWidth="1.5"
        strokeDasharray="4 6"
        initial={{ rotate: 0 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        style={{ transformOrigin: 'center' }}
      />
      <circle cx="16" cy="16" r="7" stroke="hsl(199 80% 58%)" strokeWidth="1.5" opacity="0.6" />
      <circle cx="16" cy="16" r="2.5" fill="hsl(174 72% 51%)" />
      <circle cx="29" cy="16" r="1.5" fill="hsl(199 80% 58%)" />
      <circle cx="3" cy="16" r="1" fill="hsl(174 72% 51%)" opacity="0.6" />
    </svg>
  );
}
