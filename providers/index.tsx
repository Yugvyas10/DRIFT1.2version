"use client";

import React from "react";
import { ThemeProvider } from "./theme-provider";
import { LenisProvider } from "./lenis-provider";
import { AnimationProvider } from "./animation-provider";
import { ThreeProvider } from "./three-provider";
import { AuthProvider } from "./auth-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider defaultTheme="dark">
        <LenisProvider>
          <ThreeProvider>
            <TooltipProvider delayDuration={200}>
              <AnimationProvider>{children}</AnimationProvider>
            </TooltipProvider>
          </ThreeProvider>
        </LenisProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
