"use client";

import React, { useState } from "react";
import { Sparkles, Bot, Send, X, HelpCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";

const presetQuestions = [
  "What changed in candidate v1.3.0?",
  "Why is `billing_zip` a critical breaking change?",
  "Explain the shadow traffic replay failure.",
  "How do I fix this in my pull request?",
];

const answersMap: Record<string, string> = {
  "What changed in candidate v1.3.0?":
    "Endpoint `POST /v2/orders` added a new mandatory query parameter named `billing_zip` (`required: true`). Three optional response fields were also added.",
  "Why is `billing_zip` a critical breaking change?":
    "Because existing mobile client SDKs and third-party API integrations send `POST /v2/orders` requests without `billing_zip`. Replaying production traffic proved that 14.2% of live requests fail validation when `required: true` is enforced.",
  "Explain the shadow traffic replay failure.":
    "DRIFT replayed 50,000 sanitized shadow production HTTP payloads against candidate v1.3.0. 7,100 requests returned HTTP 422 Unprocessable Entity because the client payload lacked `billing_zip`.",
  "How do I fix this in my pull request?":
    "Set `required: false` in `candidate.openapi.json` for `billing_zip` or provide a server-side default fallback in your API gateway controller before enforcing strict validation.",
};

export function AiAssistantDrawer() {
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(presetQuestions[0]);
  const [customInput, setCustomInput] = useState("");

  const handleSelectQuestion = (q: string) => {
    setSelectedQuestion(q);
  };

  const handleSendCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    setSelectedQuestion(customInput);
    setCustomInput("");
  };

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button className="fixed bottom-6 right-6 z-40 flex items-center space-x-2 rounded-full border border-drift-cyan/50 bg-drift-cyan/15 px-4 py-2.5 text-xs font-semibold text-drift-cyan shadow-[0_0_25px_rgba(0,240,255,0.3)] hover:scale-105 transition-all backdrop-blur-md">
          <Sparkles className="h-4 w-4 text-drift-cyan animate-pulse" />
          <span>Ask DRIFT AI Assistant</span>
        </button>
      </DrawerTrigger>

      <DrawerContent side="right" className="w-full sm:max-w-md bg-[#0A0E17] border-l border-slate-800 p-6 flex flex-col justify-between">
        <div className="space-y-6">
          <div className="flex items-center space-x-2.5 pb-4 border-b border-slate-800">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-drift-cyan/40 bg-drift-cyan/10 text-drift-cyan">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">DRIFT Contract AI Assistant</h3>
              <p className="text-[11px] text-slate-400">Instant explanations for breaking schema deltas</p>
            </div>
          </div>

          {/* Preset Questions */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase text-slate-500 block">Suggested Questions</span>
            <div className="space-y-1.5">
              {presetQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSelectQuestion(q)}
                  className="flex items-center justify-between w-full p-2 rounded-lg border border-slate-800 bg-[#06080D] text-xs text-slate-300 hover:border-drift-cyan/40 hover:text-drift-cyan transition-all text-left"
                >
                  <span className="truncate">{q}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 ml-2 text-slate-500" />
                </button>
              ))}
            </div>
          </div>

          {/* Active Question & Answer */}
          {selectedQuestion && (
            <div className="p-4 rounded-xl border border-drift-cyan/30 bg-[#06080D] space-y-3">
              <Badge variant="default" className="text-[10px]">AI EXPLANATION</Badge>
              <h4 className="text-xs font-bold text-white">{selectedQuestion}</h4>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                {answersMap[selectedQuestion] || "Based on AST dereferencing and shadow replay logs, this field mutation directly causes HTTP 422 payload rejection in 14.2% of production requests."}
              </p>
            </div>
          )}
        </div>

        {/* Question Input Form */}
        <form onSubmit={handleSendCustom} className="pt-4 border-t border-slate-800 flex gap-2">
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Ask about this API diff..."
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
