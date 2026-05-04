import { Sandbox } from "@vercel/sandbox";

type CodexSandboxInput = {
  prompt: string;
  threadId: string | null;
};

type CodexSandboxOutput = {
  threadId: string | null;
  finalResponse: string;
};

type CodexSandboxError = {
  error?: string;
};

const CODEX_HOME = "/tmp/codex-home";
const WORKSPACE = "/tmp/moodle-codex-workspace";
const RUNNER_DIR = "/tmp/moodle-codex-runner";
const CODEX_SDK_VERSION = "0.125.0";

const runnerScript = `
import { Codex } from "@openai/codex-sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const payload = JSON.parse(await readFile("${RUNNER_DIR}/payload.json", "utf8"));
await mkdir("${WORKSPACE}", { recursive: true });

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

const thread = payload.threadId
  ? codex.resumeThread(payload.threadId, threadOptions)
  : codex.startThread(threadOptions);

const result = await thread.run(payload.prompt);

await writeFile(
  "${RUNNER_DIR}/result.json",
  JSON.stringify({ threadId: thread.id, finalResponse: result.finalResponse }),
);
`;

export async function runCodexInVercelSandbox(
  input: CodexSandboxInput,
): Promise<CodexSandboxOutput> {
  const sandbox = await Sandbox.create({
    runtime: "node24",
    timeout: 120_000,
    resources: { vcpus: 1 },
    env: {
      HOME: CODEX_HOME,
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
      ["install", "--no-audit", "--no-fund", "--silent", `@openai/codex-sdk@${CODEX_SDK_VERSION}`],
      { cwd: RUNNER_DIR },
    );
    await runSandboxCommand(sandbox, "node", ["run-codex.mjs"], {
      cwd: RUNNER_DIR,
      env: { HOME: CODEX_HOME },
    });

    const resultBuffer = await sandbox.readFileToBuffer({ path: `${RUNNER_DIR}/result.json` });
    if (!resultBuffer) {
      throw new Error("Codex sandbox finished without writing a result.");
    }

    const output = JSON.parse(resultBuffer.toString("utf8")) as CodexSandboxOutput;
    if (!output.finalResponse) {
      throw new Error("Codex sandbox returned an empty response.");
    }

    return output;
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
