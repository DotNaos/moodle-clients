import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

import { checkBackendPreflight } from "@/lib/backend-preflight";
import { decodeMoodleSession, encodeMoodleSession, MOODLE_SESSION_COOKIE } from "@/lib/moodle-session";
import { getMoodleInternalSecret, MOODLE_SERVICES_URL, proxyServiceResponse, readServiceJSON } from "@/lib/moodle-services";
import { readStudyPipelineApiAuth, studyPipelineApiAuthHeaders } from "@/lib/study-pipeline-api-auth";

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request, context: RouteContext) {
  return proxyStudyPipeline(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyStudyPipeline(request, context);
}

async function proxyStudyPipeline(request: Request, context: RouteContext) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const startedAt = Date.now();
  const params = await context.params;
  const upstreamPath = params.path?.map(encodeURIComponent).join("/") ?? "";

  const apiAuth = readStudyPipelineApiAuth(request.headers);
  if (apiAuth) {
    if (!isStudyPipelinePath(upstreamPath)) {
      return withRequestId(Response.json({ error: "Study pipeline route not found." }, { status: 404 }), requestId);
    }
    return proxyStudyPipelineWithApiKey(request, upstreamPath, apiAuth, requestId, startedAt);
  }

  const { userId } = await auth();
  if (!userId) {
    return withRequestId(pipelineBlockedResponse("unauthenticated", "Sign in before opening the pipeline.", 401), requestId);
  }
  if (!isStudyPipelinePath(upstreamPath)) {
    return withRequestId(Response.json({ error: "Study pipeline route not found." }, { status: 404 }), requestId);
  }
  const serviceApiKey = readMoodleServicesApiKey();
  if (request.method === "GET" && serviceApiKey && isReadOnlyStudyPipelinePath(upstreamPath)) {
    return proxyStudyPipelineWithApiKey(request, upstreamPath, {
      apiKey: serviceApiKey,
      clerkUserId: "",
    }, requestId, startedAt);
  }
  const backendGate = await checkBackendPreflight(userId);
  if (backendGate.state === "blocked") {
    return withRequestId(pipelineBlockedResponse(
      backendGate.code,
      backendGate.error ?? "Moodle backend is not ready for the pipeline.",
      backendGate.status,
    ), requestId);
  }
  if (backendGate.state === "needs_moodle_connect") {
    return withRequestId(pipelineBlockedResponse("moodle_not_connected", "Connect Moodle before opening the pipeline.", 409), requestId);
  }
  const session = await resolveMoodleSession(userId);
  if (!session.ok) {
    return withRequestId(pipelineBlockedResponse(session.code, session.error), requestId);
  }

  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(`${MOODLE_SERVICES_URL}/api/${upstreamPath}`);
  upstreamUrl.search = requestUrl.search;

  const headers = studyPipelineHeaders(userId, session.session.apiKey);
  headers.set("X-Request-ID", requestId);
  const accept = request.headers.get("accept");
  if (accept) {
    headers.set("accept", accept);
  }
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.text() : undefined;
  const upstreamResponse = await fetchStudyPipelineUpstream(upstreamUrl, {
    method: request.method,
    cache: "no-store",
    headers,
    body,
  }, {
    method: request.method,
    requestId,
    startedAt,
    upstreamPath,
  });
  if (upstreamResponse.kind === "error") {
    return upstreamResponse.response;
  }

  if (upstreamResponse.response.status !== 401) {
    return proxyStudyPipelineResponse(upstreamResponse.response, {
      request,
      requestId,
      startedAt,
      upstreamPath,
    });
  }

  if (allowLocalAnonymousStudyPipeline()) {
    const anonymousHeaders = studyPipelineHeaders(userId, "");
    anonymousHeaders.set("X-Request-ID", requestId);
    const retryResponse = await fetchStudyPipelineUpstream(upstreamUrl, {
      method: request.method,
      cache: "no-store",
      headers: anonymousHeaders,
      body,
    }, {
      method: request.method,
      requestId,
      retry: "anonymous-local",
      startedAt,
      upstreamPath,
    });
    if (retryResponse.kind === "error") {
      return retryResponse.response;
    }
    if (retryResponse.response.status !== 401) {
      return proxyStudyPipelineResponse(retryResponse.response, {
        request,
        requestId,
        retry: "anonymous-local",
        startedAt,
        upstreamPath,
      });
    }
  }

  const restored = await restoreMoodleSession(userId);
  if (!restored.ok) {
    await clearMoodleSessionCookie();
    return withRequestId(pipelineBlockedResponse(restored.code, restored.error), requestId);
  }
  const retryHeaders = studyPipelineHeaders(userId, restored.session.apiKey);
  retryHeaders.set("X-Request-ID", requestId);
  if (accept) {
    retryHeaders.set("accept", accept);
  }
  if (contentType) {
    retryHeaders.set("content-type", contentType);
  }
  const retryResponse = await fetchStudyPipelineUpstream(upstreamUrl, {
    method: request.method,
    cache: "no-store",
    headers: retryHeaders,
    body,
  }, {
    method: request.method,
    requestId,
    retry: "restored-session",
    startedAt,
    upstreamPath,
  });
  if (retryResponse.kind === "error") {
    return retryResponse.response;
  }

  if (retryResponse.response.status === 401) {
    await clearMoodleSessionCookie();
    return withRequestId(pipelineBlockedResponse(
      "moodle_session_expired",
      "Moodle session could not be verified. Reconnect Moodle before opening the pipeline.",
    ), requestId);
  }

  return proxyStudyPipelineResponse(retryResponse.response, {
    request,
    requestId,
    retry: "restored-session",
    startedAt,
    upstreamPath,
  });
}

async function proxyStudyPipelineWithApiKey(
  request: Request,
  upstreamPath: string,
  apiAuth: { apiKey: string; clerkUserId: string },
  requestId: string,
  startedAt: number,
) {
  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(`${MOODLE_SERVICES_URL}/api/${upstreamPath}`);
  upstreamUrl.search = requestUrl.search;

  const headers = studyPipelineApiAuthHeaders(apiAuth);
  headers.set("X-Request-ID", requestId);
  const accept = request.headers.get("accept");
  if (accept) {
    headers.set("accept", accept);
  }
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.text() : undefined;
  const upstreamResponse = await fetchStudyPipelineUpstream(upstreamUrl, {
    body,
    cache: "no-store",
    headers,
    method: request.method,
  }, {
    method: request.method,
    requestId,
    retry: "api-key",
    startedAt,
    upstreamPath,
  });
  if (upstreamResponse.kind === "error") {
    return upstreamResponse.response;
  }

  return proxyStudyPipelineResponse(upstreamResponse.response, {
    request,
    requestId,
    retry: "api-key",
    startedAt,
    upstreamPath,
  });
}

async function fetchStudyPipelineUpstream(
  input: URL,
  init: RequestInit,
  context: {
    method: string;
    requestId: string;
    retry?: string;
    startedAt: number;
    upstreamPath: string;
  },
): Promise<{ kind: "response"; response: Response } | { kind: "error"; response: Response }> {
  try {
    return { kind: "response", response: await fetch(input, init) };
  } catch (error) {
    const classified = classifyUpstreamFetchError(error);
    logStudyPipelineProxy({
      durationMs: Date.now() - context.startedAt,
      error: `${classified.code}: ${classified.error}`,
      method: context.method,
      requestId: context.requestId,
      retry: context.retry,
      status: classified.status,
      upstreamPath: context.upstreamPath,
    });
    return {
      kind: "error",
      response: withRequestId(Response.json({
        code: classified.code,
        error: classified.error,
        requestId: context.requestId,
      }, { status: classified.status }), context.requestId),
    };
  }
}

function classifyUpstreamFetchError(error: unknown): { code: string; error: string; status: number } {
  const code = extractErrorCode(error);
  if (code === "UND_ERR_HEADERS_TIMEOUT") {
    return {
      code: "upstream_headers_timeout",
      error: "The pipeline run is still waiting for the backend response. The server may continue running it; refresh the pipeline status in a moment.",
      status: 504,
    };
  }
  return {
    code: "upstream_fetch_failed",
    error: getErrorMessage(error),
    status: 502,
  };
}

function extractErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const maybeCode = "code" in error ? (error as { code?: unknown }).code : undefined;
    if (typeof maybeCode === "string") return maybeCode;
    const cause = "cause" in error ? (error as { cause?: unknown }).cause : undefined;
    if (typeof cause === "object" && cause !== null && "code" in cause) {
      const causeCode = (cause as { code?: unknown }).code;
      if (typeof causeCode === "string") return causeCode;
    }
  }
  return "";
}

async function proxyStudyPipelineResponse(
  upstreamResponse: Response,
  context: {
    request: Request;
    requestId: string;
    retry?: string;
    startedAt: number;
    upstreamPath: string;
  },
): Promise<Response> {
  const shouldLog = context.request.method !== "GET" || !upstreamResponse.ok;
  if (shouldLog) {
    const error = upstreamResponse.ok ? undefined : await readErrorSummary(upstreamResponse.clone());
    logStudyPipelineProxy({
      durationMs: Date.now() - context.startedAt,
      error,
      method: context.request.method,
      requestId: context.requestId,
      retry: context.retry,
      status: upstreamResponse.status,
      upstreamPath: context.upstreamPath,
    });
  }
  return withRequestId(proxyServiceResponse(upstreamResponse), context.requestId);
}

function withRequestId(response: Response, requestId: string): Response {
  response.headers.set("X-Request-ID", requestId);
  return response;
}

async function readErrorSummary(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = await readServiceJSON<{ error?: unknown; code?: unknown }>(response);
    const parts = [payload.code, payload.error]
      .map((value) => typeof value === "string" ? value : "")
      .filter(Boolean);
    if (parts.length > 0) {
      return truncateLogValue(parts.join(": "));
    }
  }
  const text = await response.text().catch(() => "");
  return truncateLogValue(text || response.statusText || "upstream request failed");
}

function logStudyPipelineProxy(event: {
  durationMs: number;
  error?: string;
  method: string;
  requestId: string;
  retry?: string;
  status: number;
  upstreamPath: string;
}) {
  const payload = {
    event: "study_pipeline.proxy",
    duration_ms: event.durationMs,
    error: event.error,
    method: event.method,
    request_id: event.requestId,
    retry: event.retry,
    status: event.status,
    upstream_path: event.upstreamPath,
  };
  const line = JSON.stringify(payload);
  if (event.status >= 400) {
    console.error(line);
  } else {
    console.log(line);
  }
}

function truncateLogValue(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed;
}

function isStudyPipelinePath(path: string): boolean {
  const parts = path.split("/");
  return parts.length >= 3 && parts[0] === "courses" && parts[2] === "study-pipeline";
}

function isReadOnlyStudyPipelinePath(path: string): boolean {
  const parts = path.split("/");
  if (parts.length < 3 || parts[0] !== "courses" || parts[2] !== "study-pipeline") {
    return false;
  }
  if (parts.length === 3) {
    return true;
  }
  const action = parts[3];
  return [
    "extracted-asset",
    "extracted-documents",
    "inventory",
    "review",
    "runs",
    "script",
    "status",
    "task-view",
  ].includes(action);
}

function readMoodleServicesApiKey(): string {
  return process.env.MOODLE_SERVICES_API_KEY?.trim() ?? "";
}

function studyPipelineHeaders(userId: string, apiKey: string): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
    "X-Clerk-User-Id": userId,
  });
  if (apiKey) {
    headers.set("X-Moodle-App-Key", apiKey);
  }
  return headers;
}

function allowLocalAnonymousStudyPipeline(): boolean {
  try {
    const serviceURL = new URL(MOODLE_SERVICES_URL);
    return ["127.0.0.1", "localhost", "::1"].includes(serviceURL.hostname);
  } catch {
    return false;
  }
}

type SessionRestorePayload = {
  user?: unknown;
  apiKey?: string;
  apiKeyRecord?: unknown;
  error?: string;
};

type MoodleSessionState = {
  clerkUserId: string;
  apiKey: string;
  createdAt: number;
};

type SessionResult = { ok: true; session: MoodleSessionState } | { ok: false; code: string; error: string };

async function resolveMoodleSession(userId: string): Promise<SessionResult> {
  const cookieStore = await cookies();
  const session = decodeMoodleSession(cookieStore.get(MOODLE_SESSION_COOKIE)?.value, userId);
  if (session) {
    return { ok: true, session };
  }
  return restoreMoodleSession(userId);
}

async function restoreMoodleSession(userId: string): Promise<SessionResult> {
  let internalSecret: string;
  try {
    internalSecret = getMoodleInternalSecret();
  } catch (error) {
    return {
      code: "backend_auth_misconfigured",
      error: getErrorMessage(error),
      ok: false,
    };
  }

  const upstreamResponse = await fetch(`${MOODLE_SERVICES_URL}/api/auth/clerk/session`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Clerk-User-Id": userId,
      "X-Moodle-Internal-Secret": internalSecret,
    },
    body: "{}",
  });

  const payload = await readServiceJSON<SessionRestorePayload>(upstreamResponse);
  if (!upstreamResponse.ok || !payload.apiKey) {
    return {
      code: upstreamResponse.status === 401 || upstreamResponse.status === 403
        ? "backend_auth_misconfigured"
        : "moodle_not_connected",
      error: payload.error ?? "Connect your Moodle account first.",
      ok: false,
    };
  }

  const session = {
    clerkUserId: userId,
    apiKey: payload.apiKey,
    createdAt: Date.now(),
  };
  const cookieStore = await cookies();
  cookieStore.set(MOODLE_SESSION_COOKIE, encodeMoodleSession(session), sessionCookieOptions());
  return { ok: true, session };
}

function pipelineBlockedResponse(code: string, error: string, status = code === "unauthenticated" ? 401 : 409) {
  return Response.json(
    {
      code,
      error,
    },
    { status },
  );
}

async function clearMoodleSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(MOODLE_SESSION_COOKIE);
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 180,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  } as const;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
