import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { decodeMoodleSession, encodeMoodleSession, MOODLE_SESSION_COOKIE } from "@/lib/moodle-session";
import {
  getMoodleInternalSecret,
  MOODLE_SERVICES_URL,
  readServiceJSON,
} from "@/lib/moodle-services";

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
  const search = new URL(request.url).search;
  const upstreamUrl = `${MOODLE_SERVICES_URL}/api/${upstreamPath}${search}`;

  let upstreamResponse = await fetch(upstreamUrl, {
    cache: "no-store",
    headers: {
      ...proxyRequestHeaders(request),
      "X-Moodle-App-Key": session.apiKey,
    },
  });

  if (upstreamResponse.status === 401) {
    const restored = await restoreMoodleSession(userId);
    if (restored.ok) {
      upstreamResponse = await fetch(upstreamUrl, {
        cache: "no-store",
        headers: {
          ...proxyRequestHeaders(request),
          "X-Moodle-App-Key": restored.session.apiKey,
        },
      });
    }
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

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers,
  });
}

function proxyRequestHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const header of ["range", "if-range"]) {
    const value = request.headers.get(header);
    if (value) {
      headers[header] = value;
    }
  }
  return headers;
}

export async function POST(request: Request, context: RouteContext) {
  const params = await context.params;
  const route = params.path?.join("/") ?? "";
  if (route === "keys") {
    return createAPIKey(request);
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
