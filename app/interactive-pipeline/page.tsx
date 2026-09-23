'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch,
  FileCode2,
  GitCompare,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Terminal,
  Eye,
  Activity,
  Cpu,
  Play,
  Layers,
} from 'lucide-react';
import { Reveal, StaggerGroup, staggerItem } from '@/components/site/primitives';
import { PageHero } from '@/components/site/page-hero';
import { PipelineControls } from '@/components/pipeline/pipeline-controls';
import { SideInspectorPanel } from '@/components/pipeline/side-inspector-panel';
import { Stage1Validation } from '@/components/pipeline/stage-1-validation';
import { Stage2Diff } from '@/components/pipeline/stage-2-diff';
import { Stage3Replay } from '@/components/pipeline/stage-3-replay';
import { Stage4Classification } from '@/components/pipeline/stage-4-classification';
import { Stage5Report } from '@/components/pipeline/stage-5-report';
import { Stage6Cicd } from '@/components/pipeline/stage-6-cicd';
import { ArchitectureDiagram } from '@/components/technology/architecture-diagram';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PIPELINE_STAGES } from '@/constants/pipeline';
import { cn } from '@/lib/utils';

const metrics = [
  { icon: Cpu, label: 'Core latency', value: '118ms' },
  { icon: Activity, label: 'Changes found', value: '3' },
  { icon: ShieldCheck, label: 'Breaking', value: '1' },
  { icon: Eye, label: 'Consumers hit', value: '3' },
];

export default function InteractivePipelinePage() {
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setActiveStageIndex((prev) => (prev + 1) % PIPELINE_STAGES.length);
    }, 4000 / speed);

    return () => clearInterval(interval);
  }, [isPlaying, speed]);

  const handleStepPrev = () => {
    setActiveStageIndex((prev) => Math.max(0, prev - 1));
  };

  const handleStepNext = () => {
    setActiveStageIndex((prev) => Math.min(PIPELINE_STAGES.length - 1, prev + 1));
  };

  const handleReset = () => {
    setActiveStageIndex(0);
    setIsPlaying(false);
  };

  return (
    <>
      <PageHero
        eyebrow="Interactive Pipeline"
        title={
          <>
            Watch a contract <span className="gradient-text">flow through DRIFT.</span>
          </>
        }
        description="Step through a real regression analysis — from PR trigger to merge gate. Each stage shows exactly what the engine sees and decides."
      >
        <div className="flex flex-col items-center gap-3 sm:flex-row justify-center">
          <Link
            href="/live-demo"
            className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_40px_-6px_hsl(174_72%_51%/0.6)]"
          >
            Launch Live Demo
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/technology"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-6 py-3.5 text-sm font-semibold text-foreground transition-all hover:border-primary/40"
          >
            View Tech Specs
          </Link>
        </div>
      </PageHero>

      <section className="section-pad relative">
        <div className="container-max">
          {/* Pipeline Controls Toolbar */}
          <Reveal variant="fade">
            <div className="mb-8">
              <PipelineControls
                activeStageIndex={activeStageIndex}
                totalStages={PIPELINE_STAGES.length}
                isPlaying={isPlaying}
                speed={speed}
                onTogglePlay={() => setIsPlaying(!isPlaying)}
                onStepPrev={handleStepPrev}
                onStepNext={handleStepNext}
                onReset={handleReset}
                onSpeedChange={setSpeed}
              />
            </div>
          </Reveal>

          {/* Pipeline Stage Stepper Buttons */}
          <StaggerGroup stagger={0.05} delayChildren={0}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
              {PIPELINE_STAGES.map((s, idx) => {
                const isActive = idx === activeStageIndex;
                return (
                  <motion.button
                    key={s.id}
                    variants={staggerItem}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setActiveStageIndex(idx);
                      setIsPlaying(false);
                    }}
                    className={cn(
                      'flex flex-col items-start p-3.5 rounded-xl border transition-colors text-left',
                      isActive
                        ? 'border-primary/50 bg-primary/10 text-primary shadow-[0_0_20px_-4px_hsl(174_72%_51%/0.3)]'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                    )}
                  >
                    <span className={cn('font-mono text-[10px] font-bold', isActive ? 'text-primary' : 'text-muted-foreground')}>
                      STAGE 0{s.stageNumber}
                    </span>
                    <h4 className="mt-1 text-xs font-semibold text-foreground truncate w-full">{s.shortName}</h4>
                  </motion.button>
                );
              })}
            </div>
          </StaggerGroup>

          {/* Dashboard Content: Mini-App (Left 2 cols) + Side Inspector Panel (Right 1 col) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 rounded-2xl glass-panel p-6 md:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeStageIndex}
                  initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  {activeStageIndex === 0 && <Stage1Validation />}
                  {activeStageIndex === 1 && <Stage2Diff />}
                  {activeStageIndex === 2 && <Stage3Replay />}
                  {activeStageIndex === 3 && <Stage4Classification />}
                  {activeStageIndex === 4 && <Stage5Report />}
                  {activeStageIndex === 5 && <Stage6Cicd />}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="lg:col-span-1">
              <SideInspectorPanel activeStageIndex={activeStageIndex} />
            </div>
          </div>

          {/* Metrics */}
          <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {metrics.map((m, i) => (
              <Reveal key={m.label} delay={i * 0.06}>
                <div className="glass-panel rounded-xl p-5 text-center">
                  <m.icon className="mx-auto h-5 w-5 text-primary" />
                  <p className="mt-3 font-display text-2xl font-semibold">
                    {m.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{m.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Enterprise Data Flow Architecture */}
      <section className="section-pad relative bg-background-2/30 border-t border-border/60">
        <div className="container-max space-y-8">
          <div className="text-center space-y-2">
            <Badge variant="outline" className="font-mono text-xs border-primary/40 text-primary">
              Enterprise Data Flow
            </Badge>
            <h2 className="font-display text-3xl font-semibold tracking-tight">
              OpenAPI Specs & Shadow Traffic Alignment
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Trace how raw API contracts and shadow production traffic streams merge before the replay & classification engine.
            </p>
          </div>
          <ArchitectureDiagram />
        </div>
      </section>
    </>
  );
}
