import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  distDir: "dist",
  outputFileTracingRoot: path.join(appDirectory, "../.."),
  outputFileTracingIncludes: {
    "/api/codex/run": [
      "../../node_modules/@openai/codex/**/*",
      "../../node_modules/@openai/codex-linux-x64/**/*",
      "../../node_modules/@openai/codex-linux-arm64/**/*",
    ],
  },
  typedRoutes: true,
};

export default nextConfig;
