"use client";

import React from "react";
import { GitBranch, ShieldCheck, CheckCircle2, RefreshCw } from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface IntegrationItem {
  id: string;
  name: string;
  category: string;
  status: "CONNECTED" | "AVAILABLE";
  detail: string;
}

const mockIntegrations: IntegrationItem[] = [
  { id: "1", name: "GitHub Actions Sentinel Gate", category: "CI/CD Pipeline", status: "CONNECTED", detail: "Enforces PR check gate on pull requests for Payments & Orders repos." },
  { id: "2", name: "GitLab CI Runner", category: "CI/CD Pipeline", status: "CONNECTED", detail: "Triggers shadow traffic replay during release candidate builds." },
  { id: "3", name: "Slack Alerting Webhook", category: "Notifications", status: "CONNECTED", detail: "Dispatches breaking compatibility notifications to #api-sentinel-alerts." },
  { id: "4", name: "Datadog Telemetry Sink", category: "Observability", status: "CONNECTED", detail: "Exports replay failure rates and AST mutation metrics." },
];

export function IntegrationsView() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {mockIntegrations.map((item) => (
        <SpotlightCard key={item.id} className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-[#06080D] text-drift-cyan">
                <GitBranch className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">{item.name}</h4>
                <p className="text-xs text-slate-400">{item.category}</p>
              </div>
            </div>
            <Badge variant="success" className="text-[10px]">
              {item.status}
            </Badge>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">{item.detail}</p>

          <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
            <span className="text-emerald-400 font-mono text-[10px]">HEALTH: 100% ONLINE</span>
            <Button size="sm" variant="outline" className="h-7 text-xs">Configure</Button>
          </div>
        </SpotlightCard>
      ))}
    </div>
  );
}
