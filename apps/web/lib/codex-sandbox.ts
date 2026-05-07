import { Sandbox } from "@vercel/sandbox";

import type {
  CodexRunResult,
  CodexStreamEvent,
} from "@/lib/codex-actions";

type CodexSandboxInput = {
  prompt: string;
  authZipBase64?: string | null;
  outputSchema?: unknown;
};

const CODEX_HOME = "/tmp/codex-home";
const WORKSPACE = "/tmp/moodle-codex-workspace";
const RUNNER_DIR = "/tmp/moodle-codex-runner";
const CODEX_SDK_VERSION = "0.125.0";

const runnerScript = `
import { Codex } from "@openai/codex-sdk";
import { unzipSync } from "fflate";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const payload = JSON.parse(await readFile("${RUNNER_DIR}/payload.json", "utf8"));
await mkdir("${WORKSPACE}", { recursive: true });
await mkdir("${CODEX_HOME}", { recursive: true });

function emit(event) {
  process.stdout.write(JSON.stringify(event) + "\\n");
}

if (payload.authZipBase64) {
  const entries = unzipSync(Buffer.from(payload.authZipBase64, "base64"));
  await Promise.all(
    Object.entries(entries).map(async ([name, data]) => {
      const target = join("${CODEX_HOME}", name);
      const relativeTarget = relative("${CODEX_HOME}", target);
      if (relativeTarget.startsWith("..") || relativeTarget.startsWith("/")) {
        throw new Error("Unsafe Codex auth archive path.");
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data);
    }),
  );
}

const codex = new Codex({
  env: Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) => {
      return value && key !== "OPENAI_API_KEY" && key !== "CODEX_API_KEY";
    }),
  ),
});

const threadOptions = {
  workingDirectory: "${WORKSPACE}",
  skipGitRepoCheck: true,
  sandboxMode: "read-only",
  approvalPolicy: "never",
  networkAccessEnabled: false,
  webSearchMode: "disabled",
};

const thread = codex.startThread(threadOptions);
const streamed = await thread.runStreamed(payload.prompt, {
  outputSchema: payload.outputSchema,
});

let finalAgentMessage = "";

for await (const event of streamed.events) {
  if (event.type === "thread.started") {
    emit({ type: "thread", threadId: event.thread_id });
  } else if (event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed") {
    const item = event.item;
    if (item.type === "agent_message") {
      finalAgentMessage = item.text || finalAgentMessage;
      emit({ type: "message", text: finalAgentMessage });
    } else if (item.type === "command_execution") {
      emit({
        type: "tool",
        title: item.command || "Codex command",
        status: item.status === "failed" ? "failed" : item.status === "completed" ? "completed" : "running",
      });
    } else if (item.type === "mcp_tool_call") {
      emit({
        type: "tool",
        title: item.tool || "Moodle action",
        status: item.status === "failed" ? "failed" : item.status === "completed" ? "completed" : "running",
      });
    }
  } else if (event.type === "turn.failed") {
    throw new Error(event.error.message || "Codex failed before returning a result.");
  } else if (event.type === "error") {
    throw new Error(event.message || "Codex failed before returning a result.");
  }
}

const parsed = normalizeCodexResponse(finalAgentMessage);
const result = { threadId: null, ...parsed };
emit({ type: "done", ...result });

await writeFile(
  "${RUNNER_DIR}/result.json",
  JSON.stringify(result),
);

function normalizeCodexResponse(value) {
  try {
    const parsed = JSON.parse(value);
    return {
      finalResponse: typeof parsed.answer === "string" ? parsed.answer : value,
      actions: Array.isArray(parsed.actions) ? sanitizeActions(parsed.actions) : [],
    };
  } catch {
    return { finalResponse: value, actions: [] };
  }
}

function sanitizeActions(actions) {
  return actions.flatMap((action) => {
    if (!action || typeof action !== "object") {
      return [];
    }
    if (action.type === "open_course" && typeof action.courseId === "string") {
      return [{ type: "open_course", courseId: action.courseId, reason: stringOrUndefined(action.reason) }];
    }
    if (action.type === "open_material" && typeof action.materialId === "string") {
      return [{
        type: "open_material",
        materialId: action.materialId,
        courseId: typeof action.courseId === "string" ? action.courseId : null,
        reason: stringOrUndefined(action.reason),
      }];
    }
    if (action.type === "open_moodle_course_page" && typeof action.courseId === "string") {
      return [{ type: "open_moodle_course_page", courseId: action.courseId, reason: stringOrUndefined(action.reason) }];
    }
    return [];
  }).slice(0, 3);
}

function stringOrUndefined(value) {
  return typeof value === "string" ? value : undefined;
}
`;

export async function runCodexInVercelSandbox(
  input: CodexSandboxInput,
  onEvent?: (event: CodexStreamEvent) => Promise<void> | void,
): Promise<CodexRunResult> {
  const sandbox = await Sandbox.create({
    runtime: "node24",
    timeout: 120_000,
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
        path: `${RUNNER_DIR}/payload.json`,
        content: JSON.stringify(input),
      },
      {
        path: `${RUNNER_DIR}/run-codex.mjs`,
        content: runnerScript,
      },
    ]);

    await runSandboxCommand(sandbox, "mkdir", ["-p", CODEX_HOME, WORKSPACE], {
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
        `@openai/codex-sdk@${CODEX_SDK_VERSION}`,
        "fflate@0.8.2",
      ],
      { cwd: RUNNER_DIR },
    );
    const command = await sandbox.runCommand({
      cmd: "node",
      args: ["run-codex.mjs"],
      cwd: RUNNER_DIR,
      env: { HOME: CODEX_HOME, CODEX_HOME },
      detached: Boolean(onEvent),
    });

    await streamCommandEvents(command, onEvent);
    const commandResult = "wait" in command ? await command.wait() : command;
    if (commandResult.exitCode !== 0) {
      const [stdout, stderr] = await Promise.all([commandResult.stdout(), commandResult.stderr()]);
      throw new Error(compactCommandError("node", stdout, stderr));
    }

    const resultBuffer = await sandbox.readFileToBuffer({ path: `${RUNNER_DIR}/result.json` });
    if (!resultBuffer) {
      throw new Error("Codex sandbox finished without writing a result.");
    }

    const output = JSON.parse(resultBuffer.toString("utf8")) as CodexRunResult;
    if (!output.finalResponse) {
      throw new Error("Codex sandbox returned an empty response.");
    }

    return output;
  } finally {
    await sandbox.stop({ blocking: false }).catch(() => undefined);
  }
}

async function streamCommandEvents(
  command: Awaited<ReturnType<Awaited<ReturnType<typeof Sandbox.create>>["runCommand"]>>,
  onEvent?: (event: CodexStreamEvent) => Promise<void> | void,
) {
  if (!onEvent || !("logs" in command)) {
    return;
  }

  let buffer = "";
  for await (const log of command.logs()) {
    buffer += log.data;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      await emitParsedEvent(line, onEvent);
    }
  }
  if (buffer.trim()) {
    await emitParsedEvent(buffer, onEvent);
  }
}

async function emitParsedEvent(
  line: string,
  onEvent: (event: CodexStreamEvent) => Promise<void> | void,
) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) {
    return;
  }

  try {
    await onEvent(JSON.parse(trimmed) as CodexStreamEvent);
  } catch {
    return;
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

  const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()]);
  throw new Error(compactCommandError(cmd, stdout, stderr));
}

function compactCommandError(cmd: string, stdout: string, stderr: string): string {
  const output = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n").trim();
  if (!output) {
    return `${cmd} failed inside the Codex sandbox.`;
  }

  if (/auth|login|credential|unauthori[sz]ed/i.test(output)) {
    return "Codex is not authenticated in the sandbox yet. Connect Codex/ChatGPT auth before asking questions.";
  }

  return output.slice(0, 2000);
}
