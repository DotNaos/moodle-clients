import { Platform } from "react-native";

const CODEX_WEB_RUN_PATH = "/api/codex-run";
const CODEX_WEB_AUTH_PATH = "/api/codex-auth";

/*
 * Project invariants for Codex in this app:
 * 1. Codex auth must use ChatGPT OAuth. Do not add an OpenAI API key or Codex
 *    API key path for iOS; the user must not have to pay API usage for this.
 * 2. iOS Codex must run inside the iOS app sandbox. Do not connect the iOS app
 *    to a cloud runtime, a macOS Node.js runtime, or a local development proxy
 *    for Codex. The viable implementation path is an embedded native Codex
 *    runtime, not a remote HTTP endpoint and not a mock.
 */

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

export type CodexAuthStatus = {
  readonly authenticated: boolean;
  readonly detail?: string;
};

export type CodexAuthEvent =
  | {
      readonly type: "device_code";
      readonly verificationUri: string;
      readonly userCode: string;
      readonly expiresInSeconds?: number;
    }
  | {
      readonly type: "completed";
    }
  | {
      readonly type: "error";
      readonly error: string;
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
): Promise<CodexRunResponse> {
  const endpoint = getCodexRunUrl();

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

export async function streamCodexTask(
  request: CodexRunRequest,
  onEvent: (event: CodexStreamEvent) => void,
): Promise<CodexRunResponse> {
  const endpoint = getCodexRunUrl();

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

export async function getCodexAuthStatus(): Promise<CodexAuthStatus> {
  const response = await fetch(getCodexAuthUrl(), {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    return {
      authenticated: false,
      detail:
        getErrorMessage(payload) ??
        `Codex auth check failed with status ${response.status}.`,
    };
  }

  return {
    authenticated: payload?.authenticated === true,
    detail:
      typeof payload?.detail === "string" && payload.detail.length > 0
        ? payload.detail
        : undefined,
  };
}

export async function startCodexAuth(
  onEvent: (event: CodexAuthEvent) => void,
): Promise<CodexAuthStatus> {
  const response = await fetch(getCodexAuthUrl(), {
    method: "POST",
    headers: {
      accept: "application/x-ndjson",
    },
  });

  if (!response.ok) {
    const payload = await readJsonResponse(response);
    const detail =
      getErrorMessage(payload) ??
      `Codex auth start failed with status ${response.status}.`;
    onEvent({ type: "error", error: detail });
    return { authenticated: false, detail };
  }

  if (!response.body) {
    const detail = "Codex auth streaming is not available in this runtime.";
    onEvent({ type: "error", error: detail });
    return { authenticated: false, detail };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let authenticated = false;
  let detail: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseAuthEvent(line);
      if (!event) {
        continue;
      }
      onEvent(event);
      if (event.type === "completed") {
        authenticated = true;
      } else if (event.type === "error") {
        detail = event.error;
      }
    }
  }

  if (buffer.trim()) {
    const event = parseAuthEvent(buffer);
    if (event) {
      onEvent(event);
      if (event.type === "completed") {
        authenticated = true;
      } else if (event.type === "error") {
        detail = event.error;
      }
    }
  }

  return { authenticated, detail };
}

function getCodexRunUrl(): string {
  if (Platform.OS === "web") {
    const configured = process?.env?.EXPO_PUBLIC_CODEX_RUN_URL?.trim();
    if (configured) {
      return configured;
    }
    return CODEX_WEB_RUN_PATH;
  }

  throw new Error(
    "Native iOS Codex runtime is not wired yet. This app will not use a mock, an OpenAI API key, a cloud runtime, or the macOS Node.js dev host for Codex.",
  );
}

function getCodexAuthUrl(): string {
  if (Platform.OS !== "web") {
    throw new Error(
      "Native iOS Codex auth is not wired yet. The web device-code flow is only for the browser runtime.",
    );
  }

  const configured = process?.env?.EXPO_PUBLIC_CODEX_RUN_URL?.trim();
  if (!configured) {
    return CODEX_WEB_AUTH_PATH;
  }

  try {
    const url = new URL(configured);
    url.pathname = CODEX_WEB_AUTH_PATH;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return CODEX_WEB_AUTH_PATH;
  }
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

function parseAuthEvent(line: string): CodexAuthEvent | null {
  if (!line.trim()) {
    return null;
  }

  const parsed = JSON.parse(line) as CodexAuthEvent;
  return parsed;
}
