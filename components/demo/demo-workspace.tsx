"use client";

import React, { useState } from "react";
import { Play, Download, RotateCcw, ShieldAlert, FileCode, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileExplorer } from "./file-explorer";
import { DiffViewer } from "./diff-viewer";
import { LiveConsole } from "./live-console";
import { ExportModal } from "./export-modal";
import { AiAssistantDrawer } from "./ai-assistant-drawer";
import { TrafficReplayVisualizer } from "@/components/technology/traffic-replay-visualizer";
import { CodeBlock } from "@/components/ui/code-block";

const specSamples: Record<string, string> = {
  baseline: `{
  "openapi": "3.0.3",
  "info": { "title": "Payments API", "version": "1.2.0" },
  "paths": {
    "/v2/orders": {
      "post": {
        "summary": "Create Order",
        "parameters": [
          { "name": "amount", "in": "query", "required": true }
        ]
      }
    }
  }
}`,
  candidate: `{
  "openapi": "3.1.0",
  "info": { "title": "Payments API", "version": "1.3.0" },
  "paths": {
    "/v2/orders": {
      "post": {
        "summary": "Create Order",
        "parameters": [
          { "name": "amount", "in": "query", "required": true },
          { "name": "billing_zip", "in": "query", "required": true }
        ]
      }
    }
  }
}`,
  corpus: `// eBPF Traffic Sample Corpus (50,000 requests)
[
  { "method": "POST", "path": "/v2/orders", "query": { "amount": 100 } },
  { "method": "POST", "path": "/v2/orders", "query": { "amount": 250 } }
]`,
  report: `<!-- DRIFT Sentinel HTML Executive Report -->
<h1>DRIFT Compatibility Evaluation Report</h1>
<p>Status: FAILED_CONTRACT_VERIFICATION</p>
<p>Critical Regressions: 1 (POST /v2/orders -> billing_zip required)</p>`,
  logs: `[1/5] Ingesting OpenAPI 3.1 contract AST... Done (12ms)
[2/5] Calculating AST delta matrix... Done (6ms)
[3/5] Replaying 50,000 shadow HTTP payloads... Done (84ms)
[4/5] Classifying runtime compatibility... Found 1 Breaking Mutation`,
};

export function DemoWorkspace() {
  const [activeFileId, setActiveFileId] = useState("baseline");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const handleRunAnalysis = () => {
    setIsAnalyzing(true);
    setAnalysisProgress(1);

    const timer1 = setTimeout(() => setAnalysisProgress(2), 500);
    const timer2 = setTimeout(() => setAnalysisProgress(3), 1200);
    const timer3 = setTimeout(() => setAnalysisProgress(4), 1900);
    const timer4 = setTimeout(() => {
      setAnalysisProgress(5);
      setIsAnalyzing(false);
    }, 2600);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0A0E17] p-4 md:p-6 space-y-6 shadow-2xl relative">
      {/* IDE Header Toolbar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <Badge variant="default" className="font-mono text-xs shadow-cyan-glow">
            DRIFT Sentinel IDE v1.4.2
          </Badge>
          <span className="text-xs text-slate-400">Project: Payment Checkout Microservices</span>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            size="sm"
            variant="default"
            onClick={handleRunAnalysis}
            isLoading={isAnalyzing}
            className="shadow-cyan-glow h-9 px-5"
          >
            <Play className="mr-1.5 h-4 w-4" /> Run Sentinel Analysis
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIsExportOpen(true)} className="h-9">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export Report
          </Button>
        </div>
      </div>

      {/* Progress Bar indicator */}
      {analysisProgress > 0 && (
        <div className="space-y-1.5 font-mono text-xs">
          <div className="flex items-center justify-between text-slate-300">
            <span>Analysis Execution Progress</span>
            <span className="text-drift-cyan">{analysisProgress === 5 ? "100% Complete" : `Stage 0${analysisProgress} of 05...`}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-drift-cyan via-drift-purple to-emerald-400 transition-all duration-500 rounded-full"
              style={{ width: `${(analysisProgress / 5) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Workspace Grid Layout: File Explorer (Left) + Split Editor/Viewer (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <FileExplorer activeFileId={activeFileId} onSelectFile={setActiveFileId} />
        </div>

        <div className="lg:col-span-3 space-y-6">
          <Tabs defaultValue="diff" className="w-full">
            <TabsList className="bg-[#06080D] border border-slate-800 p-1 mb-4">
              <TabsTrigger value="diff" className="text-xs">AST Diff Matrix</TabsTrigger>
              <TabsTrigger value="code" className="text-xs">Spec Code Viewer</TabsTrigger>
              <TabsTrigger value="console" className="text-xs">Live Console</TabsTrigger>
              <TabsTrigger value="replay" className="text-xs">Traffic Stream</TabsTrigger>
            </TabsList>

            <TabsContent value="diff">
              <DiffViewer />
            </TabsContent>

            <TabsContent value="code">
              <CodeBlock code={specSamples[activeFileId] || specSamples.baseline} language="json" filename={`${activeFileId}.json`} />
            </TabsContent>

            <TabsContent value="console">
              <LiveConsole progressStage={analysisProgress || 5} />
            </TabsContent>

            <TabsContent value="replay">
              <TrafficReplayVisualizer />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Floating AI Assistant Drawer Trigger */}
      <AiAssistantDrawer />

      {/* Export Modal */}
      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
    </div>
  );
}
