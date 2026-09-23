"use client";

import React from "react";
import { ShieldCheck, Lock, EyeOff, Server, FileText } from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";

export function SecurityMatrix() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <SpotlightCard className="space-y-3">
        <div className="flex items-center space-x-2 text-emerald-400">
          <EyeOff className="h-5 w-5" />
          <h4 className="font-bold text-white text-sm">Traffic Payload PII Sanitization</h4>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          eBPF network probes strip authorization headers, credit card numbers, and PII before shadow traffic payloads reach the WASM replay engine.
        </p>
      </SpotlightCard>

      <SpotlightCard className="space-y-3">
        <div className="flex items-center space-x-2 text-drift-cyan">
          <Server className="h-5 w-5" />
          <h4 className="font-bold text-white text-sm">Isolated AST Dereferencing</h4>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          OpenAPI AST resolution executes inside sandboxed WASM memory spaces with zero external network connectivity.
        </p>
      </SpotlightCard>

      <SpotlightCard className="space-y-3">
        <div className="flex items-center space-x-2 text-drift-purple">
          <Lock className="h-5 w-5" />
          <h4 className="font-bold text-white text-sm">SAML SSO & Role-Based Access</h4>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Integrate Okta, Azure AD, or Google Workspace for enterprise single sign-on and role-based permissions.
        </p>
      </SpotlightCard>

      <SpotlightCard className="space-y-3">
        <div className="flex items-center space-x-2 text-amber-400">
          <FileText className="h-5 w-5" />
          <h4 className="font-bold text-white text-sm">Immutable Audit Logs Roadmap</h4>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Every sentinel run, PR gate override, and schema deployment is recorded in immutable, timestamped audit logs.
        </p>
      </SpotlightCard>
    </div>
  );
}
