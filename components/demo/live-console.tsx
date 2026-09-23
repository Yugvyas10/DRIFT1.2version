"use client";

import React from "react";
import { Terminal } from "@/components/ui/terminal";

interface LiveConsoleProps {
  progressStage: number;
}

export function LiveConsole({ progressStage }: LiveConsoleProps) {
  const getLines = () => {
    const lines: Array<{ type?: "input" | "output" | "error" | "success" | "info"; content: string }> = [
      { type: "input", content: "drift diff --baseline=v1.2.0.json --candidate=v1.3.0.json --traffic-corpus=ebpf-corpus.json" },
    ];

    if (progressStage >= 1) {
      lines.push({ type: "info", content: "[1/5] Validating OpenAPI 3.1 specifications... Done (12ms)" });
    }
    if (progressStage >= 2) {
      lines.push({ type: "info", content: "[2/5] Dereferencing AST schema tree... Done (6ms)" });
    }
    if (progressStage >= 3) {
      lines.push({ type: "info", content: "[3/5] Computing structural AST delta matrix... Found 1 required parameter mutation" });
    }
    if (progressStage >= 4) {
      lines.push({ type: "info", content: "[4/5] Replaying 50,000 shadow HTTP payloads... 14.2% failing client requests" });
    }
    if (progressStage >= 5) {
      lines.push({ type: "error", content: "CRITICAL: Added mandatory parameter `billing_zip` without fallback default" });
      lines.push({ type: "success", content: "Pipeline complete: Output dispatched to ./reports/sentinel-report.html" });
    }

    return lines;
  };

  return <Terminal lines={getLines()} title="DRIFT Sentinel CLI Live Execution Console" />;
}
