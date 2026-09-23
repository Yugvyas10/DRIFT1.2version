"use client";

import React, { useState } from "react";
import { FileText, Terminal as TerminalIcon, Code, Monitor } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CodeBlock } from "@/components/ui/code-block";
import { Terminal } from "@/components/ui/terminal";
import { Badge } from "@/components/ui/badge";

export function Stage5Report() {
  const jsonReport = `{
  "sentinel_run_id": "run_98f30192a",
  "baseline_spec": "Payments-v1.2.0",
  "candidate_spec": "Payments-v1.3.0",
  "status": "FAILED_CONTRACT_VERIFICATION",
  "severity_breakdown": {
    "safe": 3,
    "warning": 1,
    "critical_breaking": 1
  },
  "critical_mutations": [
    {
      "endpoint": "POST /v2/orders",
      "field": "billing_zip",
      "traffic_impact": "14.2% client traffic failing"
    }
  ]
}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Stage 05: Multi-Format Compatibility Report Generation</h3>
          <p className="text-xs text-slate-400">Rendering CLI console text, JSON payload, and rich HTML summaries</p>
        </div>
        <Badge variant="default" className="font-mono">REPORTS GENERATED</Badge>
      </div>

      <Tabs defaultValue="console" className="w-full">
        <TabsList className="bg-[#0A0E17] border border-slate-800 p-1 mb-4">
          <TabsTrigger value="console" className="flex items-center gap-2 text-xs">
            <TerminalIcon className="h-3.5 w-3.5 text-drift-cyan" /> CLI Console
          </TabsTrigger>
          <TabsTrigger value="json" className="flex items-center gap-2 text-xs">
            <Code className="h-3.5 w-3.5 text-drift-purple" /> JSON Output
          </TabsTrigger>
          <TabsTrigger value="html" className="flex items-center gap-2 text-xs">
            <Monitor className="h-3.5 w-3.5 text-emerald-400" /> HTML Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="console">
          <Terminal lines={[
            { type: "input", content: "drift report --run-id=run_98f30192a --format=text" },
            { type: "info", content: "DRIFT Sentinel Protection Report v1.4.2" },
            { type: "error", content: "STATUS: FAILED_CONTRACT_VERIFICATION (1 Critical Breaking Change)" },
            { type: "error", content: "Mutation: POST /v2/orders -> Added required field `billing_zip`" },
            { type: "success", content: "Report saved to ./reports/drift-report-run_98f30192a.html" },
          ]} />
        </TabsContent>

        <TabsContent value="json">
          <CodeBlock code={jsonReport} language="json" filename="drift-sentinel-report.json" />
        </TabsContent>

        <TabsContent value="html">
          <div className="p-6 rounded-xl border border-slate-800 bg-[#06080D] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-sm font-bold text-white">DRIFT Executive Compatibility Summary</h4>
              <Badge variant="breaking">CRITICAL_BREAKING</Badge>
            </div>
            <div className="grid grid-cols-3 gap-3 font-mono text-xs text-center">
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block text-[10px]">SAFE</span>
                <span className="text-emerald-400 font-bold">3 Diffs</span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block text-[10px]">WARNING</span>
                <span className="text-amber-400 font-bold">1 Deprecation</span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block text-[10px]">BREAKING</span>
                <span className="text-rose-400 font-bold">1 Outage Risk</span>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
