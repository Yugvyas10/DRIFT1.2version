import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DRIFT API Sentinel Platform",
    short_name: "DRIFT",
    description: "Contract-Aware API Regression Sentinel for OpenAPI specifications and shadow traffic replay.",
    start_url: "/",
    display: "standalone",
    background_color: "#06080C",
    theme_color: "#00F0FF",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
