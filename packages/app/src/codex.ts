import Constants from "expo-constants";
import { Platform } from "react-native";

import type { MoodleConnection } from "./moodle";
import { loadCodexDeviceToken, storeCodexDeviceToken } from "./storage";

const CODEX_WEB_RUN_PATH = "/api/codex-run";
const CODEX_WEB_AUTH_PATH = "/api/codex-auth";
const CODEX_MOODLE_BASE_URL = "https://codex.os-home.net/api/apps/moodle";

/*
 * Project invariants for Codex in this app:
 * 1. Codex auth must use ChatGPT OAuth. Do not add an OpenAI API key or Codex
 *    API key path for iOS; the user must not have to pay API usage for this.
 * 2. The native app talks to the scoped VPS agent codex.moodle. The phone owns
 *    the live UI context, while the VPS stores only the encrypted Moodle Mobile
 *    session needed by that scoped agent.
 */

declare const process:
  | {
      env?: {
        EXPO_PUBLIC_CODEX_RUN_URL?: string;
        EXPO_PUBLIC_CODEX_BASE_URL?: string;
      };
    }
  | undefined;

export type CodexRunRequest = {
  readonly prompt: string;
  readonly threadId?: string | null;
  readonly moodleContext?: MoodleCodexContext | null;
  readonly messages?: Array<{ role: "user" | "assistant"; text: string }>;
};

export type MoodleCodexContext = {
  readonly source: "moodle-mobile-api";
  readonly siteUrl: string;
  readonly userId: number;
  readonly activeView?: string;
  readonly selectedCourseId?: number | null;
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
        readonly id?: number;
        readonly name: string;
        readonly type: string;
        readonly files: Array<{
          readonly filename: string;
          readonly mimeType: string;
          readonly fileSize?: number;
          readonly resourceId?: string;
        }>;
      }>;
    }>;
  }>;
};

export type MoodleCodexAction =
  | {
      readonly type: "navigate_tab";
      readonly view: "courses" | "connect" | "codex" | "profile";
      readonly reason?: string;
    }
  | {
      readonly type: "show_profile";
      readonly reason?: string;
    }
  | {
      readonly type: "open_course";
      readonly courseId: string;
      readonly reason?: string;
    }
  | {
      readonly type: "load_course_contents";
      readonly courseId: string;
      readonly reason?: string;
    }
  | {
      readonly type: "open_pdf";
      readonly courseId: string;
      readonly resourceId?: string | null;
      readonly filename?: string | null;
      readonly reason?: string;
    }
  | {
      readonly type: "scroll_pdf_to_page";
      readonly page: number;
      readonly reason?: string;
    };

export type CodexRunResponse = {
  readonly threadId: string | null;
  readonly finalResponse: string;
  readonly actions: MoodleCodexAction[];
};

export type CodexAuthStatus = {
  readonly paired?: boolean;
  readonly authenticated: boolean;
  readonly detail?: string;
  readonly moodleConnected?: boolean;
  readonly moodleUserId?: number | null;
  readonly moodleSiteUrl?: string | null;
};

export type CodexPairing = {
  readonly pairingId: string;
  readonly userCode: string;
  readonly expiresAt: string;
  readonly approveCommand?: string;
};

export type CodexPairingClaim =
  | { readonly status: "pending" }
  | { readonly status: "expired" }
  | { readonly status: "paired" };

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
      readonly actions?: MoodleCodexAction[];
    }
  | {
      readonly type: "error";
      readonly error: string;
    };

export async function runCodexTask(
  request: CodexRunRequest,
): Promise<CodexRunResponse> {
  const response = await fetch(getCodexRunUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(await getCodexAuthHeaders()),
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

  if (!payload || typeof payload.finalResponse !== "string") {
    throw new Error("Codex returned an unexpected response.");
  }

  return {
    threadId:
      typeof payload.threadId === "string" && payload.threadId.length > 0
        ? payload.threadId
        : null,
    finalResponse: payload.finalResponse,
    actions: parseActions(payload.actions),
  };
}

export async function streamCodexTask(
  request: CodexRunRequest,
  onEvent: (event: CodexStreamEvent) => void,
): Promise<CodexRunResponse> {
  const response = await fetch(getCodexRunUrl(), {
    method: "POST",
    headers: {
      accept: "application/x-ndjson",
      "content-type": "application/json",
      ...(await getCodexAuthHeaders()),
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
    if (fallback && typeof fallback === "object" && typeof fallback.finalResponse === "string") {
      return {
        threadId: typeof fallback.threadId === "string" ? fallback.threadId : null,
        finalResponse: fallback.finalResponse,
        actions: parseActions(fallback.actions),
      };
    }
    throw new Error("Codex streaming is not available in this runtime.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse = "";
  let threadId: string | null = null;
  let actions: MoodleCodexAction[] = [];

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
        actions = event.actions ?? [];
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
        actions = event.actions ?? [];
      }
    }
  }

  return { threadId, finalResponse, actions };
}

export async function getCodexAuthStatus(): Promise<CodexAuthStatus> {
  const response = await fetch(getCodexStatusUrl(), {
    method: "GET",
    headers: {
      accept: "application/json",
      ...(await getCodexAuthHeaders()),
    },
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    if (response.status === 401) {
      return {
        paired: false,
        authenticated: false,
        detail:
          getErrorMessage(payload) ??
          "Pair this device before using codex.moodle.",
      };
    }
    return {
      authenticated: false,
      detail:
        getErrorMessage(payload) ??
        `Codex auth check failed with status ${response.status}.`,
    };
  }

  return {
    paired: true,
    authenticated: payload?.authenticated === true,
    detail:
      typeof payload?.detail === "string" && payload.detail.length > 0
        ? payload.detail
        : undefined,
    moodleConnected: payload?.moodleConnected === true,
    moodleUserId:
      typeof payload?.moodleUserId === "number" ? payload.moodleUserId : null,
    moodleSiteUrl:
      typeof payload?.moodleSiteUrl === "string" ? payload.moodleSiteUrl : null,
  };
}

export async function startCodexAuth(
  onEvent: (event: CodexAuthEvent) => void,
): Promise<CodexAuthStatus> {
  const response = await fetch(getCodexAuthUrl(), {
    method: "POST",
    headers: {
      accept: "application/x-ndjson",
      ...(await getCodexAuthHeaders()),
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

export async function syncMoodleSessionToCodex(
  connection: MoodleConnection,
): Promise<CodexAuthStatus> {
  const response = await fetch(getCodexSessionUrl(), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(await getCodexAuthHeaders()),
    },
    body: JSON.stringify(connection),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload) ??
        `Moodle Codex session sync failed with status ${response.status}.`,
    );
  }

  return {
    paired: true,
    authenticated: payload?.authenticated === true,
    moodleConnected: payload?.moodleConnected === true,
    moodleUserId:
      typeof payload?.moodleUserId === "number" ? payload.moodleUserId : null,
    moodleSiteUrl:
      typeof payload?.moodleSiteUrl === "string" ? payload.moodleSiteUrl : null,
  };
}

export async function startCodexPairing(): Promise<CodexPairing> {
  const response = await fetch(`${getCodexMoodleBaseUrl()}/pair/start`, {
    method: "POST",
    headers: {
      accept: "application/json",
    },
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload) ??
        `Codex pairing failed with status ${response.status}.`,
    );
  }
  if (
    typeof payload?.pairingId !== "string" ||
    typeof payload.userCode !== "string" ||
    typeof payload.expiresAt !== "string"
  ) {
    throw new Error("Codex pairing returned an unexpected response.");
  }
  return {
    pairingId: payload.pairingId,
    userCode: payload.userCode,
    expiresAt: payload.expiresAt,
    approveCommand:
      typeof payload.approveCommand === "string"
        ? payload.approveCommand
        : undefined,
  };
}

export async function claimCodexPairing(
  pairing: CodexPairing,
): Promise<CodexPairingClaim> {
  const response = await fetch(`${getCodexMoodleBaseUrl()}/pair/claim`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      pairingId: pairing.pairingId,
      userCode: pairing.userCode,
    }),
  });
  const payload = await readJsonResponse(response);
  if (response.status === 410) {
    return { status: "expired" };
  }
  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload) ??
        `Codex pairing check failed with status ${response.status}.`,
    );
  }
  if (payload?.status === "pending") {
    return { status: "pending" };
  }
  if (payload?.status === "paired" && typeof payload.token === "string") {
    await storeCodexDeviceToken(payload.token);
    return { status: "paired" };
  }

  throw new Error("Codex pairing returned an unexpected status.");
}

function getCodexRunUrl(): string {
  if (!shouldUseVpsCodex()) {
    const configured = process?.env?.EXPO_PUBLIC_CODEX_RUN_URL?.trim();
    if (configured) {
      return configured;
    }
    return CODEX_WEB_RUN_PATH;
  }

  return `${getCodexMoodleBaseUrl()}/run`;
}

function getCodexAuthUrl(): string {
  if (shouldUseVpsCodex()) {
    return `${getCodexMoodleBaseUrl()}/codex/auth`;
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

function getCodexStatusUrl(): string {
  if (shouldUseVpsCodex()) {
    return `${getCodexMoodleBaseUrl()}/status`;
  }

  return getCodexAuthUrl();
}

function shouldUseVpsCodex(): boolean {
  return (
    Platform.OS !== "web" ||
    Boolean(getConfiguredCodexBaseUrl()) ||
    Boolean(getExtraString("codexBaseUrl"))
  );
}

function getCodexSessionUrl(): string {
  return `${getCodexMoodleBaseUrl()}/session`;
}

function getCodexMoodleBaseUrl(): string {
  return stripTrailingSlash(
    getConfiguredCodexBaseUrl() ??
      getExtraString("codexBaseUrl") ??
      CODEX_MOODLE_BASE_URL,
  );
}

function getConfiguredCodexBaseUrl(): string | null {
  const configured = process?.env?.EXPO_PUBLIC_CODEX_BASE_URL?.trim();
  return configured ? stripTrailingSlash(configured) : null;
}

async function getCodexAuthHeaders(): Promise<Record<string, string>> {
  const token = await loadCodexDeviceToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

function getExtraString(key: string): string | null {
  const extra = Constants.expoConfig?.extra;
  if (!extra || typeof extra !== "object") {
    return null;
  }

  const value = (extra as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
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

  return JSON.parse(line) as CodexStreamEvent;
}

function parseAuthEvent(line: string): CodexAuthEvent | null {
  if (!line.trim()) {
    return null;
  }

  return JSON.parse(line) as CodexAuthEvent;
}

function parseActions(value: unknown): MoodleCodexAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((action): MoodleCodexAction[] => {
    if (!action || typeof action !== "object") {
      return [];
    }
    const record = action as Record<string, unknown>;
    const reason = typeof record.reason === "string" ? record.reason : undefined;

    if (record.type === "navigate_tab" && isAppView(record.view)) {
      return [{ type: "navigate_tab", view: record.view, reason }];
    }
    if (record.type === "show_profile") {
      return [{ type: "show_profile", reason }];
    }
    if (record.type === "open_course" && typeof record.courseId === "string") {
      return [{ type: "open_course", courseId: record.courseId, reason }];
    }
    if (record.type === "load_course_contents" && typeof record.courseId === "string") {
      return [{ type: "load_course_contents", courseId: record.courseId, reason }];
    }
    if (record.type === "open_pdf" && typeof record.courseId === "string") {
      return [{
        type: "open_pdf",
        courseId: record.courseId,
        resourceId: typeof record.resourceId === "string" ? record.resourceId : null,
        filename: typeof record.filename === "string" ? record.filename : null,
        reason,
      }];
    }
    if (record.type === "scroll_pdf_to_page" && typeof record.page === "number") {
      return [{ type: "scroll_pdf_to_page", page: Math.max(1, Math.floor(record.page)), reason }];
    }

    return [];
  });
}

function isAppView(value: unknown): value is "courses" | "connect" | "codex" | "profile" {
  return (
    value === "courses" ||
    value === "connect" ||
    value === "codex" ||
    value === "profile"
  );
}
