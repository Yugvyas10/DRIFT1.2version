import React from "react";
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "@/styles/globals.css";
import { AppProviders } from "@/providers";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PageTransition } from "@/components/site/page-transition";
import { ScrollProgress } from "@/components/site/scroll-progress";
import { Toaster } from "@/components/ui/toaster";
import { GlobalSearchModal } from "@/components/layout/global-search-modal";

const sans = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const display = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://drift.dev"),
  title: {
    default: "DRIFT — Contract-Aware API Regression Sentinel",
    template: "%s · DRIFT",
  },
  description:
    "DRIFT is a premium developer platform for contract-aware API regression analysis. Catch breaking changes before they ship, with cinematic visual diffs and zero false positives.",
  keywords: [
    "API Testing",
    "OpenAPI 3.1",
    "API Regression Sentinel",
    "Shadow Traffic Replay",
    "AST Spec Diffing",
    "CI/CD PR Gates",
    "Platform Engineering",
  ],
  authors: [{ name: "DRIFT Engineering Team" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://drift.dev",
    siteName: "DRIFT API Sentinel",
    title: "DRIFT — Contract-Aware API Regression Sentinel",
    description:
      "Compare OpenAPI contracts and replay shadow production traffic with zero-regression confidence.",
  },
  twitter: {
    card: "summary_large_image",
    title: "DRIFT — Contract-Aware API Regression Sentinel",
    description:
      "Compare OpenAPI contracts and replay shadow production traffic with zero-regression confidence.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0f14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body
        className={`${sans.variable} ${mono.variable} ${display.variable} font-sans bg-background text-foreground antialiased`}
      >
        <AppProviders>
          <div className="relative min-h-screen flex flex-col">
            <ScrollProgress />
            <Navbar />
            <PageTransition>
              <main className="flex-1">{children}</main>
            </PageTransition>
            <Footer />
          </div>
          <Analytics />
          <Toaster />
          <GlobalSearchModal />
        </AppProviders>
      </body>
    </html>
  );
}
