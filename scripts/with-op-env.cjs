#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const envFile = path.join(rootDir, ".env.op");
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/with-op-env.cjs <command> [...args]");
  process.exit(64);
}

const command =
  process.env.MOODLE_CLIENTS_OP_ENV_LOADED === "1" || !fs.existsSync(envFile)
    ? args
    : [
        "op",
        "run",
        `--env-file=${envFile}`,
        "--",
        "env",
        "MOODLE_CLIENTS_OP_ENV_LOADED=1",
        ...args,
      ];

const result = spawnSync(command[0], command.slice(1), {
  cwd: rootDir,
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(127);
}

process.exit(result.status ?? 1);
