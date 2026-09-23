"use client";

import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { useThreeContext } from "@/providers/three-provider";

interface CanvasContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function CanvasContainer({ children, className = "h-full w-full absolute inset-0 pointer-events-none" }: CanvasContainerProps) {
  const { isSupported, dpr } = useThreeContext();

  if (!isSupported) {
    return (
      <div className={`${className} flex items-center justify-center bg-[#06080C]/80 border border-slate-800/50 rounded-xl p-4 text-xs text-slate-400`}>
        WebGL Fallback Enabled
      </div>
    );
  }

  return (
    <div className={className}>
      <Canvas
        dpr={dpr}
        camera={{ position: [0, 0, 8], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>{children}</Suspense>
      </Canvas>
    </div>
  );
}
