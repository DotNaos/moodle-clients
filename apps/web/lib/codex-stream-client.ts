import type {
  CodexRunResult,
  CodexStreamEvent,
  MoodleUIAction,
} from "@/lib/codex-actions";

type CodexFallbackResponse = {
  finalResponse?: string;
  actions?: MoodleUIAction[];
};

export async function readCodexStream(
  response: Response,
  onEvent: (event: CodexStreamEvent) => void,
): Promise<CodexRunResult> {
  if (!response.body) {
    const payload = (await response.json().catch(() => ({}))) as CodexFallbackResponse;
    return {
      threadId: null,
      finalResponse: payload.finalResponse ?? "",
      actions: payload.actions ?? [],
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse = "";
  let actions: MoodleUIAction[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseCodexStreamEvent(line);
      if (!event) {
        continue;
      }
      onEvent(event);
      if (event.type === "done") {
        finalResponse = event.finalResponse;
        actions = event.actions;
      } else if (event.type === "error") {
        throw new Error(event.error);
      }
    }
  }

  if (buffer.trim()) {
    const event = parseCodexStreamEvent(buffer);
    if (event) {
      onEvent(event);
      if (event.type === "done") {
        finalResponse = event.finalResponse;
        actions = event.actions;
      } else if (event.type === "error") {
        throw new Error(event.error);
      }
    }
  }

  return { threadId: null, finalResponse, actions };
}

function parseCodexStreamEvent(line: string): CodexStreamEvent | null {
  if (!line.trim()) {
    return null;
  }

  try {
    return JSON.parse(line) as CodexStreamEvent;
  } catch {
    return null;
  }
}
