"use client";

import React from "react";
import { BookOpen, Terminal, Download, Layers, Play, HelpCircle, History, FileCode, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DocsNavSection {
  title: string;
  items: { id: string; label: string; badge?: string }[];
}

export const docsNavSections: DocsNavSection[] = [
  {
    title: "Getting Started",
    items: [
      { id: "overview", label: "Platform Overview" },
      { id: "installation", label: "Installation & Setup" },
      { id: "quickstart", label: "Quickstart Guide", badge: "5 min" },
    ],
  },
  {
    title: "CLI & Workflow",
    items: [
      { id: "cli", label: "CLI Reference (drift compare)", badge: "Core" },
      { id: "openapi", label: "OpenAPI 3.x Specs" },
      { id: "corpus", label: "Traffic Corpus & eBPF" },
    ],
  },
  {
    title: "Architecture & Pipeline",
    items: [
      { id: "pipeline", label: "6-Stage Pipeline Deep-Dive" },
      { id: "reports", label: "Compatibility Reports" },
      { id: "cicd", label: "CI/CD & GitHub Actions" },
    ],
  },
  {
    title: "Interactive & Reference",
    items: [
      { id: "playground", label: "Interactive Playground" },
      { id: "tutorials", label: "Step-by-Step Tutorials" },
      { id: "faq", label: "Frequently Asked Questions" },
      { id: "changelog", label: "Release Changelog" },
    ],
  },
];

interface DocsSidebarProps {
  activeSectionId: string;
  onSelectSection: (id: string) => void;
  className?: string;
}

export function DocsSidebar({ activeSectionId, onSelectSection, className }: DocsSidebarProps) {
  return (
    <aside className={cn("w-64 shrink-0 font-sans text-xs space-y-6 z-20", className)}>
      {docsNavSections.map((group) => (
        <div key={group.title} className="space-y-2">
          <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3">
            {group.title}
          </h4>
          <div className="space-y-1">
            {group.items.map((item) => {
              const isActive = activeSectionId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectSection(item.id)}
                  className={cn(
                    "flex items-center justify-between w-full px-3 py-2 rounded-lg transition-all text-left font-medium",
                    isActive
                      ? "bg-drift-cyan/15 text-drift-cyan border border-drift-cyan/30 shadow-[0_0_15px_rgba(0,240,255,0.15)] font-bold"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-[9px] text-slate-300">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}
