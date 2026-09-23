"use client";

import React from "react";

export function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1.2} color="#00F0FF" />
      <pointLight position={[-10, -10, -10]} intensity={0.8} color="#7000FF" />
      <spotLight
        position={[0, 15, 10]}
        angle={0.4}
        penumbra={1}
        intensity={1.5}
        color="#0052FF"
      />
    </>
  );
}
