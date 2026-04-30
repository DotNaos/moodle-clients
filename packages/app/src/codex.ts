import { Platform } from "react-native";

const DEFAULT_LOCAL_CODEX_BASE_URL = "http://127.0.0.1:17333";
const CODEX_WEB_RUN_PATH = "/api/codex-run";

declare const process:
  | { env?: { EXPO_PUBLIC_CODEX_RUN_URL?: string } }
  | undefined;

export type CodexRunRequest = {
  readonly prompt: string;
  readonly threadId?: string | null;
  readonly moodleContext?: MoodleCodexContext | null;
};

export type MoodleCodexContext = {
  readonly source: "moodle-mobile-api";
  readonly siteUrl: string;
  readonly userId: number;
  readonly courses: Array<{
    readonly id: number;
    readonly fullName: string;
    readonly shortName: string;
    readonly categoryName: string;
  }>;
  readonly courseContents?: Array<{
    readonly courseId: number;
    readonly courseName: string;
    readonly sections: Array<{
      readonly name: string;
      readonly modules: Array<{
        readonly name: string;
        readonly type: string;
        readonly files: Array<{
          readonly filename: string;
          readonly mimeType: string;
          readonly fileSize?: number;
        }>;
      }>;
    }>;
  }>;
};

export type CodexRunResponse = {
  readonly threadId: string | null;
  readonly finalResponse: string;
};

export type CodexStreamEvent =
  | {
      readonly type: "thread";
      readonly threadId: string | null;
    }
  | {
      readonly type: "message";
      readonly text: string;
    }
  | {
      readonly type: "tool";
      readonly title: string;
      readonly status: "running" | "completed" | "failed";
    }
  | {
      readonly type: "done";
      readonly threadId: string | null;
      readonly finalResponse: string;
    }
  | {
      readonly type: "error";
      readonly error: string;
    };

export async function runCodexTask(
  request: CodexRunRequest,
  localBaseUrl?: string,
): Promise<CodexRunResponse> {
  const endpoint =
    Platform.OS === "web"
      ? getWebCodexRunUrl()
      : `${normalizeBaseUrl(localBaseUrl)}/api/codex-run`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload) ??
        `Codex request failed with status ${response.status}.`,
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.finalResponse !== "string"
  ) {
    throw new Error("Codex returned an unexpected response.");
  }

  return {
    threadId:
      typeof payload.threadId === "string" && payload.threadId.length > 0
        ? payload.threadId
        : null,
    finalResponse: payload.finalResponse,
  };
}

export function getDefaultLocalCodexBaseUrl(): string {
  return DEFAULT_LOCAL_CODEX_BASE_URL;
}

export async function streamCodexTask(
  request: CodexRunRequest,
  localBaseUrl: string | undefined,
  onEvent: (event: CodexStreamEvent) => void,
): Promise<CodexRunResponse> {
  const endpoint =
    Platform.OS === "web"
      ? getWebCodexRunUrl()
      : `${normalizeBaseUrl(localBaseUrl)}/api/codex-run`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/x-ndjson",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...request, stream: true }),
  });

  if (!response.ok) {
    const payload = await readJsonResponse(response);
    throw new Error(
      getErrorMessage(payload) ??
        `Codex request failed with status ${response.status}.`,
    );
  }

  if (!response.body) {
    const fallback = await response.json();
    if (
      fallback &&
      typeof fallback === "object" &&
      typeof fallback.finalResponse === "string"
    ) {
      return {
        threadId:
          typeof fallback.threadId === "string" ? fallback.threadId : null,
        finalResponse: fallback.finalResponse,
      };
    }
    throw new Error("Codex streaming is not available in this runtime.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse = "";
  let threadId: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseStreamEvent(line);
      if (!event) {
        continue;
      }

      onEvent(event);

      if (event.type === "thread") {
        threadId = event.threadId;
      } else if (event.type === "message") {
        finalResponse = event.text;
      } else if (event.type === "done") {
        threadId = event.threadId;
        finalResponse = event.finalResponse;
      } else if (event.type === "error") {
        throw new Error(event.error);
      }
    }
  }

  if (buffer.trim()) {
    const event = parseStreamEvent(buffer);
    if (event) {
      onEvent(event);
      if (event.type === "done") {
        threadId = event.threadId;
        finalResponse = event.finalResponse;
      }
    }
  }

  return { threadId, finalResponse };
}

function normalizeBaseUrl(value: string | undefined): string {
  const candidate = value?.trim() || DEFAULT_LOCAL_CODEX_BASE_URL;
  return candidate.endsWith("/") ? candidate.slice(0, -1) : candidate;
}

function getWebCodexRunUrl(): string {
  const configured = process?.env?.EXPO_PUBLIC_CODEX_RUN_URL?.trim();
  return configured || CODEX_WEB_RUN_PATH;
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getErrorMessage(payload: Record<string, unknown> | null): string | null {
  if (!payload) {
    return null;
  }

  return typeof payload.error === "string" ? payload.error : null;
}

function parseStreamEvent(line: string): CodexStreamEvent | null {
  if (!line.trim()) {
    return null;
  }

  const parsed = JSON.parse(line) as CodexStreamEvent;
  return parsed;
}
