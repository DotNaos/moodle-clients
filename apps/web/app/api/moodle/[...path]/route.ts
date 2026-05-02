import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { decodeMoodleSession, MOODLE_SESSION_COOKIE } from "@/lib/moodle-session";

const MOODLE_SERVICES_URL =
  process.env.MOODLE_SERVICES_URL ?? "https://moodle-services.os-home.net";

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
  const session = decodeMoodleSession(
    cookieStore.get(MOODLE_SESSION_COOKIE)?.value,
    userId,
  );
  if (!session) {
    return Response.json(
      {
        code: "moodle_not_connected",
        error: "Connect your Moodle account first.",
      },
      { status: 409 },
    );
  }

  const params = await context.params;
  const upstreamPath = params.path?.map(encodeURIComponent).join("/") ?? "";
  const search = new URL(request.url).search;
  const upstreamUrl = `${MOODLE_SERVICES_URL}/api/${upstreamPath}${search}`;

  const upstreamResponse = await fetch(upstreamUrl, {
    cache: "no-store",
    headers: {
      "X-Moodle-App-Key": session.apiKey,
    },
  });

  return new Response(await upstreamResponse.arrayBuffer(), {
    status: upstreamResponse.status,
    headers: {
      "content-type":
        upstreamResponse.headers.get("content-type") ?? "application/json",
    },
  });
}
