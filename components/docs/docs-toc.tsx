"use client";

import React from "react";
import { List } from "lucide-react";
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  label: string;
}

const defaultTocItems: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "installation", label: "Installation & Requirements" },
  { id: "cli-reference", label: "CLI Reference (drift compare)" },
  { id: "pipeline", label: "6-Stage Execution Pipeline" },
  { id: "playground", label: "Interactive Playground" },
  { id: "faq", label: "FAQ & Troubleshooting" },
];

interface DocsTocProps {
  activeId?: string;
  onSelectAnchor?: (id: string) => void;
  className?: string;
}

export function DocsToc({ activeId, onSelectAnchor, className }: DocsTocProps) {
  return (
    <div className={cn("w-56 shrink-0 font-sans text-xs space-y-3 hidden xl:block", className)}>
      <div className="flex items-center space-x-2 text-slate-400 font-mono text-[10px] uppercase font-bold tracking-wider">
        <List className="h-3.5 w-3.5 text-drift-cyan" />
        <span>On this page</span>
      </div>
      <div className="space-y-1.5 border-l border-slate-800 pl-3">
        {defaultTocItems.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={(e) => {
              if (onSelectAnchor) {
                e.preventDefault();
                onSelectAnchor(item.id);
              }
            }}
            className="block text-slate-400 hover:text-drift-cyan transition-colors truncate py-0.5 text-xs"
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
