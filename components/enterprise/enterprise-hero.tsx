"use client";

import React from "react";
import Link from "next/link";
import { ShieldAlert, ArrowRight, Building2, Lock, Cpu, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SpotlightCard } from "@/components/ui/spotlight-card";

export function EnterpriseHero() {
  return (
    <div className="space-y-12">
      <div className="text-center max-w-3xl mx-auto space-y-6">
        <Badge variant="default" className="px-3.5 py-1 font-mono text-xs shadow-cyan-glow">
          Enterprise Security & Scale
        </Badge>
        <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-tight">
          Enterprise API Compatibility <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-drift-cyan via-white to-drift-purple">
            at Scale
          </span>
        </h1>
        <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
          Centralized compatibility visibility, automated PR merge gates, dedicated eBPF shadow replay clusters, and auditability for enterprise platform engineering teams.
        </p>
        <div className="flex justify-center gap-4 pt-2">
          <Button size="lg" asChild variant="default" className="shadow-cyan-glow h-12 px-8">
            <Link href="/contact">Schedule Enterprise Architecture Review</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SpotlightCard className="space-y-3">
          <Building2 className="h-6 w-6 text-drift-cyan" />
          <h3 className="text-base font-bold text-white">Centralized Visibility</h3>
          <p className="text-xs text-slate-400 leading-relaxed">Monitor breaking change metrics across hundreds of microservices from a single enterprise dashboard.</p>
        </SpotlightCard>

        <SpotlightCard className="space-y-3">
          <Lock className="h-6 w-6 text-drift-purple" />
          <h3 className="text-base font-bold text-white">Air-Gapped & On-Prem</h3>
          <p className="text-xs text-slate-400 leading-relaxed">Deploy DRIFT WASM AST engines directly inside private Kubernetes clusters without exposing payload data.</p>
        </SpotlightCard>

        <SpotlightCard className="space-y-3">
          <GitBranch className="h-6 w-6 text-emerald-400" />
          <h3 className="text-base font-bold text-white">Automated CI/CD Gates</h3>
          <p className="text-xs text-slate-400 leading-relaxed">Block breaking API schema mutations automatically before pull requests reach production environments.</p>
        </SpotlightCard>
      </div>
    </div>
  );
}
