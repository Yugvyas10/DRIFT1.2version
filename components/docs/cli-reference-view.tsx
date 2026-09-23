"use client";

import React from "react";
import { Terminal as TerminalIcon, Copy, Check } from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";
import { Terminal } from "@/components/ui/terminal";
import { Badge } from "@/components/ui/badge";

export function CliReferenceView() {
  const cliUsageSnippet = `# CLI Command Syntax
drift compare --baseline=<file> --candidate=<file> [options]

# Example Invocation
drift compare \\
  --baseline=./specs/v1.2.0.json \\
  --candidate=./specs/v1.3.0.json \\
  --traffic-corpus=./corpus/ebpf-prod.json \\
  --format=html \\
  --out=./reports/drift-report.html`;

  return (
    <div className="space-y-6 font-sans">
      <div>
        <div className="flex items-center space-x-3 mb-2">
          <Badge variant="default" className="font-mono text-xs">CLI v1.4.2</Badge>
          <span className="text-xs text-slate-400 font-mono">Command: drift compare</span>
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">DRIFT CLI Reference Specification</h2>
        <p className="text-sm text-slate-300 mt-1 leading-relaxed">
          The <code className="text-drift-cyan font-mono bg-slate-800 px-1 py-0.5 rounded">drift compare</code> command parses OpenAPI contracts, calculates structural AST deltas, replays shadow traffic, and emits compatibility signals.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">Command Usage</h3>
        <CodeBlock code={cliUsageSnippet} language="bash" filename="terminal-command.sh" />
      </div>

      {/* Options & Arguments Table */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">Supported Command Options</h3>
        <div className="rounded-xl border border-slate-800 bg-[#06080D] overflow-hidden font-mono text-xs">
          <div className="grid grid-cols-12 gap-2 border-b border-slate-800 bg-[#0A0E17] p-3 text-slate-500 font-bold uppercase text-[10px]">
            <span className="col-span-3">Flag / Option</span>
            <span className="col-span-2">Type</span>
            <span className="col-span-7">Description</span>
          </div>
          <div className="divide-y divide-slate-800/60">
            <div className="grid grid-cols-12 gap-2 p-3 items-center">
              <span className="col-span-3 text-drift-cyan font-bold">--baseline</span>
              <span className="col-span-2 text-slate-400">string (required)</span>
              <span className="col-span-7 text-slate-300 font-sans">Path to baseline OpenAPI 3.x JSON or YAML specification.</span>
            </div>
            <div className="grid grid-cols-12 gap-2 p-3 items-center">
              <span className="col-span-3 text-drift-purple font-bold">--candidate</span>
              <span className="col-span-2 text-slate-400">string (required)</span>
              <span className="col-span-7 text-slate-300 font-sans">Path to candidate target OpenAPI specification.</span>
            </div>
            <div className="grid grid-cols-12 gap-2 p-3 items-center">
              <span className="col-span-3 text-amber-400 font-bold">--traffic-corpus</span>
              <span className="col-span-2 text-slate-400">string (optional)</span>
              <span className="col-span-7 text-slate-300 font-sans">Path to eBPF recorded shadow traffic JSON corpus.</span>
            </div>
            <div className="grid grid-cols-12 gap-2 p-3 items-center">
              <span className="col-span-3 text-emerald-400 font-bold">--format</span>
              <span className="col-span-2 text-slate-400">console | json | html</span>
              <span className="col-span-7 text-slate-300 font-sans">Output format for generated compatibility report. Default: console.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
