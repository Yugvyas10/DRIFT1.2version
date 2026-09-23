"use client";

import React, { useState } from "react";
import { FileCode, Cpu, Network, ShieldCheck, FileText, ArrowRight, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

interface SystemNode {
  id: string;
  name: string;
  category: "INPUT" | "ENGINE" | "OUTPUT";
  icon: React.ReactNode;
  specs: string;
  details: string;
}

const systemNodes: SystemNode[] = [
  {
    id: "openapi_specs",
    name: "OpenAPI 3.x Specs",
    category: "INPUT",
    icon: <FileCode className="h-5 w-5 text-drift-cyan" />,
    specs: "YAML / JSON Parser • AST Dereferencing",
    details: "Baseline & candidate contract definitions parsed into normalized abstract syntax trees.",
  },
  {
    id: "ebpf_probes",
    name: "eBPF Traffic Probes",
    category: "INPUT",
    icon: <Network className="h-5 w-5 text-drift-purple" />,
    specs: "Zero Overhead • In-Memory PII Scrubbing",
    details: "Mirrors live production HTTP request payloads without adding latency to primary workloads.",
  },
  {
    id: "wasm_diff",
    name: "WASM AST Diff Core",
    category: "ENGINE",
    icon: <Cpu className="h-5 w-5 text-drift-cyan" />,
    specs: "Rust WASM Engine • Microsecond Delta Matrix",
    details: "Evaluates structural schema changes, parameter omissions, and type mutation bounds.",
  },
  {
    id: "ml_classifier",
    name: "Behavioral Classifier",
    category: "ENGINE",
    icon: <ShieldCheck className="h-5 w-5 text-emerald-400" />,
    specs: "Rule Evaluation • Blast Radius Graph",
    details: "Classifies changes into non-breaking, safe deprecation, and critical breaking regressions.",
  },
  {
    id: "report_dispatch",
    name: "Multi-Format Reporter",
    category: "OUTPUT",
    icon: <FileText className="h-5 w-5 text-amber-400" />,
    specs: "GitHub Checks • CLI JSON • HTML Summaries",
    details: "Dispatches inline PR code annotations, Slack notifications, and CI deployment blocks.",
  },
];

export function ArchitectureDiagram() {
  const [activeNode, setActiveNode] = useState<SystemNode>(systemNodes[2]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0A0E17] p-6 md:p-8 space-y-8 shadow-2xl">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="h-5 w-5 text-drift-cyan" />
            <h3 className="text-lg font-bold text-white">Interactive System Architecture Map</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Hover or select any node to inspect subsystem specifications</p>
        </div>
        <span className="font-mono text-xs text-drift-cyan border border-drift-cyan/30 px-3 py-1 rounded-full bg-drift-cyan/10">
          60 FPS Reactive Engine
        </span>
      </div>

      {/* Graph Nodes Connection Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
        {systemNodes.map((node) => {
          const isSelected = node.id === activeNode.id;
          return (
            <button
              key={node.id}
              onMouseEnter={() => setActiveNode(node)}
              onClick={() => setActiveNode(node)}
              className={cn(
                "flex flex-col justify-between p-4 rounded-xl border transition-all text-left relative z-10",
                isSelected
                  ? "border-drift-cyan bg-drift-cyan/15 shadow-[0_0_25px_rgba(0,240,255,0.2)]"
                  : "border-slate-800 bg-[#06080D] hover:border-slate-700"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-mono text-[10px] font-bold text-slate-500 uppercase">{node.category}</span>
                {node.icon}
              </div>
              <div className="mt-4">
                <h4 className="text-xs font-bold text-white">{node.name}</h4>
                <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">{node.specs}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Node Spec Inspector */}
      <div className="p-6 rounded-xl border border-drift-cyan/30 bg-[#06080D] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs text-drift-cyan font-bold uppercase">Subsystem Inspector</span>
            <span className="text-slate-600">•</span>
            <span className="text-xs font-bold text-white">{activeNode.name}</span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">{activeNode.details}</p>
        </div>
        <div className="p-3 rounded-lg border border-slate-800 bg-[#0A0E17] font-mono text-xs text-slate-400 shrink-0">
          <span className="text-drift-cyan font-bold">CAPABILITY SPEC</span>
          <p className="text-slate-200 mt-1">{activeNode.specs}</p>
        </div>
      </div>
    </div>
  );
}
