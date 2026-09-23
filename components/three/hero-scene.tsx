"use client";

import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Float, Line, Sphere } from "@react-three/drei";

interface NodeData {
  id: string;
  position: [number, number, number];
  color: string;
  label: string;
}

export function HeroScene() {
  const groupRef = useRef<THREE.Group>(null!);
  const packetsRef = useRef<THREE.Group>(null!);

  // Define API Contract Nodes
  const nodes: NodeData[] = useMemo(
    () => [
      { id: "1", position: [-3.5, 1.5, 0], color: "#00F0FF", label: "GET /v1/users" },
      { id: "2", position: [0, 2.2, -1], color: "#0052FF", label: "POST /v2/orders" },
      { id: "3", position: [3.5, 1.2, 0.5], color: "#7000FF", label: "PUT /v1/payments" },
      { id: "4", position: [-2, -1.8, 1], color: "#00F0FF", label: "DELETE /v1/auth" },
      { id: "5", position: [2, -1.5, -0.5], color: "#33F3FF", label: "PATCH /v2/webhooks" },
      { id: "6", position: [0, -0.2, 0], color: "#00F0FF", label: "DRIFT Sentinel Core" },
    ],
    []
  );

  // Connection Lines between nodes
  const connections = useMemo(
    () => [
      [nodes[0].position, nodes[5].position],
      [nodes[1].position, nodes[5].position],
      [nodes[2].position, nodes[5].position],
      [nodes[3].position, nodes[5].position],
      [nodes[4].position, nodes[5].position],
      [nodes[0].position, nodes[1].position],
      [nodes[2].position, nodes[4].position],
    ],
    [nodes]
  );

  // Animate packet movement and group rotation
  useFrame((state, delta) => {
    if (groupRef.current) {
      const targetX = (state.mouse.x * Math.PI) / 16;
      const targetY = (state.mouse.y * Math.PI) / 16;
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
      {/* Soft Ambient & Point Lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.6} color="#00F0FF" />
      <pointLight position={[-10, -10, -10]} intensity={0.4} color="#7000FF" />

      {/* Subtle Connection Lines */}
      {connections.map(([start, end], idx) => (
        <Line
          key={idx}
          points={[start, end]}
          color={idx % 2 === 0 ? "#00F0FF" : "#0052FF"}
          lineWidth={0.8}
          transparent
          opacity={0.05}
        />
      ))}

      {/* Render API Contract Nodes with Ambient Emissive Lighting */}
      {nodes.map((node) => (
        <Float key={node.id} speed={1.5} rotationIntensity={0.3} floatIntensity={0.6}>
          <group position={node.position}>
            <Sphere args={[node.id === "6" ? 0.38 : 0.22, 32, 32]}>
              <meshStandardMaterial
                color={node.color}
                emissive={node.color}
                emissiveIntensity={node.id === "6" ? 0.25 : 0.12}
                roughness={0.5}
                metalness={0.5}
              />
            </Sphere>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[node.id === "6" ? 0.48 : 0.28, node.id === "6" ? 0.50 : 0.30, 32]} />
              <meshBasicMaterial color={node.color} transparent opacity={0.06} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </Float>
      ))}

      {/* Ambient Data Packet Particles */}
      <group ref={packetsRef}>
        {connections.map(([start, end], idx) => {
          const midX = (start[0] + end[0]) / 2;
          const midY = (start[1] + end[1]) / 2;
          const midZ = (start[2] + end[2]) / 2;

          return (
            <Sphere key={`packet-${idx}`} args={[0.05, 16, 16]} position={[midX, midY, midZ]}>
              <meshBasicMaterial color="#00F0FF" transparent opacity={0.3} />
            </Sphere>
          );
        })}
      </group>
    </group>
  );
}
