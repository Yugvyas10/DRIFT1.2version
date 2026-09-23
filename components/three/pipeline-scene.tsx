"use client";

import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Float, Line, Sphere } from "@react-three/drei";

export function PipelineScene() {
  const groupRef = useRef<THREE.Group>(null!);
  const packetsRef = useRef<THREE.Group>(null!);

  const stagePoints: [number, number, number][] = useMemo(
    () => [
      [-5, 1, 0],
      [-3, -0.5, 0.5],
      [-1, 1.2, -0.5],
      [1, -0.8, 0.5],
      [3, 1, -0.5],
      [5, -0.2, 0],
    ],
    []
  );

  const curve = useMemo(() => {
    const vectors = stagePoints.map((p) => new THREE.Vector3(...p));
    return new THREE.CatmullRomCurve3(vectors);
  }, [stagePoints]);

  const curvePoints = useMemo(() => {
    return curve.getPoints(50).map((v) => [v.x, v.y, v.z] as [number, number, number]);
  }, [curve]);

  useFrame((state, delta) => {
    if (groupRef.current) {
      const targetX = (state.mouse.x * Math.PI) / 20;
      const targetY = (state.mouse.y * Math.PI) / 20;
      groupRef.current.rotation.y += (targetX - groupRef.current.rotation.y) * 0.03;
      groupRef.current.rotation.x += (-targetY - groupRef.current.rotation.x) * 0.03;
    }

    if (packetsRef.current) {
      packetsRef.current.children.forEach((child, idx) => {
        child.position.y += Math.sin(state.clock.elapsedTime * 1.5 + idx) * 0.002;
      });
    }
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={0.5} color="#00F0FF" />
      <pointLight position={[-10, -10, -10]} intensity={0.3} color="#7000FF" />

      {/* Render Spatial Curve Line with Soft Opacity */}
      <Line points={curvePoints} color="#00F0FF" lineWidth={1.2} transparent opacity={0.15} />

      {/* Render 6 Stage Nodes */}
      {stagePoints.map((pos, idx) => (
        <Float key={idx} speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
          <group position={pos}>
            <Sphere args={[0.26, 32, 32]}>
              <meshStandardMaterial
                color={idx === 2 ? "#00F0FF" : idx === 3 ? "#F43F5E" : "#7000FF"}
                emissive={idx === 2 ? "#00F0FF" : idx === 3 ? "#F43F5E" : "#7000FF"}
                emissiveIntensity={0.20}
                roughness={0.4}
              />
            </Sphere>
          </group>
        </Float>
      ))}
    </group>
  );
}
