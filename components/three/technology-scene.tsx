"use client";

import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Float, Line, Box } from "@react-three/drei";

export function TechnologyScene() {
  const groupRef = useRef<THREE.Group>(null!);

  const layers = useMemo(() => [
    { z: -2, color: "#7000FF", label: "AST Parse Layer" },
    { z: 0, color: "#00F0FF", label: "Diff Engine Layer" },
    { z: 2, color: "#0052FF", label: "Traffic Replay Layer" },
  ], []);

  const nodes = useMemo(() => [
    { pos: [-3, 1, -2], color: "#7000FF" },
    { pos: [0, 1.5, -2], color: "#7000FF" },
    { pos: [3, 1, -2], color: "#7000FF" },
    { pos: [-2, -1, 0], color: "#00F0FF" },
    { pos: [2, -1, 0], color: "#00F0FF" },
    { pos: [0, 0, 2], color: "#0052FF" },
  ], []);

  useFrame((state, delta) => {
    if (groupRef.current) {
      const targetX = (state.mouse.x * Math.PI) / 20;
      const targetY = (state.mouse.y * Math.PI) / 20;
      groupRef.current.rotation.y += (targetX - groupRef.current.rotation.y) * 0.03;
      groupRef.current.rotation.x += (-targetY - groupRef.current.rotation.x) * 0.03;
    }
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 10, 10]} intensity={0.5} color="#00F0FF" />
      <pointLight position={[-10, -10, -10]} intensity={0.3} color="#7000FF" />

      {/* Render Architecture Grid Layers with Reduced Opacity */}
      {layers.map((layer, idx) => (
        <group key={idx} position={[0, 0, layer.z]}>
          <gridHelper args={[10, 10, layer.color, "#0D131F"]} rotation={[Math.PI / 2, 0, 0]} />
        </group>
      ))}

      {/* Floating AST Nodes */}
      {nodes.map((node, idx) => (
        <Float key={idx} speed={1.2} rotationIntensity={0.2} floatIntensity={0.5}>
          <Box args={[0.35, 0.35, 0.35]} position={node.pos as [number, number, number]}>
            <meshStandardMaterial color={node.color} emissive={node.color} emissiveIntensity={0.15} roughness={0.5} />
          </Box>
        </Float>
      ))}

      {/* Subtle Connection Lines */}
      <Line points={[[-3, 1, -2], [-2, -1, 0]]} color="#00F0FF" lineWidth={1} transparent opacity={0.12} />
      <Line points={[[3, 1, -2], [2, -1, 0]]} color="#00F0FF" lineWidth={1} transparent opacity={0.12} />
      <Line points={[[-2, -1, 0], [0, 0, 2]]} color="#0052FF" lineWidth={1} transparent opacity={0.12} />
      <Line points={[[2, -1, 0], [0, 0, 2]]} color="#0052FF" lineWidth={1} transparent opacity={0.12} />
    </group>
  );
}
