"use client";

import React from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";

export function AnimationProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        {children}
      </AnimatePresence>
    </MotionConfig>
  );
}
