import { auth } from "@clerk/nextjs/server";

import { withMoodlePrompt } from "@/lib/codex-prompt";
import { runCodexInVercelSandbox } from "@/lib/codex-sandbox";

export const runtime = "nodejs";
export const maxDuration = 180;

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
    const result = await runCodexInVercelSandbox({
      prompt: withMoodlePrompt(prompt, body.moodleContext),
      threadId,
    });

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: codexErrorMessage(error) }, { status: 500 });
  }
}

function codexErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Codex failed before returning a result.";
  }

  const message = error.message.trim();
  if (!message) {
    return "Codex failed before returning a result.";
  }

  return message;
}
