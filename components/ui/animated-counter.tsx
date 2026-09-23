"use client";

import React, { useEffect, useState, useRef } from "react";
import { useInView } from "framer-motion";
import { cn } from "@/lib/utils";

interface AnimatedCounterProps {
  numericValue: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}

export function AnimatedCounter({
  numericValue,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 2000,
  className,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!isInView) return;

    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // Ease out expo formula
      const easedProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayValue(easedProgress * numericValue);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  }, [isInView, numericValue, duration]);

  const formatted = displayValue.toFixed(decimals);

  return (
    <span ref={ref} className={cn("font-mono font-extrabold tracking-tight", className)}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
