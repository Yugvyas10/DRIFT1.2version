"use client";

import React from "react";
import { Plus, Minus, Edit3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiffLine {
  lineNumber: number;
  type: "added" | "removed" | "modified" | "unchanged";
  content: string;
}

const sampleDiffLines: DiffLine[] = [
  { lineNumber: 1, type: "unchanged", content: '{ "openapi": "3.1.0",' },
  { lineNumber: 2, type: "unchanged", content: '  "paths": {' },
  { lineNumber: 3, type: "unchanged", content: '    "/v2/orders": {' },
  { lineNumber: 4, type: "unchanged", content: '      "post": {' },
  { lineNumber: 5, type: "unchanged", content: '        "summary": "Create Order",' },
  { lineNumber: 6, type: "unchanged", content: '        "parameters": [' },
  { lineNumber: 7, type: "added", content: '          + { "name": "billing_zip", "in": "query", "required": true }' },
  { lineNumber: 8, type: "unchanged", content: "        ]" },
  { lineNumber: 9, type: "unchanged", content: "      }" },
  { lineNumber: 10, type: "unchanged", content: "    }" },
  { lineNumber: 11, type: "unchanged", content: "  }" },
  { lineNumber: 12, type: "unchanged", content: "}" },
];

export function DiffViewer() {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#04060A] font-mono text-xs overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 bg-[#0A0E17] px-4 py-2 text-slate-400 text-[11px]">
        <div className="flex items-center space-x-2">
          <Edit3 className="h-3.5 w-3.5 text-drift-cyan" />
          <span className="font-bold text-white">Structural AST Diff Matrix</span>
        </div>
        <div className="flex space-x-3 text-[10px]">
          <span className="text-emerald-400 font-bold">+1 Added</span>
          <span className="text-rose-400 font-bold">-0 Removed</span>
          <span className="text-amber-400 font-bold">~0 Modified</span>
        </div>
      </div>

      <div className="p-3 space-y-1">
        {sampleDiffLines.map((line) => (
          <div
            key={line.lineNumber}
            className={cn(
              "flex items-center space-x-3 px-2 py-0.5 rounded font-mono text-xs",
              line.type === "added" && "bg-emerald-950/30 text-emerald-300 font-bold border-l-2 border-emerald-400",
              line.type === "removed" && "bg-rose-950/30 text-rose-300 font-bold border-l-2 border-rose-400",
              line.type === "modified" && "bg-amber-950/30 text-amber-300 font-bold border-l-2 border-amber-400",
              line.type === "unchanged" && "text-slate-400"
            )}
          >
            <span className="text-slate-600 select-none w-6 text-right text-[10px]">{line.lineNumber}</span>
            <pre className="flex-1 whitespace-pre-wrap">{line.content}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
