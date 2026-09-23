import { NavItem, NavGroup } from "@/types";

export const siteConfig = {
  name: "DRIFT",
  description: "Enterprise Contract-Aware API Regression Sentinel. Compare OpenAPI contracts, replay shadow production traffic, classify breaking changes, and eliminate API regressions.",
  url: process.env.NEXT_PUBLIC_APP_URL || "https://drift.dev",
  version: "v1.4.2-enterprise",
  status: "All Systems Operational",
  statusUrl: "/status",
  githubUrl: "https://github.com/drift-platform/drift",
  docsUrl: "/docs",
  nav: [
    { title: "Home", href: "/" },
    { title: "Technology", href: "/technology" },
    { title: "Pipeline", href: "/interactive-pipeline" },
    { title: "Live Demo", href: "/live-demo" },
    { title: "Dashboard", href: "/dashboard" },
    { title: "Docs", href: "/docs" },
    { title: "Pricing", href: "/pricing" },
    { title: "Enterprise", href: "/enterprise" },
  ] as NavItem[],
  footerNav: {
    product: [
      { title: "Overview", href: "/" },
      { title: "Technology Stack", href: "/technology" },
      { title: "Interactive Pipeline", href: "/interactive-pipeline" },
      { title: "Live Demo Sandbox", href: "/live-demo" },
      { title: "Enterprise Platform", href: "/enterprise" },
      { title: "Pricing Tiers", href: "/pricing" },
    ],
    resources: [
      { title: "Documentation", href: "/docs" },
      { title: "API Reference", href: "/docs#api" },
      { title: "Engineering Blog", href: "/blog" },
      { title: "OpenAPI Spec Guide", href: "/docs#openapi" },
      { title: "Status Page", href: "https://status.drift.dev", isExternal: true },
    ],
    company: [
      { title: "About DRIFT", href: "/about" },
      { title: "Careers", href: "/about#careers" },
      { title: "Contact Sales", href: "/contact" },
      { title: "Security & Trust", href: "/enterprise#security" },
      { title: "Privacy Policy", href: "/privacy" },
      { title: "Terms of Service", href: "/terms" },
    ],
  },
};
