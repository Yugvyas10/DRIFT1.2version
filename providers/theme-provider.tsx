"use client";

import * as React from "react";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: string;
}

export function ThemeProvider({ children, defaultTheme = "dark" }: ThemeProviderProps) {
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");
  }, []);

  return <>{children}</>;
}
