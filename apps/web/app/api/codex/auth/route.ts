import { auth } from "@clerk/nextjs/server";
import { Sandbox } from "@vercel/sandbox";

import {
  getCodexStateSnapshot,
  saveCodexStateSnapshot,
} from "@/lib/codex-state";

export const runtime = "nodejs";
export const maxDuration = 180;

const CODEX_HOME = "/tmp/codex-home";
const RUNNER_DIR = "/tmp/moodle-codex-auth-runner";
const CODEX_CLI_VERSION = "0.125.0";
const CODEX_DEVICE_URL = "https://auth.openai.com/codex/device";

const zipAuthScript = `
import { zipSync } from "fflate";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = "${CODEX_HOME}";
const files = {};
let totalBytes = 0;
const maxFileBytes = 512 * 1024;
const maxTotalBytes = 2 * 1024 * 1024;
const ignoredSegments = new Set([
  ".cache",
  ".tmp",
  "archived_sessions",
  "cache",
  "logs",
  "node_modules",
  "sessions",
  "tmp",
]);
const persistedFilePattern = /^(?:\\.[^/]+-)?(?:auth|config|credentials|global-state|token|tokens|account|accounts)(\\.[^/]*)?$/i;

function shouldSkipPath(relativePath) {
  return relativePath.split("/").some((segment) => ignoredSegments.has(segment));
}

function shouldPersistFile(relativePath) {
  return !relativePath.includes("/") && persistedFilePattern.test(relativePath);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    const relativePath = relative(root, absolutePath);
    if (!relativePath || relativePath.startsWith("..") || relativePath.startsWith("/")) {
      continue;
    }
    if (shouldSkipPath(relativePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      await walk(absolutePath);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!shouldPersistFile(relativePath)) {
      continue;
    }
    const fileStat = await stat(absolutePath);
    if (fileStat.size > maxFileBytes) {
      continue;
    }
    totalBytes += fileStat.size;
    if (totalBytes > maxTotalBytes) {
      throw new Error("Codex auth state is too large to persist after filtering.");
    }
    files[relativePath] = new Uint8Array(await readFile(absolutePath));
  }
}

await walk(root);
if (Object.keys(files).length === 0) {
  throw new Error("Codex sign-in finished without small auth files to persist.");
}
const zipped = zipSync(files, { level: 6 });
await writeFile("${RUNNER_DIR}/codex-auth.zip.b64", Buffer.from(zipped).toString("base64"));
`;

type CodexAuthEvent =
  | {
      type: "device_code";
      verificationUri: string;
      userCode: string;
      expiresInSeconds: number;
    }
  | { type: "completed" }
  | { type: "error"; error: string };

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getCodexStateSnapshot(userId, "codex-auth");
  return Response.json({
    authenticated: Boolean(snapshot?.zipBase64),
    createdAt: snapshot?.snapshot?.createdAt ?? null,
  });
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stream = new TransformStream<Uint8Array>();
  const writer = stream.writable.getWriter();

  void runCodexDeviceAuth(userId, writer).finally(() => {
    void writer.close().catch(() => undefined);
  });

  return new Response(stream.readable, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
}

async function runCodexDeviceAuth(
  clerkUserId: string,
  writer: WritableStreamDefaultWriter<Uint8Array>,
) {
  const sandbox = await Sandbox.create({
    runtime: "node24",
    timeout: 170_000,
    resources: { vcpus: 1 },
    env: {
      HOME: CODEX_HOME,
      CODEX_HOME,
      npm_config_fund: "false",
      npm_config_audit: "false",
    },
  });

  try {
    await sandbox.writeFiles([
      {
        path: `${RUNNER_DIR}/package.json`,
        content: JSON.stringify({ type: "module", dependencies: {} }),
      },
      {
        path: `${RUNNER_DIR}/zip-auth.mjs`,
        content: zipAuthScript,
      },
    ]);

    await runSandboxCommand(sandbox, "mkdir", ["-p", CODEX_HOME, RUNNER_DIR], {
      cwd: RUNNER_DIR,
    });
    await runSandboxCommand(
      sandbox,
      "npm",
      [
        "install",
        "--no-audit",
        "--no-fund",
        "--silent",
        `@openai/codex@${CODEX_CLI_VERSION}`,
        "fflate@0.8.2",
      ],
      { cwd: RUNNER_DIR },
    );

    const command = await sandbox.runCommand({
      cmd: "./node_modules/.bin/codex",
      args: ["login", "--device-auth"],
      cwd: RUNNER_DIR,
      detached: true,
      env: { HOME: CODEX_HOME, CODEX_HOME },
    });

    let buffer = "";
    let emittedDeviceCode = false;
    for await (const log of command.logs()) {
      buffer += stripAnsi(log.data);
      if (emittedDeviceCode) {
        continue;
      }

      const userCode = findDeviceCode(buffer);
      if (buffer.includes(CODEX_DEVICE_URL) && userCode) {
        emittedDeviceCode = true;
        await writeEvent(writer, {
          type: "device_code",
          verificationUri: CODEX_DEVICE_URL,
          userCode,
          expiresInSeconds: 900,
        });
      }
    }

    const result = await command.wait();
    if (result.exitCode !== 0) {
      throw new Error(cleanAuthOutput(buffer) || "Codex sign-in did not finish.");
    }

    await runSandboxCommand(sandbox, "node", ["zip-auth.mjs"], {
      cwd: RUNNER_DIR,
      env: { HOME: CODEX_HOME, CODEX_HOME },
    });
    const zipBuffer = await sandbox.readFileToBuffer({
      path: `${RUNNER_DIR}/codex-auth.zip.b64`,
    });
    const zipBase64 = zipBuffer?.toString("utf8").trim();
    if (!zipBase64) {
      throw new Error("Codex sign-in finished without persisted auth state.");
    }

    await saveCodexStateSnapshot(clerkUserId, {
      kind: "codex-auth",
      zipBase64,
      metadata: { source: "vercel-sandbox-device-auth" },
    });
    await writeEvent(writer, { type: "completed" });
  } catch (error) {
    await writeEvent(writer, {
      type: "error",
      error:
        error instanceof Error
          ? error.message
          : "Codex ChatGPT sign-in failed.",
    });
  } finally {
    await sandbox.stop({ blocking: false }).catch(() => undefined);
  }
}

async function runSandboxCommand(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  cmd: string,
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> },
) {
  const result = await sandbox.runCommand({
    cmd,
    args,
    cwd: options?.cwd,
    env: options?.env,
  });

  if (result.exitCode === 0) {
    return;
  }

  const output = await result.output("both");
  throw new Error(output.trim() || `${cmd} failed inside the Codex auth sandbox.`);
}

async function writeEvent(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  event: CodexAuthEvent,
) {
  await writer.write(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
}

function findDeviceCode(value: string): string | null {
  return value.match(/\b[A-Z0-9]{4}-[A-Z0-9]{5}\b/)?.[0] ?? null;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function cleanAuthOutput(value: string): string {
  return value
    .replace(/Device codes are a common phishing target\..*/gis, "")
    .replace(/\s+/g, " ")
    .trim();
}
