import { auth } from "@clerk/nextjs/server";

import {
  codexOutputSchema,
  type CodexChatMessage,
  type CodexStreamEvent,
} from "@/lib/codex-actions";
import { withMoodlePrompt } from "@/lib/codex-prompt";
import { runCodexInVercelSandbox } from "@/lib/codex-sandbox";
import { getCodexStateSnapshot } from "@/lib/codex-state";

export const runtime = "nodejs";
export const maxDuration = 180;

type CodexRunBody = {
  prompt?: unknown;
  images?: unknown;
  messages?: unknown;
  moodleContext?: unknown;
  stream?: unknown;
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
  const images = parseImages(body.images);
  const messages = parseMessages(body.messages);
  const composedPrompt = withMoodlePrompt(prompt, body.moodleContext, messages);

  if (!prompt) {
    return Response.json({ error: "Prompt is required." }, { status: 400 });
  }

  try {
    const authSnapshot = await getCodexStateSnapshot(userId, "codex-auth");
    if (!authSnapshot?.zipBase64) {
      return Response.json(
        { error: "Connect ChatGPT before asking Codex questions." },
        { status: 409 },
      );
    }

    const input = {
      prompt: composedPrompt,
      authZipBase64: authSnapshot.zipBase64,
      images,
      outputSchema: codexOutputSchema,
    };

    if (request.headers.get("accept")?.includes("application/x-ndjson") || body.stream === true) {
      return streamCodexRun(input);
    }

    const result = await runCodexInVercelSandbox(input);

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: codexErrorMessage(error) }, { status: 500 });
  }
}

function streamCodexRun(input: Parameters<typeof runCodexInVercelSandbox>[0]) {
  const stream = new TransformStream<Uint8Array>();
  const writer = stream.writable.getWriter();

  void runCodexInVercelSandbox(input, (event) => writeEvent(writer, event))
    .catch((error) =>
      writeEvent(writer, {
        type: "error",
        error: codexErrorMessage(error),
      }),
    )
    .finally(() => {
      void writer.close().catch(() => undefined);
    });

  return new Response(stream.readable, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
}

async function writeEvent(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  event: CodexStreamEvent,
) {
  await writer.write(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
}

function parseImages(value: unknown): Array<{ name: string; dataURL: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((image): Array<{ name: string; dataURL: string }> => {
    if (!image || typeof image !== "object") {
      return [];
    }
    const name = "name" in image ? image.name : null;
    const dataURL = "dataURL" in image ? image.dataURL : null;
    if (typeof name !== "string" || typeof dataURL !== "string") {
      return [];
    }
    if (!dataURL.startsWith("data:image/") || dataURL.length > 1_200_000) {
      return [];
    }
    return [{ name: name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80) || "pdf-page.jpg", dataURL }];
  }).slice(0, 40);
}

function parseMessages(value: unknown): CodexChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((message): CodexChatMessage[] => {
    if (!message || typeof message !== "object") {
      return [];
    }
    const role = "role" in message ? message.role : null;
    const text = "text" in message ? message.text : null;
    if ((role !== "user" && role !== "assistant") || typeof text !== "string") {
      return [];
    }
    const trimmed = text.trim();
    return trimmed ? [{ role, text: trimmed.slice(0, 8000) }] : [];
  }).slice(-12);
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
