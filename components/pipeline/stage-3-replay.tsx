"use client";

import React from "react";
import { TrafficReplayVisualizer } from "@/components/technology/traffic-replay-visualizer";

export function Stage3Replay() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">Stage 03: Shadow Production Traffic Replay</h3>
        <p className="text-xs text-slate-400">Replaying recorded eBPF traffic payloads against candidate API endpoints</p>
      </div>
      <TrafficReplayVisualizer />
    </div>
  );
}
