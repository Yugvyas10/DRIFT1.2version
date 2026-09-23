"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";

export function ChangelogTimeline() {
  return (
    <div className="space-y-6 border-l-2 border-slate-800 pl-6 ml-2 font-mono text-xs">
      {/* Release 1 */}
      <div className="relative space-y-2">
        <span className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full bg-drift-cyan border-4 border-[#04060A]" />
        <div className="flex items-center space-x-3">
          <Badge variant="default">v1.4.2 — LATEST RELEASE</Badge>
          <span className="text-slate-500 text-[10px]">August 2026</span>
        </div>
        <h4 className="font-bold text-white text-sm font-sans">Signature Pipeline Control Center & AI Docs Assistant</h4>
        <ul className="list-disc list-inside space-y-1 text-slate-300 font-sans text-xs">
          <li>Added interactive 6-stage execution control center playback bar (`Play/Pause`, `Step`, `1x/2x/5x`).</li>
          <li>Released persistent DRIFT Contract AI Assistant drawer for instant breaking change explanations.</li>
          <li>Upgraded OpenAPI 3.1 schema dereferencing parser engine to sub-15ms parsing.</li>
        </ul>
      </div>

      {/* Release 2 */}
      <div className="relative space-y-2">
        <span className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full bg-slate-700 border-4 border-[#04060A]" />
        <div className="flex items-center space-x-3">
          <Badge variant="outline">v1.3.0</Badge>
          <span className="text-slate-500 text-[10px]">July 2026</span>
        </div>
        <h4 className="font-bold text-white text-sm font-sans">Shadow Traffic Replay Engine</h4>
        <ul className="list-disc list-inside space-y-1 text-slate-300 font-sans text-xs">
          <li>Introduced eBPF packet mirror integration for 50,000+ request shadow replay.</li>
          <li>Added multi-format report generator (CLI text, JSON schema payload, HTML summary).</li>
        </ul>
      </div>
    </div>
  );
}
