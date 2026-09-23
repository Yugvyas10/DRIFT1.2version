"use client";

import React, { useState } from "react";
import { Search, BookOpen, Terminal, ArrowRight } from "lucide-react";
import { Modal, ModalContent } from "@/components/ui/modal";

interface DocsSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (id: string) => void;
}

const docsSearchIndex = [
  { id: "cli", title: "drift compare command flags", category: "CLI Reference", snippet: "--baseline, --candidate, --traffic-corpus" },
  { id: "installation", title: "npm install -g @drift/cli", category: "Installation", snippet: "Install global binary for Mac, Linux, Docker" },
  { id: "pipeline", title: "Stage 03: Shadow Traffic Replay", category: "Architecture", snippet: "Replays recorded eBPF traffic against endpoints" },
  { id: "faq", title: "What if I have no traffic corpus?", category: "FAQ", snippet: "DRIFT falls back to AST structural diffing" },
];

export function DocsSearchModal({ isOpen, onClose, onSelectResult }: DocsSearchModalProps) {
  const [query, setQuery] = useState("");

  const filtered = docsSearchIndex.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.snippet.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Modal open={isOpen} onOpenChange={onClose}>
      <ModalContent className="max-w-xl p-0 overflow-hidden bg-[#0A0E17] border-slate-800">
        <div className="flex items-center px-4 border-b border-slate-800">
          <Search className="h-4 w-4 text-drift-cyan mr-3 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documentation, CLI commands, guides..."
            className="w-full h-12 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            autoFocus
          />
        </div>

        <div className="p-2 space-y-1 max-h-80 overflow-y-auto font-mono text-xs">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-xs font-sans">
              No documentation pages found matching &quot;{query}&quot;
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onSelectResult(item.id);
                  onClose();
                }}
                className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-left"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-drift-cyan uppercase font-bold">{item.category}</span>
                    <span className="font-bold text-white font-sans text-xs">{item.title}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans mt-0.5">{item.snippet}</p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-slate-500 shrink-0 ml-2" />
              </button>
            ))
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
