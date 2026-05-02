import { auth } from "@clerk/nextjs/server";

const MOODLE_SERVICES_URL =
  process.env.MOODLE_SERVICES_URL ?? "https://moodle-services.os-home.net";

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

export async function GET(request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.MOODLE_SERVICES_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Moodle Services API key is not configured." },
      { status: 500 },
    );
  }

  const params = await context.params;
  const upstreamPath = params.path?.map(encodeURIComponent).join("/") ?? "";
  const search = new URL(request.url).search;
  const upstreamUrl = `${MOODLE_SERVICES_URL}/api/${upstreamPath}${search}`;

  const upstreamResponse = await fetch(upstreamUrl, {
    cache: "no-store",
    headers: {
      "X-Moodle-App-Key": apiKey,
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
