"use client";

import React, { useState } from "react";
import { FileCode, CheckCircle2, ShieldCheck, ArrowRight } from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";
import { Badge } from "@/components/ui/badge";

export function Stage1Validation() {
  const [isValidated, setIsValidated] = useState(true);

  const sampleSpec = `{
  "openapi": "3.1.0",
  "info": { "title": "Payments API", "version": "1.3.0" },
  "paths": {
    "/v2/orders": {
      "post": {
        "summary": "Create Order",
        "parameters": [
          { "name": "billing_zip", "in": "query", "required": true }
        ]
      }
    }
  }
}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Stage 01: OpenAPI Spec Validation & AST Parsing</h3>
          <p className="text-xs text-slate-400">Dereferencing $ref schemas and validating specification syntax</p>
        </div>
        <Badge variant="success" className="font-mono">VALIDATION PASSED</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <span className="font-mono text-xs font-semibold text-slate-300 mb-2 block">Candidate Spec (v1.3.0)</span>
          <CodeBlock code={sampleSpec} filename="candidate.openapi.json" />
        </div>
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-slate-800 bg-[#06080D] space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span>OpenAPI Specification:</span>
              <span className="text-drift-cyan">v3.1.0</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Schema Dereferencing:</span>
              <span className="text-emerald-400">COMPLETE (14ms)</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Circular $ref Check:</span>
              <span className="text-emerald-400">NO LOOPS</span>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/10 flex items-center space-x-3 text-xs text-emerald-300 font-semibold">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <span>AST tree dereferenced and ready for structural delta computation.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
