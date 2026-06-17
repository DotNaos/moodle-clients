import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { decodeMoodleSession, encodeMoodleSession, MOODLE_SESSION_COOKIE } from "@/lib/moodle-session";
import { getMoodleCacheConfig, readMoodleCache, writeMoodleCache } from "@/lib/moodle-cache";
import {
  getMoodleInternalSecret,
  MOODLE_SERVICES_URL,
  readServiceJSON,
} from "@/lib/moodle-services";
import { buildPDFRangeResponse } from "@/lib/pdf-range-response";

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  let session = decodeMoodleSession(
    cookieStore.get(MOODLE_SESSION_COOKIE)?.value,
    userId,
  );
  if (!session) {
    const restored = await restoreMoodleSession(userId);
    if (!restored.ok) {
      return moodleNotConnectedResponse(restored.error);
    }
    session = restored.session;
  }

  const params = await context.params;
  const upstreamPath = params.path?.map(encodeURIComponent).join("/") ?? "";
  const isPDFPreview = isMaterialPDFPreviewRoute(upstreamPath);
  const requestUrl = new URL(request.url);
  const search = upstreamSearch(requestUrl.searchParams);
  const cacheConfig = getMoodleCacheConfig(userId, upstreamPath, requestUrl.searchParams);
  if (cacheConfig) {
    const cached = await readMoodleCache(cacheConfig, userId);
    if (cached.hit) {
      return Response.json(cached.value, {
        headers: {
          "cache-control": "private, max-age=30",
          "x-moodle-cache": "HIT"
        }
      });
    }
  }

  const upstreamUrl = `${MOODLE_SERVICES_URL}/api/${upstreamPath}${search}`;

  let upstreamResponse = await fetch(upstreamUrl, {
    cache: "no-store",
    headers: {
      ...proxyRequestHeaders(request, { forwardRange: !isPDFPreview }),
      ...moodleAPIKeyHeader(upstreamPath, session.apiKey),
    },
  });

  if (upstreamResponse.status === 401) {
    const restored = await restoreMoodleSession(userId);
    if (restored.ok) {
      upstreamResponse = await fetch(upstreamUrl, {
        cache: "no-store",
        headers: {
          ...proxyRequestHeaders(request, { forwardRange: !isPDFPreview }),
          ...moodleAPIKeyHeader(upstreamPath, restored.session.apiKey),
        },
      });
    }
  }

  const tokenError = await readMoodleTokenError(upstreamResponse);
  if (tokenError) {
    return moodleNotConnectedResponse(tokenError);
  }

  const upstreamContentType = upstreamResponse.headers.get("content-type");
  if (!upstreamResponse.ok && isHTMLContent(upstreamContentType)) {
    const error = await readHTMLServiceError(upstreamResponse);
    return Response.json({ error }, { status: upstreamResponse.status || 502 });
  }

  const headers = new Headers();
  for (const header of ["content-type", "content-disposition", "cache-control", "accept-ranges", "content-range"]) {
    const value = upstreamResponse.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (isPDFPreview && headers.get("content-type")?.toLowerCase().includes("application/pdf")) {
    headers.set("content-disposition", inlinePDFDisposition(headers.get("content-disposition")));
    // Safari only renders a framed PDF when the server answers Range requests
    // with 206; the upstream may not, so we buffer and serve ranges ourselves.
    const body = await upstreamResponse.arrayBuffer();
    return buildPDFRangeResponse(body, request.headers.get("range"), headers);
  }

  if (cacheConfig && upstreamResponse.ok && headers.get("content-type")?.includes("application/json")) {
    const payload = await readServiceJSON<unknown>(upstreamResponse);
    await writeMoodleCache(cacheConfig, userId, payload);
    return Response.json(payload, {
      status: upstreamResponse.status,
      headers: {
        "cache-control": "private, max-age=30",
        "x-moodle-cache": "MISS"
      }
    });
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers,
  });
}

function upstreamSearch(searchParams: URLSearchParams): string {
  const forwarded = new URLSearchParams(searchParams);
  forwarded.delete("cache");
  const text = forwarded.toString();
  return text ? `?${text}` : "";
}

function proxyRequestHeaders(
  request: Request,
  options?: { forwardRange?: boolean },
): Record<string, string> {
  const headers: Record<string, string> = {};
  // The PDF preview route serves ranges itself, so it fetches the full body.
  if (options?.forwardRange === false) {
    return headers;
  }
  for (const header of ["range", "if-range"]) {
    const value = request.headers.get(header);
    if (value) {
      headers[header] = value;
    }
  }
  return headers;
}

function moodleAPIKeyHeader(upstreamPath: string, apiKey: string): Record<string, string> {
  if (isStudyPipelineRoute(upstreamPath)) {
    return {};
  }
  return { "X-Moodle-App-Key": apiKey };
}

function isMaterialPDFPreviewRoute(upstreamPath: string): boolean {
  return /^courses\/[^/]+\/materials\/[^/]+\/pdf$/.test(upstreamPath);
}

function inlinePDFDisposition(disposition: string | null): string {
  if (!disposition) {
    return "inline";
  }
  return disposition.replace(/^attachment/i, "inline");
}

export async function POST(request: Request, context: RouteContext) {
  const params = await context.params;
  const route = params.path?.join("/") ?? "";
  if (isStudyPipelineRoute(route)) {
    return proxyMoodlePost(request, params.path ?? []);
  }
  if (route === "keys") {
    return createAPIKey(request);
  }
  if (route === "webex/credentials") {
    return saveWebexCredentials(request);
  }
  if (route === "courses") {
    const requestUrl = new URL(request.url);
    if (requestUrl.searchParams.get("route") === "calendar-subscription") {
      return saveCalendarSubscription(request);
    }
  }
  if (route !== "session/restore") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restored = await restoreMoodleSession(userId);
  if (!restored.ok) {
    return moodleNotConnectedResponse(restored.error);
  }

  return Response.json({
    connected: true,
    user: restored.user,
    apiKeyRecord: restored.apiKeyRecord,
  });
}

function isStudyPipelineRoute(route: string): boolean {
  const parts = route.split("/");
  return parts.length >= 3 && parts[0] === "courses" && parts[2] === "study-pipeline";
}

async function proxyMoodlePost(request: Request, path: string[]) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  let session = decodeMoodleSession(cookieStore.get(MOODLE_SESSION_COOKIE)?.value, userId);
  if (!session) {
    const restored = await restoreMoodleSession(userId);
    if (!restored.ok) {
      return moodleNotConnectedResponse(restored.error);
    }
    session = restored.session;
  }

  const upstreamPath = path.map(encodeURIComponent).join("/");
  const body = await request.text();
  let upstreamResponse = await fetch(`${MOODLE_SERVICES_URL}/api/${upstreamPath}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      ...moodleAPIKeyHeader(upstreamPath, session.apiKey),
    },
    body: body || "{}",
  });

  if (upstreamResponse.status === 401) {
    const restored = await restoreMoodleSession(userId);
    if (restored.ok) {
      upstreamResponse = await fetch(`${MOODLE_SERVICES_URL}/api/${upstreamPath}`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": request.headers.get("content-type") ?? "application/json",
          ...moodleAPIKeyHeader(upstreamPath, restored.session.apiKey),
        },
        body: body || "{}",
      });
    }
  }

  const tokenError = await readMoodleTokenError(upstreamResponse);
  if (tokenError) {
    return moodleNotConnectedResponse(tokenError);
  }

  const payload = await readServiceJSON<unknown>(upstreamResponse);
  return Response.json(payload, { status: upstreamResponse.status || 502 });
}

async function saveWebexCredentials(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  let session = decodeMoodleSession(cookieStore.get(MOODLE_SESSION_COOKIE)?.value, userId);
  if (!session) {
    const restored = await restoreMoodleSession(userId);
    if (!restored.ok) {
      return moodleNotConnectedResponse(restored.error);
    }
    session = restored.session;
  }

  const body = await request.text();
  const upstreamResponse = await fetch(`${MOODLE_SERVICES_URL}/api/webex/credentials`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      "X-Moodle-App-Key": session.apiKey,
    },
    body: body || "{}",
  });
  const tokenError = await readMoodleTokenError(upstreamResponse);
  if (tokenError) {
    return moodleNotConnectedResponse(tokenError);
  }
  const payload = await readServiceJSON<unknown>(upstreamResponse);
  return Response.json(payload, { status: upstreamResponse.status || 502 });
}

async function saveCalendarSubscription(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  let session = decodeMoodleSession(cookieStore.get(MOODLE_SESSION_COOKIE)?.value, userId);
  if (!session) {
    const restored = await restoreMoodleSession(userId);
    if (!restored.ok) {
      return moodleNotConnectedResponse(restored.error);
    }
    session = restored.session;
  }

  const requestUrl = new URL(request.url);
  const search = upstreamSearch(requestUrl.searchParams);
  const body = await request.text();
  const upstreamResponse = await fetch(`${MOODLE_SERVICES_URL}/api/courses${search}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      "X-Moodle-App-Key": session.apiKey,
    },
    body: body || "{}",
  });
  const tokenError = await readMoodleTokenError(upstreamResponse);
  if (tokenError) {
    return moodleNotConnectedResponse(tokenError);
  }
  const payload = await readServiceJSON<unknown>(upstreamResponse);
  return Response.json(payload, { status: upstreamResponse.status || 502 });
}

async function createAPIKey(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  let session = decodeMoodleSession(cookieStore.get(MOODLE_SESSION_COOKIE)?.value, userId);
  if (!session) {
    const restored = await restoreMoodleSession(userId);
    if (!restored.ok) {
      return moodleNotConnectedResponse(restored.error);
    }
    session = restored.session;
  }

  const body = await request.text();
  const upstreamResponse = await fetch(`${MOODLE_SERVICES_URL}/api/keys`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      "X-Moodle-App-Key": session.apiKey,
    },
    body: body || "{}",
  });
  const tokenError = await readMoodleTokenError(upstreamResponse);
  if (tokenError) {
    return moodleNotConnectedResponse(tokenError);
  }
  const payload = await readServiceJSON<CreateAPIKeyPayload>(upstreamResponse);

  if (upstreamResponse.ok && payload.apiKey) {
    cookieStore.set(
      MOODLE_SESSION_COOKIE,
      encodeMoodleSession({
        clerkUserId: userId,
        apiKey: payload.apiKey,
        createdAt: Date.now(),
      }),
      sessionCookieOptions(),
    );
  }

  return Response.json(payload, { status: upstreamResponse.status || 502 });
}

async function readMoodleTokenError(response: Response): Promise<string | null> {
  if (response.status !== 401) {
    return null;
  }

  const text = await response.clone().text().catch(() => "");
  const message = extractErrorMessage(text, response.headers.get("content-type"));
  if (!isMoodleTokenError(message || text)) {
    return null;
  }

  return "Your Moodle connection expired. Connect Moodle again to load fresh courses and materials.";
}

function extractErrorMessage(text: string, contentType: string | null): string {
  if (!contentType?.includes("application/json")) {
    return text;
  }

  try {
    const payload = JSON.parse(text) as { error?: unknown; message?: unknown };
    if (typeof payload.error === "string") {
      return payload.error;
    }
    if (typeof payload.message === "string") {
      return payload.message;
    }
  } catch {
    return text;
  }

  return text;
}

async function readHTMLServiceError(response: Response): Promise<string> {
  const text = await response.clone().text().catch(() => "");
  if (text.includes("__next_error__") || text.toLowerCase().includes("<!doctype html")) {
    return "Moodle services returned an internal error. Refresh Moodle or reconnect your account.";
  }
  return `Moodle services request failed with ${response.status || 502}.`;
}

function isHTMLContent(contentType: string | null): boolean {
  return contentType?.toLowerCase().includes("text/html") ?? false;
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

type SessionRestorePayload = {
  user?: unknown;
  apiKey?: string;
  apiKeyRecord?: unknown;
  error?: string;
};

type CreateAPIKeyPayload = {
  apiKey?: string;
  apiKeyRecord?: unknown;
  revokedExisting?: boolean;
  error?: string;
};

type SessionRestoreResult =
  | {
      ok: true;
      session: { clerkUserId: string; apiKey: string; createdAt: number };
      user: unknown;
      apiKeyRecord: unknown;
    }
  | { ok: false; error?: string };

async function restoreMoodleSession(userId: string): Promise<SessionRestoreResult> {
  let internalSecret: string;
  try {
    internalSecret = getMoodleInternalSecret();
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
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
    return { ok: false, error: payload.error };
  }

  const session = {
    clerkUserId: userId,
    apiKey: payload.apiKey,
    createdAt: Date.now(),
  };
  const cookieStore = await cookies();
  cookieStore.set(MOODLE_SESSION_COOKIE, encodeMoodleSession(session), sessionCookieOptions());

  return {
    ok: true,
    session,
    user: payload.user ?? null,
    apiKeyRecord: payload.apiKeyRecord ?? null,
  };
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

function moodleNotConnectedResponse(error?: string) {
  return Response.json(
    {
      code: "moodle_not_connected",
      error: error ?? "Connect your Moodle account first.",
    },
    { status: 409 },
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
