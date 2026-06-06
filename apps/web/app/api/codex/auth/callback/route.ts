import { auth } from "@clerk/nextjs/server";

import { getTaskForgeInternalSecret, taskForgeFetch, TASK_FORGE_URL } from "@/lib/task-forge";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  const upstreamResponse = await taskForgeFetch(`${TASK_FORGE_URL}/api/codex/auth/callback`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Clerk-User-Id": userId,
      "X-Task-Forge-Internal-Secret": getTaskForgeInternalSecret(),
    },
    body,
  });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      "cache-control": "no-store",
      "content-type": upstreamResponse.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
  });
}
