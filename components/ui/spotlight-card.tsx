'use client';

import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface InteractiveCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  glowColor?: string;
  maxTilt?: number;
  enableTilt?: boolean;
}

export function InteractiveCard({
  children,
  className,
  spotlightColor = 'rgba(45, 212, 191, 0.06)',
  glowColor = 'rgba(45, 212, 191, 0.12)',
  maxTilt = 3.5,
  enableTilt = true,
  ...props
}: InteractiveCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Motion values for subtle 3D tilt
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);

  // Spring physics setup for smooth inertia & reset
  const springConfig = { damping: 25, stiffness: 220, mass: 0.5 };
  const rotateX = useSpring(useTransform(rawY, [-0.5, 0.5], [maxTilt, -maxTilt]), springConfig);
  const rotateY = useSpring(useTransform(rawX, [-0.5, 0.5], [-maxTilt, maxTilt]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    if (enableTilt) {
      const normX = x / rect.width - 0.5;
      const normY = y / rect.height - 0.5;
      rawX.set(normX);
      rawY.set(normY);
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX: enableTilt ? rotateX : 0,
        rotateY: enableTilt ? rotateY : 0,
        transformStyle: 'preserve-3d',
      }}
      className={cn(
        'group relative overflow-hidden rounded-2xl glass-panel p-6 text-foreground transition-all duration-300 ease-out',
        'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_12px_30px_-10px_rgba(45,212,191,0.08)]',
        className
      )}
      {...(props as any)}
    >
      {/* 1. Subtle Radial Spotlight Glow */}
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl transition-opacity duration-300 z-10 opacity-0 group-hover:opacity-100"
        style={{
          background: `radial-gradient(500px circle at ${mousePos.x}px ${mousePos.y}px, ${spotlightColor}, transparent 45%)`,
        }}
      />

      {/* 2. Subtle Border Highlight */}
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl transition-opacity duration-300 z-10 opacity-0 group-hover:opacity-100"
        style={{
          background: `radial-gradient(300px circle at ${mousePos.x}px ${mousePos.y}px, ${glowColor}, transparent 50%)`,
          maskImage: 'linear-gradient(black, black) content-box, linear-gradient(black, black)',
          maskComposite: 'exclude',
          WebkitMaskComposite: 'xor',
          padding: '1px',
        }}
      />

      {/* 3. Subtle Glass Reflection Glare */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10 bg-gradient-to-br from-white/5 via-transparent to-transparent"
        style={{
          transform: `translate3d(${(mousePos.x - 150) * 0.03}px, ${(mousePos.y - 150) * 0.03}px, 0)`,
        }}
      />

      {/* Card Content Container */}
      <div className="relative z-20">{children}</div>
    </motion.div>
  );
}

// Alias export for backwards compatibility across existing components
export { InteractiveCard as SpotlightCard };
