"use client";

import React from "react";
import Link from "next/link";
import { Check, ShieldCheck, Zap, Building2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { MagneticButton } from "@/components/ui/magnetic-button";

export function PricingCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
      {/* 1. Community Plan */}
      <SpotlightCard className="flex flex-col justify-between space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Community</h3>
            <Badge variant="outline">FREE FOREVER</Badge>
          </div>
          <p className="text-xs text-slate-400">For students, open-source maintainers, and personal OpenAPI experimentation.</p>
          <div className="flex items-baseline space-x-1 font-mono">
            <span className="text-4xl font-black text-white">$0</span>
            <span className="text-xs text-slate-500">/ month</span>
          </div>

          <ul className="space-y-2.5 pt-4 border-t border-slate-800 text-xs text-slate-300 font-sans">
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>AST Structural OpenAPI 3.x Diffing</span>
            </li>
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>DRIFT CLI binary access</span>
            </li>
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Console CLI text reports</span>
            </li>
          </ul>
        </div>

        <MagneticButton className="w-full">
          <Button size="lg" asChild variant="outline" className="w-full">
            <Link href="/docs">Start Free</Link>
          </Button>
        </MagneticButton>
      </SpotlightCard>

      {/* 2. Professional Plan */}
      <SpotlightCard className="flex flex-col justify-between space-y-6 border-drift-cyan/50 shadow-[0_0_30px_rgba(0,240,255,0.15)] relative">
        <div className="absolute -top-3 right-6">
          <Badge variant="default" className="shadow-cyan-glow">MOST POPULAR</Badge>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Professional</h3>
            <Zap className="h-5 w-5 text-drift-cyan" />
          </div>
          <p className="text-xs text-slate-400">For growing engineering teams requiring shadow traffic replay and CI gates.</p>
          <div className="flex items-baseline space-x-1 font-mono">
            <span className="text-4xl font-black text-white">$49</span>
            <span className="text-xs text-slate-500">/ month per team</span>
          </div>

          <ul className="space-y-2.5 pt-4 border-t border-slate-800 text-xs text-slate-300 font-sans">
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-drift-cyan shrink-0" />
              <span>Everything in Community</span>
            </li>
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-drift-cyan shrink-0" />
              <span>50,000 Replayed Requests / mo</span>
            </li>
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-drift-cyan shrink-0" />
              <span>HTML & JSON Report Generation</span>
            </li>
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-drift-cyan shrink-0" />
              <span>GitHub Actions PR Check Gate</span>
            </li>
          </ul>
        </div>

        <MagneticButton className="w-full">
          <Button size="lg" asChild variant="default" className="w-full shadow-cyan-glow">
            <Link href="/register">Start Professional Trial</Link>
          </Button>
        </MagneticButton>
      </SpotlightCard>

      {/* 3. Enterprise Plan */}
      <SpotlightCard className="flex flex-col justify-between space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Enterprise</h3>
            <Building2 className="h-5 w-5 text-drift-purple" />
          </div>
          <p className="text-xs text-slate-400">For large microservice organizations requiring custom SLAs and eBPF clusters.</p>
          <div className="flex items-baseline space-x-1 font-mono">
            <span className="text-3xl font-black text-white">Custom</span>
          </div>

          <ul className="space-y-2.5 pt-4 border-t border-slate-800 text-xs text-slate-300 font-sans">
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-drift-purple shrink-0" />
              <span>Unlimited Shadow Traffic Replay</span>
            </li>
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-drift-purple shrink-0" />
              <span>Dedicated eBPF Cluster Probes</span>
            </li>
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-drift-purple shrink-0" />
              <span>Air-Gapped On-Prem Deployment</span>
            </li>
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-drift-purple shrink-0" />
              <span>SAML SSO & Audit Log Security</span>
            </li>
          </ul>
        </div>

        <MagneticButton className="w-full">
          <Button size="lg" asChild variant="glass" className="w-full border-slate-700">
            <Link href="/contact">Contact Sales</Link>
          </Button>
        </MagneticButton>
      </SpotlightCard>
    </div>
  );
}
