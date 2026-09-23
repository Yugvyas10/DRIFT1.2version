"use client";

import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { scaleInVariants } from "@/lib/motion";

interface ScaleInProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export function ScaleIn({ children, delay = 0, className, ...props }: ScaleInProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      transition={{ delay }}
      variants={scaleInVariants}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
