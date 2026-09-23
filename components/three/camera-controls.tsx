"use client";

import React from "react";
import { OrbitControls } from "@react-three/drei";

export function CameraControls() {
  return (
    <OrbitControls
      enableZoom={false}
      enablePan={false}
      autoRotate
      autoRotateSpeed={0.5}
      maxPolarAngle={Math.PI / 2}
      minPolarAngle={Math.PI / 4}
    />
  );
}
