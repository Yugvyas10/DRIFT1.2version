"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
}

export function CodeBlock({ code, language = "json", filename, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("overflow-hidden rounded-xl border border-slate-800 bg-[#06080D]", className)}>
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-[#0A0E17] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex space-x-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
          </div>
          {filename && (
            <span className="ml-2 font-mono text-xs text-slate-400">{filename}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase text-slate-500">{language}</span>
          <button
            onClick={copyToClipboard}
            className="flex h-7 w-7 items-center justify-center rounded border border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white transition-all"
            title="Copy code"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto p-4 font-mono text-xs text-slate-200 leading-relaxed">
        <pre>{code}</pre>
      </div>
    </div>
  );
}
