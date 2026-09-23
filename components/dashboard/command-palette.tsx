"use client";

import React, { useState, useEffect } from "react";
import { Search, FolderGit2, FileText, FileCode, Settings, ArrowRight } from "lucide-react";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (action: string) => void;
}

const commandItems = [
  { id: "projects", title: "View API Projects", group: "Navigation", icon: <FolderGit2 className="h-4 w-4 text-drift-cyan" /> },
  { id: "reports", title: "Inspect Compatibility Reports", group: "Navigation", icon: <FileText className="h-4 w-4 text-drift-purple" /> },
  { id: "explorer", title: "Browse API Endpoints Explorer", group: "Navigation", icon: <FileCode className="h-4 w-4 text-emerald-400" /> },
  { id: "settings", title: "Generate Enterprise API Keys", group: "Actions", icon: <Settings className="h-4 w-4 text-amber-400" /> },
];

export function CommandPalette({ isOpen, onClose, onSelectAction }: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  const filtered = commandItems.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Modal open={isOpen} onOpenChange={onClose}>
      <ModalContent className="max-w-xl p-0 overflow-hidden bg-[#0A0E17] border-slate-800">
        <div className="flex items-center px-4 border-b border-slate-800">
          <Search className="h-4 w-4 text-drift-cyan mr-3 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search projects, reports, endpoints..."
            className="w-full h-12 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            autoFocus
          />
        </div>

        <div className="p-2 space-y-1 max-h-80 overflow-y-auto font-mono text-xs">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-xs font-sans">
              No matching commands or specs found for &quot;{query}&quot;
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onSelectAction(item.id);
                  onClose();
                }}
                className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-left"
              >
                <div className="flex items-center space-x-3">
                  {item.icon}
                  <span>{item.title}</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
              </button>
            ))
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
