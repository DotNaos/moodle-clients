const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const target = process.argv[2] || "start";
const allowedTargets = new Set(["start", "ios", "android"]);

if (!allowedTargets.has(target)) {
  console.error(`Unknown mobile target: ${target}`);
  process.exit(1);
}

const proxyPort = process.env.MOODLE_PROXY_PORT || "3000";
const devHost = process.env.MOODLE_PROXY_HOST || getLanAddress() || "127.0.0.1";
const localBaseUrl = `http://${devHost}:${proxyPort}`;
const proxyBaseUrl =
  process.env.EXPO_PUBLIC_MOODLE_PROXY_BASE_URL ||
  `${localBaseUrl}/api/moodle-proxy`;
const moodleSessionImportUrl =
  process.env.EXPO_PUBLIC_MOODLE_SESSION_IMPORT_URL ||
  `${localBaseUrl}/api/moodle-cli-session`;
const rootDir = path.resolve(__dirname, "..");
const children = [];

const proxyProcess = spawn(
  process.execPath,
  [path.join(rootDir, "scripts", "moodle-proxy-dev.cjs")],
  {
    cwd: rootDir,
    env: {
      ...process.env,
      MOODLE_PROXY_PORT: proxyPort,
      DISABLE_CODEX_RUN: "1",
    },
    stdio: "inherit",
  },
);
children.push(proxyProcess);

const mobileProcess = spawn(
  getBunCommand(),
  ["run", "--filter", "@moodle-clients/mobile", target],
  {
    cwd: rootDir,
    env: {
      ...process.env,
      EXPO_PUBLIC_MOODLE_PROXY_BASE_URL: proxyBaseUrl,
      EXPO_PUBLIC_MOODLE_SESSION_IMPORT_URL: moodleSessionImportUrl,
    },
    stdio: "inherit",
  },
);
children.push(mobileProcess);

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

function getBunCommand() {
  return process.platform === "win32" ? "bun.exe" : "bun";
}

function getLanAddress() {
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }

  return "";
}
