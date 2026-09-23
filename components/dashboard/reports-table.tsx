"use client";

import React, { useState } from "react";
import { FileText, Search, Filter, ShieldCheck, AlertTriangle, XCircle, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription } from "@/components/ui/modal";

interface ReportItem {
  id: string;
  pr: string;
  project: string;
  status: "PASSED" | "WARNING" | "CRITICAL_BREAKING";
  breakingCount: number;
  warningsCount: number;
  timestamp: string;
  author: string;
}

const mockReports: ReportItem[] = [
  { id: "rep-101", pr: "PR #402: Add Zip Validation to Checkout", project: "Orders & Checkout", status: "CRITICAL_BREAKING", breakingCount: 1, warningsCount: 0, timestamp: "2m ago", author: "alex.dev" },
  { id: "rep-102", pr: "PR #398: Deprecate Legacy Token Header", project: "Payments Core", status: "WARNING", breakingCount: 0, warningsCount: 1, timestamp: "14m ago", author: "sarah.l" },
  { id: "rep-103", pr: "PR #395: Add Optional User Timestamp", project: "Auth Mesh", status: "PASSED", breakingCount: 0, warningsCount: 0, timestamp: "1h ago", author: "tyrell" },
  { id: "rep-104", pr: "PR #391: Refactor Billing Webhooks", project: "Webhooks Engine", status: "PASSED", breakingCount: 0, warningsCount: 0, timestamp: "3h ago", author: "marcus.t" },
];

export function ReportsTable() {
  const [filter, setFilter] = useState("");
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);

  const filteredReports = mockReports.filter((r) =>
    r.pr.toLowerCase().includes(filter.toLowerCase()) || r.project.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-72">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter reports by PR or project..."
            icon={<Search className="h-4 w-4" />}
          />
        </div>
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Filter className="h-3.5 w-3.5" />
          <span>Showing {filteredReports.length} reports</span>
        </div>
      </div>

      {/* Reports List Table */}
      <div className="rounded-xl border border-slate-800 bg-[#06080D] overflow-hidden font-mono text-xs shadow-lg">
        <div className="grid grid-cols-12 gap-2 border-b border-slate-800 bg-[#0A0E17] p-3 text-slate-500 font-bold uppercase text-[10px]">
          <span className="col-span-5">Pull Request & Description</span>
          <span className="col-span-3">Project</span>
          <span className="col-span-2">Status</span>
          <span className="col-span-2 text-right">Action</span>
        </div>

        <div className="divide-y divide-slate-800/60">
          {filteredReports.map((report) => (
            <div key={report.id} className="grid grid-cols-12 gap-2 p-3.5 items-center hover:bg-slate-800/40 transition-colors">
              <div className="col-span-5">
                <p className="font-bold text-white font-sans">{report.pr}</p>
                <p className="text-[10px] text-slate-500">{report.author} • {report.timestamp}</p>
              </div>
              <div className="col-span-3 text-slate-300 font-sans">{report.project}</div>
              <div className="col-span-2">
                <Badge
                  variant={report.status === "PASSED" ? "success" : report.status === "WARNING" ? "warning" : "breaking"}
                  className="text-[10px]"
                >
                  {report.status}
                </Badge>
              </div>
              <div className="col-span-2 text-right">
                <Button size="sm" variant="ghost" onClick={() => setSelectedReport(report)} className="h-7 text-xs text-drift-cyan">
                  Inspect <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Inspection Modal */}
      {selectedReport && (
        <Modal open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
          <ModalContent className="max-w-lg bg-[#0D131F] border-slate-800">
            <ModalHeader>
              <ModalTitle className="text-lg">{selectedReport.pr}</ModalTitle>
              <ModalDescription>Project: {selectedReport.project} • {selectedReport.timestamp}</ModalDescription>
            </ModalHeader>

            <div className="space-y-4 py-3 font-mono text-xs">
              <div className="p-3 rounded-lg border border-slate-800 bg-[#06080D] flex justify-between items-center">
                <span>Resulting Status:</span>
                <Badge variant={selectedReport.status === "PASSED" ? "success" : selectedReport.status === "WARNING" ? "warning" : "breaking"}>
                  {selectedReport.status}
                </Badge>
              </div>

              {selectedReport.status === "CRITICAL_BREAKING" && (
                <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/20 text-rose-300 space-y-2">
                  <span className="font-bold text-rose-400 block">Critical Breaking Mutation Detected:</span>
                  <p className="font-sans text-xs text-slate-300">
                    Endpoint <code className="text-white bg-slate-800 px-1 py-0.5 rounded">POST /v2/orders</code> added mandatory query field <code className="text-rose-300">billing_zip</code>. Replayed traffic failed 14.2% of live requests.
                  </p>
                </div>
              )}
            </div>
          </ModalContent>
        </Modal>
      )}
    </div>
  );
}
