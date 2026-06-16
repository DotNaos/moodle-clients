import type {
  CodexRunResult,
  CodexStreamEvent,
  MoodleUIAction,
} from "@/lib/codex-actions";

type CodexFallbackResponse = {
  threadId?: string | null;
  finalResponse?: string;
  actions?: MoodleUIAction[];
};

export type CodexRunStreamRequest = {
  prompt: string;
  images?: Array<{ name: string; dataURL: string }>;
  attachmentImages?: string[];
  messages?: Array<{ role: "user" | "assistant"; text: string }>;
  model?: string;
  reasoningEffort?: string;
  moodleContext?: unknown;
  stream?: true;
};

type CodexStreamOptions = {
  signal?: AbortSignal;
  websocketUrl?: string | null;
  fetcher?: typeof fetch;
  websocketFactory?: (url: string) => WebSocket;
};

export async function runCodexStream(
  request: CodexRunStreamRequest,
  onEvent: (event: CodexStreamEvent) => void,
  options: CodexStreamOptions = {},
): Promise<CodexRunResult> {
  const websocketUrl = options.websocketUrl ?? getConfiguredWebSocketUrl();
  if (websocketUrl) {
    let emittedOutput = false;
    try {
      return await runCodexStreamViaWebSocket(
        websocketUrl,
        request,
        (event) => {
          if (isMeaningfulOutputEvent(event)) {
            emittedOutput = true;
          }
          onEvent(event);
        },
        options,
      );
    } catch (error) {
      if (emittedOutput || isAbortError(error)) {
        throw error;
      }
    }
  }

  return runCodexStreamViaHttp(request, onEvent, options);
}

export async function runCodexStreamViaHttp(
  request: CodexRunStreamRequest,
  onEvent: (event: CodexStreamEvent) => void,
  options: CodexStreamOptions = {},
): Promise<CodexRunResult> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher("/api/codex/run", {
    method: "POST",
    headers: {
      accept: "application/x-ndjson",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...request, stream: true }),
    signal: options.signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Codex failed with ${response.status}.`);
  }

  return readCodexStream(response, onEvent);
}

export async function readCodexStream(
  response: Response,
  onEvent: (event: CodexStreamEvent) => void,
): Promise<CodexRunResult> {
  if (!response.body) {
    const payload = (await response.json().catch(() => ({}))) as CodexFallbackResponse;
    return {
      threadId: typeof payload.threadId === "string" ? payload.threadId : null,
      finalResponse: payload.finalResponse ?? "",
      actions: payload.actions ?? [],
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let threadId: string | null = null;
  let finalResponse = "";
  let actions: MoodleUIAction[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const parsed = parseCodexStreamBuffer(buffer, (event) => {
      onEvent(event);
      if (event.type === "thread") {
        threadId = event.threadId;
      } else if (event.type === "delta") {
        finalResponse += event.text;
      } else if (event.type === "message") {
        finalResponse = event.text;
      } else if (event.type === "done") {
        threadId = event.threadId;
        finalResponse = event.finalResponse;
        actions = event.actions;
      } else if (event.type === "error") {
        throw new Error(event.error);
      }
    });
    buffer = parsed.remainder;
  }

  if (buffer.trim()) {
    const event = parseCodexStreamEvent(buffer);
    if (event) {
      onEvent(event);
      if (event.type === "thread") {
        threadId = event.threadId;
      } else if (event.type === "delta") {
        finalResponse += event.text;
      } else if (event.type === "message") {
        finalResponse = event.text;
      } else if (event.type === "done") {
        threadId = event.threadId;
        finalResponse = event.finalResponse;
        actions = event.actions;
      } else if (event.type === "error") {
        throw new Error(event.error);
      }
    }
  }

  return { threadId, finalResponse, actions };
}

function runCodexStreamViaWebSocket(
  websocketUrl: string,
  request: CodexRunStreamRequest,
  onEvent: (event: CodexStreamEvent) => void,
  options: CodexStreamOptions,
): Promise<CodexRunResult> {
  const WebSocketConstructor =
    options.websocketFactory ??
    ((url: string) => {
      if (typeof WebSocket === "undefined") {
        throw new Error("WebSocket is not available in this browser.");
      }
      return new WebSocket(url);
    });

  return new Promise((resolve, reject) => {
    let socket: WebSocket;
    try {
      socket = WebSocketConstructor(websocketUrl);
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;

    const cleanup = () => {
      options.signal?.removeEventListener("abort", abort);
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleClose);
    };

    const finish = (result: CodexRunResult) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };

    function abort() {
      fail(new DOMException("Codex request was aborted.", "AbortError"));
    }

    function handleOpen() {
      socket.send(JSON.stringify({ ...request, stream: true }));
    }

    function handleMessage(message: MessageEvent) {
      const event = parseCodexStreamEvent(String(message.data));
      if (!event) {
        return;
      }
      onEvent(event);
      if (event.type === "done") {
        finish({
          threadId: event.threadId,
          finalResponse: event.finalResponse,
          actions: event.actions,
        });
      } else if (event.type === "error") {
        fail(new Error(event.error));
      }
    }

    function handleError() {
      fail(new Error("Codex WebSocket stream failed."));
    }

    function handleClose() {
      if (!settled) {
        fail(new Error("Codex WebSocket stream closed before completion."));
      }
    }

    options.signal?.addEventListener("abort", abort, { once: true });
    socket.addEventListener("open", handleOpen);
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("error", handleError);
    socket.addEventListener("close", handleClose);
  });
}

export function parseCodexStreamBuffer(
  buffer: string,
  onEvent: (event: CodexStreamEvent) => void,
): { remainder: string } {
  const normalized = looksLikeServerSentEvents(buffer)
    ? parseServerSentEvents(buffer, onEvent)
    : parseNdjsonEvents(buffer, onEvent);
  return { remainder: normalized };
}

export function parseCodexStreamEvent(line: string): CodexStreamEvent | null {
  if (!line.trim()) {
    return null;
  }

  try {
    return normalizeCodexStreamEvent(JSON.parse(line));
  } catch {
    return null;
  }
}

function parseNdjsonEvents(
  buffer: string,
  onEvent: (event: CodexStreamEvent) => void,
): string {
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";
  for (const line of lines) {
    const event = parseCodexStreamEvent(line);
    if (event) {
      onEvent(event);
    }
  }
  return remainder;
}

function parseServerSentEvents(
  buffer: string,
  onEvent: (event: CodexStreamEvent) => void,
): string {
  const frames = buffer.split("\n\n");
  const remainder = frames.pop() ?? "";

  for (const frame of frames) {
    let eventName = "message";
    let data = "";

    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        data += line.slice("data:".length).trim();
      }
    }

    if (!data) {
      continue;
    }

    const event = parseCodexStreamEvent(
      JSON.stringify({ type: eventName, data: JSON.parse(data) }),
    );
    if (event) {
      onEvent(event);
    }
  }

  return remainder;
}

function looksLikeServerSentEvents(buffer: string): boolean {
  return buffer.includes("\n\n") || /^event:/m.test(buffer) || /^data:/m.test(buffer);
}

function normalizeCodexStreamEvent(value: unknown): CodexStreamEvent | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const event = value as Record<string, unknown>;
  const data = event.data && typeof event.data === "object"
    ? (event.data as Record<string, unknown>)
    : null;
  if (event.type === "delta") {
    return {
      type: "delta",
      text: typeof event.text === "string" ? event.text : typeof event.data === "string" ? event.data : "",
    };
  }

  if (event.type === "thread") {
    return {
      type: "thread",
      threadId: typeof event.threadId === "string" ? event.threadId : null,
    };
  }

  if (event.type === "message") {
    return {
      type: "message",
      text: typeof event.text === "string" ? event.text : "",
    };
  }

  if (event.type === "tool") {
    const status = event.status;
    if (status !== "running" && status !== "completed" && status !== "failed") {
      return null;
    }
    return {
      type: "tool",
      id: typeof event.id === "string" ? event.id : undefined,
      title: typeof event.title === "string" ? event.title : "Running tool",
      status,
    };
  }

  if (event.type === "status") {
    return {
      type: "status",
      title: typeof event.title === "string" ? event.title : "Codex is working.",
    };
  }

  if (event.type === "done") {
    return {
      type: "done",
      threadId: typeof event.threadId === "string" ? event.threadId : typeof data?.threadId === "string" ? data.threadId : null,
      finalResponse:
        typeof event.finalResponse === "string"
          ? event.finalResponse
          : typeof data?.finalResponse === "string"
            ? data.finalResponse
            : "",
      actions: Array.isArray(event.actions)
        ? (event.actions as MoodleUIAction[])
        : Array.isArray(data?.actions)
          ? (data.actions as MoodleUIAction[])
          : [],
    };
  }

  if (event.type === "error") {
    return {
      type: "error",
      error: typeof event.error === "string" ? event.error : "Codex failed.",
    };
  }

  return null;
}

function getConfiguredWebSocketUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_CODEX_RUN_WS_URL?.trim();
  return configured || null;
}

function isMeaningfulOutputEvent(event: CodexStreamEvent): boolean {
  return (
    (event.type === "message" && event.text.length > 0) ||
    (event.type === "delta" && event.text.length > 0) ||
    event.type === "tool" ||
    event.type === "done"
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
