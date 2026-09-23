"use client";

import React, { useState } from "react";
import { Play, RotateCcw, CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DiffViewer } from "@/components/demo/diff-viewer";

export function DocsPlayground() {
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(true);

  const handleSimulate = () => {
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
      setHasRun(true);
    }, 1200);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0A0E17] p-6 space-y-6 shadow-2xl">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white">Interactive Documentation Playground</h3>
          <p className="text-xs text-slate-400">Test simulated contract comparisons directly inside the documentation portal.</p>
        </div>
        <Button size="sm" variant="default" onClick={handleSimulate} isLoading={isRunning} className="shadow-cyan-glow">
          <Play className="mr-1.5 h-4 w-4" /> Run Comparison
        </Button>
      </div>

      <DiffViewer />
    </div>
  );
}
