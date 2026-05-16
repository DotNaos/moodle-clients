import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

type HeaderValue = string | string[] | undefined;

type CodexAuthRequest = {
  method?: string;
  headers: Record<string, HeaderValue>;
};

type CodexAuthResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  writeHead?(statusCode: number, headers: Record<string, string>): void;
  write?(body: string): void;
  end(body: string): void;
};

type AuthEvent =
  | {
      type: "device_code";
      verificationUri: string;
      userCode: string;
      expiresInSeconds?: number;
    }
  | { type: "completed" }
  | { type: "error"; error: string };

const CODEX_DEVICE_URL = "https://auth.openai.com/codex/device";
const CODEX_HOME = join(tmpdir(), "moodle-clients-codex-home");

export default async function handler(
  request: CodexAuthRequest,
  response: CodexAuthResponse,
): Promise<void> {
  if (request.method === "GET") {
    await writeStatus(response);
    return;
  }

  if (request.method === "POST") {
    await startDeviceAuth(response);
    return;
  }

  response.setHeader("content-type", "application/json; charset=utf-8");
  writeJson(response, 405, { error: "Use GET or POST for Codex auth." });
}

async function writeStatus(response: CodexAuthResponse): Promise<void> {
  try {
    const status = await runCodexLoginStatus();
    response.setHeader("content-type", "application/json; charset=utf-8");
    writeJson(response, 200, {
      authenticated: status.exitCode === 0,
      detail: cleanStatus(status.output),
    });
  } catch (error) {
    response.setHeader("content-type", "application/json; charset=utf-8");
    writeJson(response, 500, {
      authenticated: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to check Codex authentication.",
    });
  }
}

async function startDeviceAuth(response: CodexAuthResponse): Promise<void> {
  mkdirSync(CODEX_HOME, { recursive: true });
  writeStreamHeaders(response);

  const child = spawn(getCodexBinary(), ["login", "--device-auth"], {
    cwd: process.cwd(),
    env: getCodexEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let buffer = "";
  let emittedDeviceCode = false;

  const handleChunk = (chunk: Uint8Array | string) => {
    buffer += stripAnsi(String(chunk));
    if (!emittedDeviceCode) {
      const userCode = findDeviceCode(buffer);
      if (buffer.includes(CODEX_DEVICE_URL) && userCode) {
        emittedDeviceCode = true;
        writeEvent(response, {
          type: "device_code",
          verificationUri: CODEX_DEVICE_URL,
          userCode,
          expiresInSeconds: 900,
        });
      }
    }
  };

  child.stdout.on("data", handleChunk);
  child.stderr.on("data", handleChunk);

  await new Promise<void>((resolve) => {
    child.on("error", (error) => {
      writeEvent(response, {
        type: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to start Codex device authorization.",
      });
      resolve();
    });

    child.on("close", (code) => {
      if (code === 0) {
        writeEvent(response, { type: "completed" });
      } else {
        writeEvent(response, {
          type: "error",
          error:
            cleanStatus(buffer) ||
            "Codex device authorization did not complete.",
        });
      }
      resolve();
    });
  });

  response.end("");
}

function runCodexLoginStatus(): Promise<{ exitCode: number; output: string }> {
  mkdirSync(CODEX_HOME, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(getCodexBinary(), ["login", "status"], {
      cwd: process.cwd(),
      env: getCodexEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += stripAnsi(String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      output += stripAnsi(String(chunk));
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, output });
    });
  });
}

function getCodexBinary(): string {
  return join(process.cwd(), "node_modules", ".bin", "codex");
}

function getCodexEnvironment(): NodeJS.ProcessEnv {
  const nextEnvironment: NodeJS.ProcessEnv = {};
  Object.entries(process.env).forEach(([key, value]) => {
    if (!value || key === "OPENAI_API_KEY" || key === "CODEX_API_KEY") {
      return;
    }
    nextEnvironment[key] = value;
  });
  nextEnvironment.CODEX_HOME = CODEX_HOME;
  return nextEnvironment;
}

function findDeviceCode(value: string): string | null {
  return value.match(/\b[A-Z0-9]{4}-[A-Z0-9]{5}\b/)?.[0] ?? null;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function cleanStatus(value: string): string {
  return value
    .replace(/Device codes are a common phishing target\..*/gis, "")
    .replace(/\s+/g, " ")
    .trim();
}

function writeStreamHeaders(response: CodexAuthResponse): void {
  const headers = {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-cache, no-transform",
  };

  if (response.writeHead) {
    response.writeHead(200, headers);
    return;
  }

  Object.entries(headers).forEach(([key, value]) => {
    response.setHeader(key, value);
  });
  response.statusCode = 200;
}

function writeEvent(response: CodexAuthResponse, event: AuthEvent): void {
  response.write?.(`${JSON.stringify(event)}\n`);
}

function writeJson(
  response: CodexAuthResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  response.statusCode = statusCode;
  response.end(JSON.stringify(body));
}
