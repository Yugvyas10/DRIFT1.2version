import React from "react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | DRIFT API Sentinel",
  description: "Enterprise multi-service API compatibility, traffic replay, and sentinel run analytics.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-drift-dark text-slate-100">{children}</div>;
}
