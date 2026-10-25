import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is intentionally off: every page here is per-user and DB-backed,
  // so we want plain dynamic rendering rather than a prerendered shell.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  poweredByHeader: false,
};

export default nextConfig;
