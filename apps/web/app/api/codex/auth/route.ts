import { auth } from "@clerk/nextjs/server";

import { codexRuntimeErrorMessage } from "@/lib/codex-runtime";
import { MOODLE_SERVICES_URL, moodleInternalHeaders, proxyServiceResponse } from "@/lib/moodle-services";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return proxyServiceResponse(
      await fetch(`${MOODLE_SERVICES_URL}/api/codex/status`, {
        method: "GET",
        cache: "no-store",
        headers: moodleInternalHeaders(userId),
      }),
    );
  } catch (error) {
    return Response.json({ error: codexRuntimeErrorMessage(error) }, { status: 500 });
  }
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return proxyServiceResponse(
      await fetch(`${MOODLE_SERVICES_URL}/api/codex/auth`, {
        method: "POST",
        cache: "no-store",
        headers: moodleInternalHeaders(userId),
      }),
    );
  } catch (error) {
    return Response.json({ error: codexRuntimeErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return proxyServiceResponse(
      await fetch(`${MOODLE_SERVICES_URL}/api/codex/auth`, {
        method: "DELETE",
        cache: "no-store",
        headers: moodleInternalHeaders(userId),
      }),
    );
  } catch (error) {
    return Response.json({ error: codexRuntimeErrorMessage(error) }, { status: 500 });
  }
}
