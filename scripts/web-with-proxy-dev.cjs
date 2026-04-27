const { spawn } = require("node:child_process");
const path = require("node:path");

const proxyPort = process.env.MOODLE_PROXY_PORT || "3000";
const proxyBaseUrl =
  process.env.EXPO_PUBLIC_MOODLE_PROXY_BASE_URL ||
  `http://localhost:${proxyPort}/api/moodle-proxy`;
const rootDir = path.resolve(__dirname, "..");
const children = [];

const proxyProcess = spawn(process.execPath, [path.join(rootDir, "scripts", "moodle-proxy-dev.cjs")], {
  cwd: rootDir,
  env: {
    ...process.env,
    MOODLE_PROXY_PORT: proxyPort,
  },
  stdio: "inherit",
});
children.push(proxyProcess);

const webProcess = spawn(getPnpmCommand(), ["--filter", "@moodle-clients/web", "dev:expo"], {
  cwd: rootDir,
  env: {
    ...process.env,
    EXPO_PUBLIC_MOODLE_PROXY_BASE_URL: proxyBaseUrl,
  },
  stdio: "inherit",
});
children.push(webProcess);

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown(code);
    }
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

function shutdown(code) {
  while (children.length > 0) {
    const child = children.pop();
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
  }

  process.exit(code);
}

function getPnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}
