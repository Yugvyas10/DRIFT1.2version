'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef, Suspense, useEffect } from 'react';
import * as THREE from 'three';

const MAX_TILT_RAD = 18 * (Math.PI / 180); // ~0.314 radians (18 degrees max tilt)

function DriftSphere({
  pointerRef,
  isHoveredRef,
}: {
  pointerRef: React.MutableRefObject<{ x: number; y: number }>;
  isHoveredRef: React.MutableRefObject<boolean>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);

  // Physics state: angle, velocity, idle accumulators
  const currentTilt = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const idleSpin = useRef(0);

  useFrame((state, delta) => {
    // Clamp delta to prevent physics explosion on lag spikes / tab switching
    const dt = Math.min(delta, 0.05);

    // 1. Calculate Target Orientation from Window Mouse Tracker
    let targetX = 0;
    let targetY = 0;

    if (isHoveredRef.current) {
      const { x, y } = pointerRef.current;
      targetX = THREE.MathUtils.clamp(-y * 0.45, -MAX_TILT_RAD, MAX_TILT_RAD);
      targetY = THREE.MathUtils.clamp(x * 0.45, -MAX_TILT_RAD, MAX_TILT_RAD);
    }

    // 2. Second-Order Spring-Mass-Damper Inertia Physics
    // Heavy physical mass parameters: smooth momentum, slight overshoot (~2%), zero jitter
    const stiffness = 14.0;
    const damping = 5.2;
    const mass = 1.4;

    // Pitch (X) axis
    const forceX = (targetX - currentTilt.current.x) * stiffness;
    const dragX = velocity.current.x * damping;
    const accelX = (forceX - dragX) / mass;
    velocity.current.x += accelX * dt;
    currentTilt.current.x += velocity.current.x * dt;

    // Yaw (Y) axis
    const forceY = (targetY - currentTilt.current.y) * stiffness;
    const dragY = velocity.current.y * damping;
    const accelY = (forceY - dragY) / mass;
    velocity.current.y += accelY * dt;
    currentTilt.current.y += velocity.current.y * dt;

    // 3. Continuous Idle Rotation
    idleSpin.current += dt * 0.08;

    if (groupRef.current) {
      groupRef.current.rotation.x = currentTilt.current.x;
      groupRef.current.rotation.y = currentTilt.current.y + idleSpin.current;
    }

    // Inner wireframe meshes spin relative to core
    if (meshRef.current) {
      meshRef.current.rotation.y += dt * 0.06;
      meshRef.current.rotation.z += dt * 0.02;
    }
    if (innerRef.current) {
      innerRef.current.rotation.y -= dt * 0.1;
      innerRef.current.rotation.x += dt * 0.03;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[2.2, 2]} />
        <meshBasicMaterial
          color="#2dd4bf"
          wireframe
          transparent
          opacity={0.25}
        />
      </mesh>
      <mesh ref={innerRef} scale={0.55}>
        <icosahedronGeometry args={[2.2, 1]} />
        <meshBasicMaterial
          color="#38bdf8"
          wireframe
          transparent
          opacity={0.18}
        />
      </mesh>
      <mesh scale={0.16}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color="#2dd4bf" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

function Particles({
  count = 140,
  pointerRef,
  isHoveredRef,
}: {
  count?: number;
  pointerRef: React.MutableRefObject<{ x: number; y: number }>;
  isHoveredRef: React.MutableRefObject<boolean>;
}) {
  const ref = useRef<THREE.Points>(null);
  const currentTiltX = useRef(0);
  const velocityX = useRef(0);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 3 + Math.random() * 2.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);

    let targetX = 0;
    if (isHoveredRef.current) {
      targetX = THREE.MathUtils.clamp(-pointerRef.current.y * 0.22, -0.18, 0.18);
    }

    const forceX = (targetX - currentTiltX.current) * 12.0;
    const dragX = velocityX.current * 5.0;
    const accelX = (forceX - dragX) / 1.4;
    velocityX.current += accelX * dt;
    currentTiltX.current += velocityX.current * dt;

    if (ref.current) {
      ref.current.rotation.y += dt * 0.03;
      ref.current.rotation.x = currentTiltX.current;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        color="#2dd4bf"
        transparent
        opacity={0.25}
        sizeAttenuation
      />
    </points>
  );
}

export function HeroScene({ className }: { className?: string }) {
  const pointerRef = useRef({ x: 0, y: 0 });
  const isHoveredRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Find hero section or fallback to container bounds
      const el = containerRef.current || document.body;
      const rect = el.getBoundingClientRect();

      const inBounds =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      isHoveredRef.current = inBounds;

      if (inBounds && rect.width > 0 && rect.height > 0) {
        // Calculate normalized coordinates [-1, 1] relative to hero section center
        const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const normY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        pointerRef.current = { x: normX, y: normY };
      }
    };

    const handleMouseLeave = () => {
      isHoveredRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div ref={containerRef} className={className}>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.3} />
          <DriftSphere pointerRef={pointerRef} isHoveredRef={isHoveredRef} />
          <Particles count={140} pointerRef={pointerRef} isHoveredRef={isHoveredRef} />
        </Suspense>
      </Canvas>
    </div>
  );
}
