import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  distDir: "dist",
  outputFileTracingExcludes: {
    "/api/study-bundles/[...path]": [
      "./package.json",
      "./next.config.ts",
    ],
  },
  outputFileTracingIncludes: {
    "/api/study-bundles/[...path]": [
      "./study-bundles/**/*",
      "./study-bundles/high-performance-computing/manifest.json",
      "./study-bundles/high-performance-computing/script/**/*",
      "./study-bundles/high-performance-computing/tasks/**/*",
      "./study-bundles/high-performance-computing/assets/**/*",
      "./apps/web/study-bundles/high-performance-computing/manifest.json",
      "./apps/web/study-bundles/high-performance-computing/script/**/*",
      "./apps/web/study-bundles/high-performance-computing/tasks/**/*",
      "./apps/web/study-bundles/high-performance-computing/assets/**/*",
    ],
  },
  typedRoutes: true,
};

export default nextConfig;
