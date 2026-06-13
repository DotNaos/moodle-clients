import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { decodeMoodleSession, encodeMoodleSession, MOODLE_SESSION_COOKIE } from "@/lib/moodle-session";
import { getMoodleInternalSecret, MOODLE_SERVICES_URL, proxyServiceResponse, readServiceJSON } from "@/lib/moodle-services";

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
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = await resolveMoodleSession(userId);
  if (!session.ok) {
    return moodleNotConnectedResponse(session.error);
  }

  const params = await context.params;
  const upstreamPath = params.path?.map(encodeURIComponent).join("/") ?? "";
  if (!isStudyPipelinePath(upstreamPath)) {
    return Response.json({ error: "Study pipeline route not found." }, { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(`${MOODLE_SERVICES_URL}/api/${upstreamPath}`);
  upstreamUrl.search = requestUrl.search;

  const headers = studyPipelineHeaders(userId, session.session.apiKey);
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
  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    cache: "no-store",
    headers,
    body,
  });

  if (upstreamResponse.status !== 401) {
    return proxyServiceResponse(upstreamResponse);
  }

  if (allowLocalAnonymousStudyPipeline()) {
    const retryResponse = await fetch(upstreamUrl, {
      method: request.method,
      cache: "no-store",
      headers: studyPipelineHeaders(userId, ""),
      body,
    });
    if (retryResponse.status !== 401) {
      return proxyServiceResponse(retryResponse);
    }
  }

  const restored = await restoreMoodleSession(userId);
  if (!restored.ok) {
    return proxyServiceResponse(upstreamResponse);
  }
  const retryHeaders = studyPipelineHeaders(userId, restored.session.apiKey);
  if (accept) {
    retryHeaders.set("accept", accept);
  }
  if (contentType) {
    retryHeaders.set("content-type", contentType);
  }
  const retryResponse = await fetch(upstreamUrl, {
    method: request.method,
    cache: "no-store",
    headers: retryHeaders,
    body,
  });

  return proxyServiceResponse(retryResponse);
}

function isStudyPipelinePath(path: string): boolean {
  const parts = path.split("/");
  return parts.length >= 3 && parts[0] === "courses" && parts[2] === "study-pipeline";
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

type SessionResult = { ok: true; session: MoodleSessionState } | { ok: false; error?: string };

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
  return { ok: true, session };
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
