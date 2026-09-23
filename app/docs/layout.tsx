import React from "react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation & Developer Portal | DRIFT API Sentinel",
  description: "Complete developer documentation, CLI command reference, OpenAPI AST parsing guide, shadow replay engine, and CI/CD integration guides.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-drift-dark text-slate-100">{children}</div>;
}
