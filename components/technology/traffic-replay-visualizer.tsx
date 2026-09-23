"use client";

import React, { useState, useEffect } from "react";
import { Play, Pause, RotateCcw, Activity, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RequestPacket {
  id: number;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  status: "PASSED" | "FAILED";
  latencyMs: number;
}

export function TrafficReplayVisualizer() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [packets, setPackets] = useState<RequestPacket[]>([]);
  const [passedCount, setPassedCount] = useState(1420);
  const [failedCount, setFailedCount] = useState(3);

  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const isFailed = Math.random() < 0.15;
      const methods: ("GET" | "POST" | "PUT" | "DELETE")[] = ["GET", "POST", "PUT", "DELETE"];
      const paths = ["/v1/users", "/v2/orders", "/v1/auth/token", "/v2/payments/charge"];
      
      const newPacket: RequestPacket = {
        id: Date.now(),
        method: methods[Math.floor(Math.random() * methods.length)],
        path: paths[Math.floor(Math.random() * paths.length)],
        status: isFailed ? "FAILED" : "PASSED",
        latencyMs: Math.floor(Math.random() * 18) + 4,
      };

      setPackets((prev) => [newPacket, ...prev.slice(0, 7)]);
      if (isFailed) {
        setFailedCount((c) => c + 1);
      } else {
        setPassedCount((c) => c + 1);
      }
    }, 600);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const resetSimulation = () => {
    setPackets([]);
    setPassedCount(0);
    setFailedCount(0);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#06080D] p-6 md:p-8 space-y-6 shadow-2xl">
      {/* Visualizer Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-drift-cyan animate-pulse" />
            <h3 className="text-lg font-bold text-white">Shadow Production Traffic Replay Simulator</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Replaying production HTTP payloads against candidate OpenAPI contract v1.3.0</p>
        </div>

        <div className="flex items-center space-x-3">
          <Button size="sm" variant="outline" onClick={() => setIsPlaying(!isPlaying)} className="h-8 text-xs">
            {isPlaying ? <Pause className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            {isPlaying ? "Pause Stream" : "Resume Stream"}
          </Button>
          <Button size="sm" variant="ghost" onClick={resetSimulation} className="h-8 text-xs text-slate-400">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Telemetry Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
        <div className="p-3 rounded-lg border border-slate-800 bg-[#0A0E17]">
          <span className="text-slate-500 uppercase text-[10px]">Total Replayed</span>
          <p className="text-lg font-bold text-white mt-0.5">{(passedCount + failedCount).toLocaleString()}</p>
        </div>
        <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-950/10">
          <span className="text-emerald-400 uppercase text-[10px]">Passed Compatible</span>
          <p className="text-lg font-bold text-emerald-400 mt-0.5">{passedCount.toLocaleString()}</p>
        </div>
        <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-950/10">
          <span className="text-rose-400 uppercase text-[10px]">Breaking Failures</span>
          <p className="text-lg font-bold text-rose-400 mt-0.5">{failedCount}</p>
        </div>
        <div className="p-3 rounded-lg border border-drift-cyan/30 bg-drift-cyan/10">
          <span className="text-drift-cyan uppercase text-[10px]">Replay Latency</span>
          <p className="text-lg font-bold text-drift-cyan mt-0.5">&lt; 8ms avg</p>
        </div>
      </div>

      {/* Live Stream Packets List */}
      <div className="space-y-2 font-mono text-xs min-h-[220px]">
        {packets.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-500">
            Click &quot;Resume Stream&quot; to begin replaying shadow traffic packets...
          </div>
        ) : (
          packets.map((pkt) => (
            <div
              key={pkt.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border transition-all animate-in fade-in-0 slide-in-from-top-2",
                pkt.status === "PASSED"
                  ? "border-emerald-500/30 bg-emerald-950/10 text-emerald-300"
                  : "border-rose-500/40 bg-rose-950/20 text-rose-300"
              )}
            >
              <div className="flex items-center space-x-3">
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                    pkt.method === "GET" && "bg-blue-500/20 text-blue-400 border border-blue-500/30",
                    pkt.method === "POST" && "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
                    pkt.method === "PUT" && "bg-amber-500/20 text-amber-400 border border-amber-500/30",
                    pkt.method === "DELETE" && "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  )}
                >
                  {pkt.method}
                </span>
                <span className="font-semibold text-slate-200">{pkt.path}</span>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-[10px] text-slate-400">{pkt.latencyMs}ms</span>
                {pkt.status === "PASSED" ? (
                  <Badge variant="success" className="text-[10px]">200 OK</Badge>
                ) : (
                  <Badge variant="breaking" className="text-[10px]">BREAKING 422</Badge>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
