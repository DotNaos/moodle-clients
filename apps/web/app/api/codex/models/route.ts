import { auth } from "@clerk/nextjs/server";

import { getTaskForgeInternalSecret, taskForgeFetch, TASK_FORGE_URL } from "@/lib/task-forge";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstreamResponse = await taskForgeFetch(`${TASK_FORGE_URL}/api/codex/models`, {
    cache: "no-store",
    headers: {
      "X-Clerk-User-Id": userId,
      "X-Task-Forge-Internal-Secret": getTaskForgeInternalSecret(),
    },
  });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      "cache-control": "no-store",
      "content-type": upstreamResponse.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
  });
}
