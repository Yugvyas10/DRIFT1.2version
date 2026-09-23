"use client";

import React, { useState } from "react";
import { Zap, Activity, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function PricingCalculator() {
  const [requestsK, setRequestsK] = useState(250); // 250k requests
  const [microservices, setMicroservices] = useState(8);

  // Dynamic estimate calculation
  const baseCost = 49;
  const requestCost = Math.floor((requestsK / 50) * 15);
  const totalEstimate = baseCost + requestCost + (microservices > 5 ? (microservices - 5) * 10 : 0);

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0A0E17] p-6 md:p-8 space-y-6 shadow-2xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <Badge variant="default" className="font-mono text-xs">INTERACTIVE ESTIMATOR</Badge>
          <h3 className="text-xl font-bold text-white mt-1">Usage Cost Calculator</h3>
          <p className="text-xs text-slate-400">Estimate your monthly pricing based on replayed traffic volume and microservices.</p>
        </div>
        <div className="text-left md:text-right font-mono">
          <span className="text-xs text-slate-500 block">ESTIMATED COST</span>
          <span className="text-3xl font-black text-drift-cyan">${totalEstimate}</span>
          <span className="text-xs text-slate-400"> / month</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
        {/* Slider 1: Replayed Request Volume */}
        <div className="space-y-3 font-mono text-xs">
          <div className="flex justify-between items-center text-slate-300">
            <span>Replayed Traffic Volume:</span>
            <span className="text-drift-cyan font-bold">{requestsK >= 1000 ? `${(requestsK / 1000).toFixed(1)}M` : `${requestsK}k`} reqs / mo</span>
          </div>
          <input
            type="range"
            min="50"
            max="2000"
            step="50"
            value={requestsK}
            onChange={(e) => setRequestsK(Number(e.target.value))}
            className="w-full accent-drift-cyan bg-slate-800 h-2 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>50k reqs</span>
            <span>2.0M reqs</span>
          </div>
        </div>

        {/* Slider 2: Microservices Count */}
        <div className="space-y-3 font-mono text-xs">
          <div className="flex justify-between items-center text-slate-300">
            <span>Monitored Microservices:</span>
            <span className="text-drift-purple font-bold">{microservices} Services</span>
          </div>
          <input
            type="range"
            min="1"
            max="30"
            step="1"
            value={microservices}
            onChange={(e) => setMicroservices(Number(e.target.value))}
            className="w-full accent-drift-purple bg-slate-800 h-2 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>1 Service</span>
            <span>30 Services</span>
          </div>
        </div>
      </div>
    </div>
  );
}
