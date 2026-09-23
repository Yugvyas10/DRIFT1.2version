"use client";

import React, { useState } from "react";
import { Sparkles, Bot, Send, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";

const docsPresetQuestions = [
  "How do I install DRIFT CLI globally?",
  "What flags are accepted by `drift compare`?",
  "Explain the 6 stages of the DRIFT pipeline.",
  "How do I configure GitHub Actions inline PR checks?",
];

const docsAnswers: Record<string, string> = {
  "How do I install DRIFT CLI globally?":
    "Run `npm install -g @drift/cli` or use Homebrew on macOS: `brew install drift-cli`. Verify installation with `drift --version`.",
  "What flags are accepted by `drift compare`?":
    "`drift compare` takes `--baseline=<path>` (required), `--candidate=<path>` (required), `--traffic-corpus=<path>` (optional), `--format=<console|json|html>`, and `--out=<path>`.",
  "Explain the 6 stages of the DRIFT pipeline.":
    "1. Spec Validation\n2. Structural AST Diff\n3. Traffic Corpus Ingestion\n4. Shadow Replay Engine\n5. Severity Classification\n6. Multi-Format Report Generation.",
  "How do I configure GitHub Actions inline PR checks?":
    "Add `.github/workflows/drift.yml` using action `drift-sentinel/action@v1` with `API_KEY: ${{ secrets.DRIFT_API_KEY }}`.",
};

export function DocsAiAssistant() {
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(docsPresetQuestions[0]);
  const [customInput, setCustomInput] = useState("");

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    setSelectedQuestion(customInput);
    setCustomInput("");
  };

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button className="fixed bottom-6 right-6 z-40 flex items-center space-x-2 rounded-full border border-drift-purple/50 bg-drift-purple/15 px-4 py-2.5 text-xs font-semibold text-drift-purple shadow-[0_0_25px_rgba(112,0,255,0.3)] hover:scale-105 transition-all backdrop-blur-md">
          <Sparkles className="h-4 w-4 text-drift-purple animate-pulse" />
          <span>Ask DRIFT Docs AI</span>
        </button>
      </DrawerTrigger>

      <DrawerContent side="right" className="w-full sm:max-w-md bg-[#0A0E17] border-l border-slate-800 p-6 flex flex-col justify-between">
        <div className="space-y-6">
          <div className="flex items-center space-x-2.5 pb-4 border-b border-slate-800">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-drift-purple/40 bg-drift-purple/10 text-drift-purple">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">DRIFT Documentation AI Assistant</h3>
              <p className="text-[11px] text-slate-400">Search guides, commands, and architecture specs</p>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase text-slate-500 block">Suggested Docs Queries</span>
            <div className="space-y-1.5">
              {docsPresetQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => setSelectedQuestion(q)}
                  className="flex items-center justify-between w-full p-2 rounded-lg border border-slate-800 bg-[#06080D] text-xs text-slate-300 hover:border-drift-purple/40 hover:text-drift-purple transition-all text-left"
                >
                  <span className="truncate">{q}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 ml-2 text-slate-500" />
                </button>
              ))}
            </div>
          </div>

          {selectedQuestion && (
            <div className="p-4 rounded-xl border border-drift-purple/30 bg-[#06080D] space-y-3">
              <Badge variant="default" className="text-[10px]">DOCS ANSWER</Badge>
              <h4 className="text-xs font-bold text-white">{selectedQuestion}</h4>
              <p className="text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-line">
                {docsAnswers[selectedQuestion] || "Refer to `drift compare --help` or inspect the CLI Reference section in the docs portal."}
              </p>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="pt-4 border-t border-slate-800 flex gap-2">
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Ask a documentation question..."
            className="bg-[#06080D] border-slate-800 text-xs"
          />
          <Button type="submit" size="sm" variant="default" className="shadow-cyan-glow">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
