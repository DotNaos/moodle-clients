import { auth } from "@clerk/nextjs/server";

const MOODLE_SERVICES_URL =
  process.env.MOODLE_SERVICES_URL ?? "https://moodle-services.os-home.net";

export const runtime = "nodejs";

type CompleteRequest = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  resource?: string;
};

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const internalSecret = process.env.MOODLE_WEB_INTERNAL_SECRET;
  if (!internalSecret) {
    return Response.json(
      { error: "Moodle OAuth connection secret is not configured." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as CompleteRequest | null;
  if (!body?.client_id || !body.redirect_uri || !body.code_challenge) {
    return Response.json({ error: "Missing OAuth request data." }, { status: 400 });
  }

  const upstreamResponse = await fetch(`${MOODLE_SERVICES_URL}/oauth/authorize/complete`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Clerk-User-Id": userId,
      "X-Moodle-Internal-Secret": internalSecret,
    },
    body: JSON.stringify(body),
  });

  const payload = (await upstreamResponse.json().catch(() => ({}))) as {
    redirectUrl?: string;
    error?: string;
  };
  if (!upstreamResponse.ok || !payload.redirectUrl) {
    return Response.json(
      { error: payload.error ?? "Could not authorize ChatGPT." },
      { status: upstreamResponse.status || 502 },
    );
  }

  return Response.json({ redirectUrl: payload.redirectUrl });
}
