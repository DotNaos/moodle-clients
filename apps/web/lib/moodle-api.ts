import type { Course, Material } from "@/lib/dashboard-data";

const MOODLE_API_BASE_URL = "/api/moodle";
const API_REQUEST_TIMEOUT_MS = 20_000;

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = init?.signal ? null : new AbortController();
  const timeout = controller
    ? globalThis.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(`${MOODLE_API_BASE_URL}${path}`, {
      ...init,
      signal: init?.signal ?? controller?.signal,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const text = await response.text();
    const payload = parseJSONResponse(text, response.headers.get("content-type"));

    if (!response.ok) {
      throw new APIRequestError(
        getAPIErrorMessage(payload, text, response.status),
        response.status,
        getAPIErrorCode(payload),
      );
    }

    return payload as T;
  } catch (error) {
    if (controller?.signal.aborted) {
      throw new APIRequestError("Moodle request timed out. Try refreshing the page.", 408, "request_timeout");
    }
    throw error;
  } finally {
    if (timeout) {
      globalThis.clearTimeout(timeout);
    }
  }
}

export class APIRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function isMoodleNotConnected(error: unknown): boolean {
  if (!(error instanceof APIRequestError)) {
    return false;
  }

  return (
    error.status === 409 && error.code === "moodle_not_connected" ||
    isMoodleTokenError(error.message)
  );
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function getMoodleConnectionMessage(error: unknown): string {
  const message = getErrorMessage(error);
  if (message === "Unauthorized") {
    return "Connect your Moodle account first.";
  }
  if (isMoodleTokenError(message)) {
    return "Your Moodle connection expired. Connect Moodle again to load fresh courses and materials.";
  }
  return message;
}

export function pruneMaterialCache(
  materialsByCourseId: Record<string, Material[]>,
  courses: Course[],
): Record<string, Material[]> {
  const courseIds = new Set(courses.map((course) => String(course.id)));
  return Object.fromEntries(
    Object.entries(materialsByCourseId).filter(([courseId]) => courseIds.has(courseId)),
  );
}

function parseJSONResponse(text: string, contentType: string | null): unknown {
  if (!text) {
    return {};
  }
  if (!contentType?.includes("application/json")) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function getAPIErrorMessage(payload: unknown, text: string, status: number): string {
  if (isObject(payload) && typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }

  const trimmed = text.trim();
  if (looksLikeHTMLDocument(trimmed)) {
    return `Moodle request failed with ${status}. Refresh Moodle or reconnect your account.`;
  }
  if (
    trimmed.includes("The page could not be found") ||
    trimmed.includes("NOT_FOUND") ||
    trimmed.toLowerCase() === "404 page not found"
  ) {
    return "The video stream service is not available on this backend yet. Start the updated Moodle Services backend or deploy it, then refresh.";
  }
  if (trimmed === "{}") {
    return `Request failed with ${status}. The calendar service may not be deployed yet.`;
  }

  if (trimmed) {
    return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
  }

  return `Request failed with ${status}`;
}

function looksLikeHTMLDocument(text: string): boolean {
  const normalized = text.slice(0, 300).toLowerCase();
  return normalized.includes("<!doctype html") || normalized.includes("<html");
}

function getAPIErrorCode(payload: unknown): string | undefined {
  return isObject(payload) && typeof payload.code === "string" ? payload.code : undefined;
}

function isMoodleTokenError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("mobile api error") && normalized.includes("token") ||
    normalized.includes("ungültiges token") ||
    normalized.includes("token wurde nicht gefunden") ||
    normalized.includes("invalid token")
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
