import { auth } from "@clerk/nextjs/server";

import { getTaskForgeInternalSecret, taskForgeFetch, TASK_FORGE_URL } from "@/lib/task-forge";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return proxy(await taskForgeFetch(`${TASK_FORGE_URL}/api/codex/files`, {
    method: "GET",
    cache: "no-store",
    headers: taskForgeHeaders(userId),
  }));
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return proxy(await taskForgeFetch(`${TASK_FORGE_URL}/api/codex/files`, {
    method: "POST",
    cache: "no-store",
    headers: {
      ...taskForgeHeaders(userId),
      "Content-Type": "application/json",
    },
    body: await request.text(),
  }));
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  return proxy(await taskForgeFetch(`${TASK_FORGE_URL}/api/codex/files?name=${encodeURIComponent(url.searchParams.get("name") ?? "")}`, {
    method: "DELETE",
    cache: "no-store",
    headers: taskForgeHeaders(userId),
  }));
}

function taskForgeHeaders(userId: string): HeadersInit {
  return {
    "X-Clerk-User-Id": userId,
    "X-Task-Forge-Internal-Secret": getTaskForgeInternalSecret(),
  };
}

function proxy(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    headers: {
      "cache-control": "no-store",
      "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
  });
}
