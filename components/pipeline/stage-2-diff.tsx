"use client";

import React from "react";
import { GitCompare, AlertTriangle, Plus, Minus, Edit3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Stage2Diff() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Stage 02: Structural AST Diff Engine</h3>
          <p className="text-xs text-slate-400">Comparing AST nodes across endpoints, request bodies, and response payloads</p>
        </div>
        <Badge variant="breaking" className="font-mono">1 MUTATION DETECTED</Badge>
      </div>

      <div className="space-y-3 font-mono text-xs">
        <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/20 text-rose-300 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1.5 text-rose-400">
              <Plus className="h-4 w-4" /> REQUIRED PARAMETER ADDED
            </span>
            <span className="text-[10px] bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/40">CRITICAL_BREAKING</span>
          </div>
          <p className="text-slate-300 text-xs font-sans">
            Endpoint <code className="text-white bg-slate-800 px-1 py-0.5 rounded">POST /v2/orders</code> added mandatory query field <code className="text-rose-300 font-mono">billing_zip</code>.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/10 text-emerald-300 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1.5 text-emerald-400">
              <Plus className="h-4 w-4" /> OPTIONAL RESPONSE FIELD ADDED
            </span>
            <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/40">NON_BREAKING</span>
          </div>
          <p className="text-slate-300 text-xs font-sans">
            Endpoint <code className="text-white bg-slate-800 px-1 py-0.5 rounded">GET /v1/users</code> added optional field <code className="text-emerald-300 font-mono">created_timestamp</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
