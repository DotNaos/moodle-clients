import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  distDir: "dist",
  outputFileTracingExcludes: {
    "/api/study-bundles/[...path]": [
      "./package.json",
      "./next.config.ts",
      "../package.json",
      "../apps/web/package.json",
    ],
  },
  outputFileTracingIncludes: {
    "/api/study-bundles/[...path]": [
      "./study-bundles/**/*",
      "./study-bundles/high-performance-computing/manifest.json",
      "./study-bundles/high-performance-computing/script/**/*",
      "./study-bundles/high-performance-computing/tasks/**/*",
      "./study-bundles/high-performance-computing/assets/**/*",
    ],
  },
  typedRoutes: true,
};

export default nextConfig;
