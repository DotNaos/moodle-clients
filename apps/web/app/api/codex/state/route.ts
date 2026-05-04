import { auth } from "@clerk/nextjs/server";

import {
  getMoodleInternalSecret,
  MOODLE_SERVICES_URL,
  readServiceJSON,
} from "@/lib/moodle-services";

export const runtime = "nodejs";

const UPSTREAM_PATH = "/api/auth/clerk/codex/state";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstreamUrl = new URL(`${MOODLE_SERVICES_URL}${UPSTREAM_PATH}`);
  const requestUrl = new URL(request.url);
  const kind = requestUrl.searchParams.get("kind");
  if (kind) {
    upstreamUrl.searchParams.set("kind", kind);
  }

  return proxyCodexState(userId, upstreamUrl, { method: "GET" });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  return proxyCodexState(userId, new URL(`${MOODLE_SERVICES_URL}${UPSTREAM_PATH}`), {
    method: "POST",
    body,
  });
}

async function proxyCodexState(
  clerkUserId: string,
  upstreamUrl: URL,
  init: { method: "GET" | "POST"; body?: string },
) {
  let internalSecret: string;
  try {
    internalSecret = getMoodleInternalSecret();
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    method: init.method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Clerk-User-Id": clerkUserId,
      "X-Moodle-Internal-Secret": internalSecret,
    },
    body: init.body,
  });
  const payload = await readServiceJSON<unknown>(upstreamResponse);

  return Response.json(payload, { status: upstreamResponse.status });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
