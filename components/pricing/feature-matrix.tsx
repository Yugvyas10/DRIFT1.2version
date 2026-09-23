"use client";

import React from "react";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface FeatureRow {
  name: string;
  community: boolean | string;
  professional: boolean | string;
  enterprise: boolean | string;
}

const matrixRows: FeatureRow[] = [
  { name: "OpenAPI 3.0 & 3.1 AST Parsing", community: true, professional: true, enterprise: true },
  { name: "CLI Binary Execution (drift compare)", community: true, professional: true, enterprise: true },
  { name: "Console CLI Text Reports", community: true, professional: true, enterprise: true },
  { name: "HTML & JSON Structured Reports", community: false, professional: true, enterprise: true },
  { name: "Replayed Shadow Traffic Volume", community: "None (AST Only)", professional: "50,000 / mo", enterprise: "Unlimited" },
  { name: "GitHub Actions Inline PR Check Gate", community: false, professional: true, enterprise: true },
  { name: "Dashboard Telemetry & Replay Stream", community: false, professional: true, enterprise: true },
  { name: "Dedicated eBPF Cluster Mirror Probes", community: false, professional: false, enterprise: true },
  { name: "Air-Gapped On-Premises Deployment", community: false, professional: false, enterprise: true },
  { name: "SAML SSO & Security Audit Logs", community: false, professional: false, enterprise: true },
];

export function FeatureMatrix() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#06080D] overflow-hidden shadow-2xl font-mono text-xs">
      <div className="grid grid-cols-12 gap-2 border-b border-slate-800 bg-[#0A0E17] p-4 font-bold text-white text-xs">
        <span className="col-span-6">Platform Capabilities</span>
        <span className="col-span-2 text-center text-slate-400">Community</span>
        <span className="col-span-2 text-center text-drift-cyan">Professional</span>
        <span className="col-span-2 text-center text-drift-purple">Enterprise</span>
      </div>

      <div className="divide-y divide-slate-800/60 font-sans">
        {matrixRows.map((row, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 p-3.5 items-center hover:bg-slate-800/30 transition-colors">
            <span className="col-span-6 font-semibold text-slate-200">{row.name}</span>
            
            <div className="col-span-2 flex justify-center text-xs">
              {typeof row.community === "boolean" ? (
                row.community ? <Check className="h-4 w-4 text-emerald-400" /> : <X className="h-4 w-4 text-slate-600" />
              ) : (
                <span className="text-[10px] text-slate-400 font-mono">{row.community}</span>
              )}
            </div>

            <div className="col-span-2 flex justify-center text-xs">
              {typeof row.professional === "boolean" ? (
                row.professional ? <Check className="h-4 w-4 text-drift-cyan font-bold" /> : <X className="h-4 w-4 text-slate-600" />
              ) : (
                <span className="text-[10px] text-drift-cyan font-mono font-bold">{row.professional}</span>
              )}
            </div>

            <div className="col-span-2 flex justify-center text-xs">
              {typeof row.enterprise === "boolean" ? (
                row.enterprise ? <Check className="h-4 w-4 text-drift-purple font-bold" /> : <X className="h-4 w-4 text-slate-600" />
              ) : (
                <span className="text-[10px] text-drift-purple font-mono font-bold">{row.enterprise}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
