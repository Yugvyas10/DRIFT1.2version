"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface ThreeContextType {
  isSupported: boolean;
  dpr: number;
}

const ThreeContext = createContext<ThreeContextType>({
  isSupported: true,
  dpr: 1,
});

export function ThreeProvider({ children }: { children: React.ReactNode }) {
  const [isSupported, setIsSupported] = useState(true);
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) {
        setIsSupported(false);
      }
      setDpr(Math.min(window.devicePixelRatio || 1, 2));
    } catch {
      setIsSupported(false);
    }
  }, []);

  return (
    <ThreeContext.Provider value={{ isSupported, dpr }}>
      {children}
    </ThreeContext.Provider>
  );
}

export const useThreeContext = () => useContext(ThreeContext);
