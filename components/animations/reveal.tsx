"use client";

import React from "react";
import { motion } from "framer-motion";

interface RevealProps {
  children: React.ReactNode;
  width?: "fit-content" | "100%";
  className?: string;
}

export function Reveal({ children, width = "fit-content", className }: RevealProps) {
  return (
    <div style={{ position: "relative", width, overflow: "hidden" }} className={className}>
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 35 },
          visible: { opacity: 1, y: 0 },
        }}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1.0] }}
      >
        {children}
      </motion.div>
    </div>
  );
}
