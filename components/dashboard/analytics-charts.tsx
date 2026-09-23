"use client";

import React from "react";
import { Activity, TrendingUp, ShieldCheck, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export function AnalyticsCharts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Chart 1: Breaking Changes Over Time */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Compatibility Trend (30 Days)</CardTitle>
            <Activity className="h-4 w-4 text-drift-cyan" />
          </div>
          <CardDescription>Daily count of detected API schema deltas.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-44 flex items-end justify-between space-x-2 pt-4 px-2">
            {[45, 30, 60, 25, 80, 50, 40, 90, 35, 70, 45, 100].map((val, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  className="w-full bg-gradient-to-t from-drift-cyan/20 to-drift-cyan rounded-t group-hover:shadow-[0_0_15px_rgba(0,240,255,0.4)] transition-all"
                  style={{ height: `${val}%` }}
                />
                <span className="text-[9px] font-mono text-slate-500">d{idx + 1}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Chart 2: Traffic Replay Success Rate */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Traffic Replay Match Fidelity</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <CardDescription>Success rate of replayed HTTP requests across microservices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300">Payments Core API</span>
              <span className="text-emerald-400 font-bold">99.98%</span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: "99.98%" }} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300">Orders & Checkout Mesh</span>
              <span className="text-amber-400 font-bold">85.8% (14% Failing)</span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: "85.8%" }} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300">Auth & Identity Service</span>
              <span className="text-emerald-400 font-bold">100%</span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: "100%" }} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
