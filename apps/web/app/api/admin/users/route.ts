import { auth } from "@clerk/nextjs/server";

import {
  getMoodleInternalSecret,
  MOODLE_SERVICES_URL,
  readServiceJSON,
} from "@/lib/moodle-services";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return proxyAdminRequest(userId, "GET");
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return proxyAdminRequest(userId, "PATCH", await request.text());
}

async function proxyAdminRequest(userId: string, method: "GET" | "PATCH", body?: string) {
  let internalSecret: string;
  try {
    internalSecret = getMoodleInternalSecret();
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Admin API is not configured." },
      { status: 500 },
    );
  }

  const upstreamResponse = await fetch(`${MOODLE_SERVICES_URL}/api/auth/qr/exchange?codex=admin`, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Moodle-Internal-Secret": internalSecret,
      "X-Clerk-User-Id": userId,
    },
    body: method === "PATCH" ? body || "{}" : undefined,
  });
  const payload = await readServiceJSON<unknown>(upstreamResponse);
  return Response.json(payload, { status: upstreamResponse.status || 502 });
}
