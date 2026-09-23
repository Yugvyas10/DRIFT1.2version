"use client";

import React from "react";
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function Stage4Classification() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Stage 04: Behavioral Compatibility Classification</h3>
          <p className="text-xs text-slate-400">Sorting schema & traffic evidence into 3 severity buckets</p>
        </div>
        <Badge variant="breaking" className="font-mono">CRITICAL_BREAKING</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Bucket 1: Safe */}
        <Card className="border-emerald-500/30 bg-emerald-950/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold text-emerald-400 uppercase font-mono">Bucket 1: Safe</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-300">
            <p className="font-semibold text-white">3 Non-Breaking Additions</p>
            <p className="text-[11px] text-slate-400">New optional response fields; client SDKs unaffected.</p>
          </CardContent>
        </Card>

        {/* Bucket 2: Risky / Warning */}
        <Card className="border-amber-500/30 bg-amber-950/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold text-amber-400 uppercase font-mono">Bucket 2: Deprecation</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-300">
            <p className="font-semibold text-white">1 Deprecated Header</p>
            <p className="text-[11px] text-slate-400">Header marked for removal in v2.0; warning issued.</p>
          </CardContent>
        </Card>

        {/* Bucket 3: Critical Breaking */}
        <Card className="border-rose-500/40 bg-rose-950/20 shadow-[0_0_20px_rgba(244,63,94,0.15)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold text-rose-400 uppercase font-mono">Bucket 3: Critical Breaking</CardTitle>
            <XCircle className="h-4 w-4 text-rose-400" />
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-300">
            <p className="font-semibold text-white">1 Critical Regression</p>
            <p className="text-[11px] text-slate-300">Mandatory parameter added without default; 14.2% client traffic failing.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
