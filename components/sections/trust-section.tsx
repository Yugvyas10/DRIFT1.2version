"use client";

import React from "react";
import { ShieldCheck, Lock, Server, Users, Award, Key } from "lucide-react";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionTitle } from "@/components/ui/section-title";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FadeIn } from "@/components/animations/fade-in";

const personaRoles = [
  { role: "Platform Teams", description: "Enforce API governance policies across 100+ microservices automatically." },
  { role: "Backend Engineers", description: "Deploy API contract updates with zero fear of breaking client SDKs." },
  { role: "DevOps & SREs", description: "Eliminate API-related production incidents and midnight rollback firetenders." },
  { role: "API Architects", description: "Standardize OpenAPI 3.1 specifications and schema dereferencing rules." },
];

export function TrustSection() {
  return (
    <SectionContainer gridBg id="trust">
      <SectionTitle
        badge="Enterprise Trust & Compliance"
        title="Built for High-Scale Engineering Organizations"
        description="DRIFT is engineered to meet strict SOC2 compliance standards while isolating sensitive production payloads."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {personaRoles.map((item, idx) => (
          <FadeIn key={item.role} delay={idx * 0.1}>
            <div className="rounded-xl border border-slate-800 bg-[#0A0E17] p-6 space-y-3 hover:border-slate-700 transition-colors">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-drift-cyan">
                <Users className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-white">{item.role}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
            </div>
          </FadeIn>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-slate-800 bg-[#06080D] p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-white">SOC2 Type II & In-Memory Sanitization</h4>
            <p className="text-xs text-slate-400">All traffic replay payloads are scrubbed for PII at the WASM buffer layer before AST comparison.</p>
          </div>
        </div>
        <div className="flex items-center space-x-3 shrink-0">
          <span className="font-mono text-xs text-slate-400 border border-slate-800 px-3 py-1.5 rounded-lg bg-slate-900">SAML / Okta SSO</span>
          <span className="font-mono text-xs text-drift-cyan border border-drift-cyan/30 px-3 py-1.5 rounded-lg bg-drift-cyan/10">Air-Gapped WASM</span>
        </div>
      </div>
    </SectionContainer>
  );
}
