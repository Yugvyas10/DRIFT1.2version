"use client";

import React from "react";
import { GitBranch, GitPullRequest, ShieldAlert, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Stage6Cicd() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Stage 06: Automated CI/CD Integration & Merge Blocking</h3>
          <p className="text-xs text-slate-400">Deploying inline GitHub PR check annotations and blocking breaking deployments</p>
        </div>
        <Badge variant="breaking" className="font-mono">PR MERGE BLOCKED</Badge>
      </div>

      <div className="rounded-xl border border-slate-800 bg-[#06080D] p-6 space-y-4 font-mono text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <GitPullRequest className="h-4 w-4 text-drift-cyan" />
            <span className="text-slate-200 font-bold">Pull Request #402: Update Payment Checkout Schemas</span>
          </div>
          <span className="text-slate-500 text-[10px]">GitHub Checks API</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-2.5 rounded bg-slate-900 border border-slate-800">
            <div className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-emerald-400" />
              <span className="text-slate-300">Unit Tests & Linting</span>
            </div>
            <span className="text-emerald-400">PASSED</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded bg-rose-950/20 border border-rose-500/40 text-rose-300 font-bold">
            <div className="flex items-center space-x-2">
              <X className="h-4 w-4 text-rose-400" />
              <span>DRIFT API Contract Sentinel</span>
            </div>
            <span className="text-rose-400">FAILED (CRITICAL_BREAKING)</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 font-sans leading-relaxed pt-2">
          Merge button disabled until breaking contract schema mutation in <code className="text-white bg-slate-800 px-1 py-0.5 rounded">POST /v2/orders</code> is resolved.
        </p>
      </div>
    </div>
  );
}
