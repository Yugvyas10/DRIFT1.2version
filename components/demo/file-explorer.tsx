"use client";

import React from "react";
import { FileCode, FileText, Database, Terminal, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileItem {
  id: string;
  name: string;
  type: "spec" | "corpus" | "report" | "log";
  icon: React.ReactNode;
}

const demoFiles: FileItem[] = [
  { id: "baseline", name: "baseline-v1.2.0.json", type: "spec", icon: <FileCode className="h-4 w-4 text-drift-cyan" /> },
  { id: "candidate", name: "candidate-v1.3.0.json", type: "spec", icon: <FileCode className="h-4 w-4 text-drift-purple" /> },
  { id: "corpus", name: "ebpf-traffic-corpus.json", type: "corpus", icon: <Database className="h-4 w-4 text-amber-400" /> },
  { id: "report", name: "sentinel-report.html", type: "report", icon: <FileText className="h-4 w-4 text-emerald-400" /> },
  { id: "logs", name: "sentinel-run.log", type: "log", icon: <Terminal className="h-4 w-4 text-slate-400" /> },
];

interface FileExplorerProps {
  activeFileId: string;
  onSelectFile: (id: string) => void;
  className?: string;
}

export function FileExplorer({ activeFileId, onSelectFile, className }: FileExplorerProps) {
  return (
    <div className={cn("rounded-xl border border-slate-800 bg-[#06080D] p-3 space-y-2 font-mono text-xs", className)}>
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[10px] uppercase text-slate-500 font-bold">
        <span>EXPLORER</span>
        <span>WORKSPACE</span>
      </div>
      <div className="space-y-1">
        {demoFiles.map((file) => {
          const isSelected = file.id === activeFileId;
          return (
            <button
              key={file.id}
              onClick={() => onSelectFile(file.id)}
              className={cn(
                "flex items-center justify-between w-full px-2.5 py-1.5 rounded transition-all text-left",
                isSelected
                  ? "bg-drift-slate text-drift-cyan font-bold border border-slate-700/60"
                  : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
              )}
            >
              <div className="flex items-center space-x-2 truncate">
                {file.icon}
                <span className="truncate">{file.name}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
