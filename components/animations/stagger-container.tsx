"use client";

import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { staggerContainerVariants } from "@/lib/motion";

interface StaggerContainerProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
}

export function StaggerContainer({ children, className, ...props }: StaggerContainerProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={staggerContainerVariants}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
