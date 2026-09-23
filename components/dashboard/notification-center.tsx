"use client";

import React from "react";
import { ShieldAlert, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";

interface NotificationItem {
  id: string;
  title: string;
  timestamp: string;
  severity: "breaking" | "warning" | "success";
  detail: string;
}

const mockNotifications: NotificationItem[] = [
  {
    id: "1",
    title: "PR #402 Blocked: Critical Breaking Mutation",
    timestamp: "2 mins ago",
    severity: "breaking",
    detail: "Mandatory parameter `billing_zip` added to POST /v2/orders without default value.",
  },
  {
    id: "2",
    title: "Shadow Replay Completed: 50,000 requests",
    timestamp: "14 mins ago",
    severity: "success",
    detail: "Replay executed against Candidate v1.3.0 with 99.98% match rate.",
  },
  {
    id: "3",
    title: "Header Deprecation Warning Issued",
    timestamp: "1 hour ago",
    severity: "warning",
    detail: "Header X-Legacy-Auth marked for removal in Payments v2.0 spec.",
  },
];

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent side="right" className="w-full sm:max-w-md bg-[#0A0E17] border-l border-slate-800 p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="h-5 w-5 text-drift-cyan" />
            <h3 className="text-sm font-bold text-white">Platform Notifications</h3>
          </div>
          <Badge variant="default" className="font-mono text-[10px]">
            3 NEW ALERTS
          </Badge>
        </div>

        <div className="space-y-3 font-mono text-xs">
          {mockNotifications.map((n) => (
            <div
              key={n.id}
              className="p-4 rounded-xl border border-slate-800 bg-[#06080D] space-y-2 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <Badge
                  variant={n.severity === "breaking" ? "breaking" : n.severity === "warning" ? "warning" : "success"}
                  className="text-[9px]"
                >
                  {n.severity.toUpperCase()}
                </Badge>
                <span className="text-[10px] text-slate-500">{n.timestamp}</span>
              </div>
              <h4 className="font-bold text-white text-xs font-sans">{n.title}</h4>
              <p className="text-slate-400 text-[11px] font-sans leading-relaxed">{n.detail}</p>
            </div>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
