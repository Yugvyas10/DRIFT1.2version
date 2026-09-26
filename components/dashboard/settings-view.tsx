"use client";

import React, { useState } from "react";
import { Key, Copy, Check, Shield, Users, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function SettingsView() {
  const [apiKey, setApiKey] = useState("drift_live_98f30192a837c49120a");
  const [copied, setCopied] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateKey = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "GitHub Actions CI Sentinel Runner" }),
      });
      const data = await res.json();
      if (data.key?.key) {
        setApiKey(data.key.key);
      }
    } catch (e) {
      console.error("Failed to persist API key in DB:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* API Keys Generator */}
      <div className="rounded-2xl border border-slate-800 bg-[#0A0E17] p-6 space-y-4 shadow-xl">
        <div className="flex items-center space-x-2 pb-2 border-b border-slate-800">
          <Key className="h-5 w-5 text-drift-cyan" />
          <h3 className="text-base font-bold text-white">
            Enterprise API Sentinel Keys
          </h3>
        </div>
        <p className="text-xs text-slate-400">
          Use this API key in CLI or GitHub Actions runner to authenticate
          sentinel runs.
        </p>

        <div className="flex gap-3">
          <Input
            value={apiKey}
            readOnly
            className="font-mono text-xs bg-[#06080D] border-slate-800"
          />
          <Button
            variant="outline"
            onClick={handleCopyKey}
            className="shrink-0"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="default"
            onClick={handleGenerateKey}
            className="shadow-cyan-glow shrink-0"
          >
            Regenerate Key
          </Button>
        </div>
      </div>

      {/* Team Roles */}
      <div className="rounded-2xl border border-slate-800 bg-[#0A0E17] p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-drift-purple" />
            <h3 className="text-base font-bold text-white">
              Team Members & Permissions
            </h3>
          </div>
          <Button size="sm" variant="outline">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Invite Member
          </Button>
        </div>

        <div className="space-y-2 font-mono text-xs">
          <div className="flex justify-between items-center p-3 rounded-lg bg-[#06080D] border border-slate-800">
            <div>
              <p className="font-bold text-white font-sans">Tyrell (You)</p>
              <p className="text-[10px] text-slate-500 font-mono">
                tyrell@acme.corp
              </p>
            </div>
            <Badge variant="default">Lead Architect (Admin)</Badge>
          </div>
          <div className="flex justify-between items-center p-3 rounded-lg bg-[#06080D] border border-slate-800">
            <div>
              <p className="font-bold text-white font-sans">Sarah Jenkins</p>
              <p className="text-[10px] text-slate-500 font-mono">
                sarah@acme.corp
              </p>
            </div>
            <Badge variant="outline">DevOps Lead</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
