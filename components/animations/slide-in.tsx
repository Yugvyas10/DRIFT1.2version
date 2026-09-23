"use client";

import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { slideInUpVariants, slideInLeftVariants } from "@/lib/motion";

interface SlideInProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  direction?: "up" | "left";
  delay?: number;
  className?: string;
}

export function SlideIn({ children, direction = "up", delay = 0, className, ...props }: SlideInProps) {
  const variants = direction === "up" ? slideInUpVariants : slideInLeftVariants;
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay }}
      variants={variants}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
