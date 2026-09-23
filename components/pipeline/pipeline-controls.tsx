"use client";

import React from "react";
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PipelineControlsProps {
  activeStageIndex: number;
  totalStages: number;
  isPlaying: boolean;
  speed: number;
  onTogglePlay: () => void;
  onStepPrev: () => void;
  onStepNext: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  className?: string;
}

export function PipelineControls({
  activeStageIndex,
  totalStages,
  isPlaying,
  speed,
  onTogglePlay,
  onStepPrev,
  onStepNext,
  onReset,
  onSpeedChange,
  className,
}: PipelineControlsProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-slate-800 bg-[#06080D]/90 backdrop-blur-md shadow-2xl",
        className
      )}
    >
      {/* Playback Controls */}
      <div className="flex items-center space-x-2">
        <Button size="sm" variant="outline" onClick={onStepPrev} disabled={activeStageIndex === 0}>
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="default" onClick={onTogglePlay} className="shadow-cyan-glow px-4">
          {isPlaying ? <Pause className="mr-1.5 h-4 w-4" /> : <Play className="mr-1.5 h-4 w-4" />}
          <span>{isPlaying ? "Pause" : "Play"}</span>
        </Button>
        <Button size="sm" variant="outline" onClick={onStepNext} disabled={activeStageIndex === totalStages - 1}>
          <SkipForward className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset} className="text-slate-400">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Active Stage Indicator */}
      <div className="flex items-center space-x-3">
        <Badge variant="default" className="font-mono text-xs">
          Stage 0{activeStageIndex + 1} of 0{totalStages}
        </Badge>
        <span className="h-2 w-2 rounded-full bg-drift-cyan animate-ping" />
      </div>

      {/* Speed Selector */}
      <div className="flex items-center space-x-1.5 border border-slate-800 rounded-lg p-1 bg-[#0A0E17]">
        {[1, 2, 5].map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={cn(
              "px-2.5 py-0.5 rounded font-mono text-xs transition-colors",
              speed === s ? "bg-drift-cyan text-drift-dark font-bold" : "text-slate-400 hover:text-slate-200"
            )}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
