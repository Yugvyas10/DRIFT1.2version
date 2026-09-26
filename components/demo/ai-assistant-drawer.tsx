"use client";

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Bot, Send, ArrowRight, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const presetQuestions = [
  "What is DRIFT and how does it work?",
  "Explain the 6 stages of the DRIFT pipeline.",
  "Why is `billing_zip` a critical breaking change?",
  "How do I set up GitHub Actions integration?",
];

export function AiAssistantDrawer() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello! I am the official DRIFT AI Assistant. Ask me anything about DRIFT, API contract diffing, 6-stage pipeline, microservices monitoring, or setup instructions!",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: textToSend },
    ];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: textToSend,
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();
      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply },
        ]);
      } else if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${data.error}` },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I encountered a network issue communicating with the Groq AI service. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input);
  };

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          className="fixed bottom-6 right-6 z-50 flex items-center space-x-2 rounded-full border border-drift-cyan/50 bg-[#0A0E17]/90 px-4 py-2.5 text-xs font-semibold text-drift-cyan shadow-[0_0_30px_rgba(0,240,255,0.35)] hover:scale-105 transition-all backdrop-blur-md cursor-pointer"
          aria-label="Open DRIFT AI Assistant"
        >
          <Sparkles className="h-4 w-4 text-drift-cyan animate-pulse" />
          <span>Ask DRIFT AI</span>
          <Badge
            variant="outline"
            className="text-[9px] border-drift-cyan/30 text-drift-cyan py-0 px-1 font-mono"
          >
            Groq LLaMA
          </Badge>
        </button>
      </DrawerTrigger>

      <DrawerContent
        side="right"
        className="w-full sm:max-w-md bg-[#0A0E17] border-l border-slate-800 p-6 flex flex-col justify-between h-full max-h-screen"
      >
        <div className="flex flex-col h-full space-y-4 overflow-hidden">
          {/* Drawer Header */}
          <div className="flex items-center space-x-2.5 pb-4 border-b border-slate-800 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-drift-cyan/40 bg-drift-cyan/10 text-drift-cyan">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">
                  DRIFT Contract AI Assistant
                </h3>
                <Badge
                  variant="default"
                  className="text-[9px] bg-drift-cyan/20 text-drift-cyan border-none"
                >
                  GROQ AI
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400">
                Strictly focused on DRIFT & API Sentinel questions
              </p>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="shrink-0 space-y-1.5">
            <span className="text-[10px] font-mono uppercase text-slate-500 block">
              Suggested Prompts
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {presetQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSendMessage(q)}
                  disabled={isLoading}
                  className="flex items-center justify-between p-2 rounded-lg border border-slate-800 bg-[#06080D] text-[11px] text-slate-300 hover:border-drift-cyan/40 hover:text-drift-cyan transition-all text-left truncate disabled:opacity-50"
                >
                  <span className="truncate">{q}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 ml-1 text-slate-500" />
                </button>
              ))}
            </div>
          </div>

          {/* Messages Thread Container */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 font-sans text-xs">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-drift-cyan/40 bg-drift-cyan/10 text-drift-cyan mt-0.5">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                )}
                <div
                  className={`p-3 rounded-xl max-w-[85%] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-drift-cyan/20 text-white border border-drift-cyan/30 font-medium"
                      : "bg-[#06080D] text-slate-200 border border-slate-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
                {msg.role === "user" && (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300 mt-0.5">
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-drift-cyan/40 bg-drift-cyan/10 text-drift-cyan">
                  <Bot className="h-3.5 w-3.5 animate-spin" />
                </div>
                <div className="p-3 rounded-xl bg-[#06080D] text-slate-400 border border-slate-800 flex items-center space-x-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-drift-cyan" />
                  <span className="text-xs">Thinking via Groq LLaMA...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Form Input */}
          <form
            onSubmit={handleSubmit}
            className="pt-3 border-t border-slate-800 flex gap-2 shrink-0"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask any DRIFT or API contract question..."
              className="bg-[#06080D] border-slate-800 text-xs focus:border-drift-cyan/50"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="sm"
              variant="default"
              disabled={isLoading || !input.trim()}
              className="shadow-cyan-glow"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
