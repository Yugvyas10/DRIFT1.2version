import React from "react";
import { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Dashboard | DRIFT API Sentinel",
  description:
    "Enterprise multi-service API compatibility, traffic replay, and sentinel run analytics.",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (
    !session &&
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "false"
  ) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-drift-dark text-slate-100">{children}</div>
  );
}
