"use client";

import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { fadeInVariants } from "@/lib/motion";

interface FadeInProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export function FadeIn({ children, delay = 0, className, ...props }: FadeInProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      transition={{ delay }}
      variants={fadeInVariants}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
