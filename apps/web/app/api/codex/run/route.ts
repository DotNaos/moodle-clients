import { auth } from "@clerk/nextjs/server";
import { Codex } from "@openai/codex-sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

type CodexRunBody = {
  prompt?: unknown;
  threadId?: unknown;
  moodleContext?: unknown;
};

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CodexRunBody;
  try {
    body = (await request.json()) as CodexRunBody;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const threadId =
    typeof body.threadId === "string" && body.threadId.trim().length > 0
      ? body.threadId.trim()
      : null;

  if (!prompt) {
    return Response.json({ error: "Prompt is required." }, { status: 400 });
  }

  try {
    const thread = createCodexThread(threadId);
    const result = await thread.run(withMoodlePrompt(prompt, body.moodleContext));

    return Response.json({
      threadId: thread.id,
      finalResponse: result.finalResponse,
    });
  } catch (error) {
    return Response.json({ error: codexErrorMessage(error) }, { status: 500 });
  }
}

function createCodexThread(threadId: string | null) {
  const codex = new Codex({
    env: getChatGptOnlyEnvironment(),
  });
  const threadOptions = {
    workingDirectory: process.cwd(),
    skipGitRepoCheck: true,
    sandboxMode: "read-only" as const,
    approvalPolicy: "never" as const,
    networkAccessEnabled: false,
    webSearchMode: "disabled" as const,
  };

  return threadId
    ? codex.resumeThread(threadId, threadOptions)
    : codex.startThread(threadOptions);
}

function withMoodlePrompt(prompt: string, moodleContext: unknown): string {
  return `You are Codex inside the signed-in Moodle web dashboard.

Authentication invariant:
- This integration must use the host's ChatGPT/Codex subscription authentication.
- Never ask for, mention, or rely on OpenAI API keys, Codex API keys, or Moodle API keys.

Moodle rules:
- Answer only from the Moodle context below.
- Do not run shell commands, inspect repository files, browse the web, or use external data.
- If the context is insufficient, say which course or material should be opened in the Moodle UI.
- Never reveal raw Moodle URLs, tokens, sessions, cookies, or secret identifiers.
- Cite course and material names when they support the answer.

Moodle context:
${formatMoodleContext(moodleContext)}

User question:
${prompt}`;
}

function formatMoodleContext(context: unknown): string {
  if (!context || typeof context !== "object") {
    return "No Moodle context is currently loaded.";
  }

  return JSON.stringify(context, null, 2).slice(0, 60000);
}

function getChatGptOnlyEnvironment(): Record<string, string> {
  const nextEnvironment: Record<string, string> = {};

  Object.entries(process.env).forEach(([key, value]) => {
    if (!value || key === "OPENAI_API_KEY" || key === "CODEX_API_KEY") {
      return;
    }

    nextEnvironment[key] = value;
  });

  return nextEnvironment;
}

function codexErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Codex failed before returning a result.";
  }

  const message = error.message.trim();
  if (!message) {
    return "Codex failed before returning a result.";
  }

  if (/auth|login|credential|unauthori[sz]ed/i.test(message)) {
    return "Codex is not authenticated on this host yet. Sign in to Codex/ChatGPT on the deployment host, then try again.";
  }

  return message;
}
