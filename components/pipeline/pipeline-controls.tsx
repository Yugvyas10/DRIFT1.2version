"use client";

import React from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RefreshCw,
  XCircle,
} from "lucide-react";
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
  onRetry?: () => void;
  onCancel?: () => void;
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
  onRetry,
  onCancel,
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
      {/* Playback Controls (Trigger, Pause, Step, Reset, Retry, Cancel) */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onStepPrev}
          disabled={activeStageIndex === 0}
          title="Previous Stage"
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={onTogglePlay}
          className="shadow-cyan-glow px-4"
        >
          {isPlaying ? (
            <Pause className="mr-1.5 h-4 w-4" />
          ) : (
            <Play className="mr-1.5 h-4 w-4" />
          )}
          <span>{isPlaying ? "Pause" : "Trigger / Play"}</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onStepNext}
          disabled={activeStageIndex === totalStages - 1}
          title="Next Stage"
        >
          <SkipForward className="h-4 w-4" />
        </Button>
        {onRetry && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="text-amber-400 hover:text-amber-300 border-amber-500/30"
            title="Retry Stage"
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            <span>Retry</span>
          </Button>
        )}
        {onCancel && (
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="text-rose-400 hover:text-rose-300 border-rose-500/30"
            title="Cancel Pipeline"
          >
            <XCircle className="mr-1 h-3.5 w-3.5" />
            <span>Cancel</span>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onReset}
          className="text-slate-400"
          title="Reset Pipeline"
        >
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
              speed === s
                ? "bg-drift-cyan text-drift-dark font-bold"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
