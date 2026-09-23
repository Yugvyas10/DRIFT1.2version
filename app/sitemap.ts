import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://drift.dev";
  const routes = [
    "",
    "/technology",
    "/interactive-pipeline",
    "/live-demo",
    "/dashboard",
    "/docs",
    "/pricing",
    "/enterprise",
    "/blog",
    "/about",
    "/contact",
    "/login",
    "/register",
    "/settings",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : 0.8,
  }));
}
