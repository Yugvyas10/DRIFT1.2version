"use client";

import React, { useState } from "react";
import { Download, Check, Copy, FileText, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from "@/components/ui/modal";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const [copied, setCopied] = useState(false);
  const [downloadedFormat, setDownloadedFormat] = useState<string | null>(null);

  const handleCopySummary = () => {
    navigator.clipboard.writeText(
      "DRIFT Sentinel Report v1.4:\n- Target: POST /v2/orders\n- Status: 1 CRITICAL BREAKING CHANGE\n- Issue: `billing_zip` string required: true added without fallback\n- Replay Impact: 1,420 production shadow requests failed (HTTP 400 Bad Request)"
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = (format: "json" | "html") => {
    let content = "";
    let filename = "";
    let type = "";

    if (format === "json") {
      content = JSON.stringify(
        {
          sentinelVersion: "v1.4.2",
          timestamp: new Date().toISOString(),
          summary: {
            status: "CRITICAL_BREAKING",
            totalEndpoints: 14,
            breakingCount: 1,
            warningCount: 0,
            safeCount: 13,
          },
          breakingChanges: [
            {
              id: "brk_01",
              endpoint: "POST /v2/orders",
              parameter: "billing_zip",
              rule: "REQUIRED_PROPERTY_ADDED",
              severity: "CRITICAL",
              shadowReplayFailures: 1420,
            },
          ],
        },
        null,
        2
      );
      filename = "drift-sentinel-report.json";
      type = "application/json";
    } else {
      content = `<!DOCTYPE html>
<html>
<head><title>DRIFT Sentinel Report</title></head>
<body style="font-family: system-ui; background: #06080c; color: #fff; padding: 2rem;">
  <h1>DRIFT Sentinel Executive Compatibility Report</h1>
  <p>Status: <strong style="color: #f43f5e;">CRITICAL BREAKING CHANGE DETECTED</strong></p>
  <ul>
    <li>Target: POST /v2/orders</li>
    <li>Added Required Parameter: billing_zip</li>
    <li>Production Shadow Replay Failures: 1,420 requests</li>
  </ul>
</body>
</html>`;
      filename = "drift-sentinel-report.html";
      type = "text/html";
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloadedFormat(format);
    setTimeout(() => setDownloadedFormat(null), 2500);
  };

  return (
    <Modal open={isOpen} onOpenChange={onClose}>
      <ModalContent className="max-w-md bg-[#0D131F] border-slate-800">
        <ModalHeader>
          <ModalTitle className="text-lg text-white">Export Sentinel Report Artifacts</ModalTitle>
          <ModalDescription className="text-xs text-slate-400">Download or copy compatibility analysis outputs.</ModalDescription>
        </ModalHeader>

        <div className="space-y-3 py-3 font-sans">
          <Button variant="outline" className="w-full justify-between border-slate-800 bg-[#06080D]" onClick={() => handleDownloadFile("html")}>
            <span className="flex items-center gap-2 text-xs text-slate-200">
              <FileText className="h-4 w-4 text-emerald-400" /> Executive HTML Report (.html)
            </span>
            <Download className="h-3.5 w-3.5 text-slate-400" />
          </Button>

          <Button variant="outline" className="w-full justify-between border-slate-800 bg-[#06080D]" onClick={() => handleDownloadFile("json")}>
            <span className="flex items-center gap-2 text-xs text-slate-200">
              <Code className="h-4 w-4 text-drift-purple" /> Structured AST JSON Output (.json)
            </span>
            <Download className="h-3.5 w-3.5 text-slate-400" />
          </Button>

          <Button variant="glass" className="w-full justify-between border-slate-800" onClick={handleCopySummary}>
            <span className="flex items-center gap-2 text-xs text-drift-cyan">
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-drift-cyan" />}
              {copied ? "Summary Copied to Clipboard!" : "Copy Executive Summary Text"}
            </span>
          </Button>

          {downloadedFormat && (
            <p className="text-[11px] text-emerald-400 font-mono text-center pt-1">
              ✓ Downloaded drift-sentinel-report.{downloadedFormat}
            </p>
          )}
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={onClose} className="w-full text-xs">
            Close Modal
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
