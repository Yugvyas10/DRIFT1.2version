"use client";

import React, { useState } from "react";
import { Search } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const mockFaqs: FaqItem[] = [
  {
    id: "faq-1",
    question: "How does DRIFT shadow traffic replay work without impacting production users?",
    answer: "DRIFT uses non-intrusive eBPF network probes or API gateway mirrors to copy production HTTP requests, sanitize PII/auth credentials, and replay them asynchronously against candidate environment instances.",
  },
  {
    id: "faq-2",
    question: "What happens if I don't have a traffic corpus available?",
    answer: "DRIFT gracefully degrades to AST structural diffing and OpenAPI schema constraint validation. It will still catch added mandatory fields, removed endpoints, and type narrowing mutations.",
  },
  {
    id: "faq-3",
    question: "What OpenAPI versions are supported?",
    answer: "DRIFT natively parses OpenAPI 3.0.x and 3.1.x specifications formatted in either JSON or YAML schemas.",
  },
  {
    id: "faq-4",
    question: "How does DRIFT integrate into GitHub Actions PR checks?",
    answer: "DRIFT emits standard GitHub Checks API annotations inline on PR diff lines. If a breaking mutation is detected, the workflow exits with code 1, automatically disabling the PR merge button.",
  },
];

export function FaqAccordion() {
  const [search, setSearch] = useState("");

  const filtered = mockFaqs.filter(
    (f) => f.question.toLowerCase().includes(search.toLowerCase()) || f.answer.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter FAQ questions..."
        icon={<Search className="h-4 w-4" />}
      />

      <Accordion type="single" collapsible className="w-full space-y-2">
        {filtered.map((item) => (
          <AccordionItem key={item.id} value={item.id} className="border border-slate-800 bg-[#06080D] rounded-xl px-4">
            <AccordionTrigger className="text-xs font-bold text-slate-200 hover:text-drift-cyan font-sans py-3">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-xs text-slate-400 font-sans leading-relaxed pb-3">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
