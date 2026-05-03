import { auth } from "@clerk/nextjs/server";

import {
  getMoodleInternalSecret,
  MOODLE_SERVICES_URL,
  readServiceJSON,
} from "@/lib/moodle-services";

export const runtime = "nodejs";

type BridgeStartResponse = {
  bridgeUrl?: string;
  challenge?: string;
  state?: string;
  expiresAt?: string;
  error?: string;
};

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let internalSecret: string;
  try {
    internalSecret = getMoodleInternalSecret();
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const endpoint = `${origin}/api/mobile/bridge/complete`;
  const upstreamResponse = await fetch(`${MOODLE_SERVICES_URL}/api/auth/clerk/mobile/bridge/start`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Clerk-User-Id": userId,
      "X-Moodle-Internal-Secret": internalSecret,
    },
    body: JSON.stringify({
      origin,
      endpoint,
      appName: "Moodle Web",
    }),
  });

  const payload = await readServiceJSON<BridgeStartResponse>(upstreamResponse);
  if (!upstreamResponse.ok || !payload.bridgeUrl || !payload.challenge) {
    return Response.json(
      { error: payload.error ?? "Could not create a mobile bridge request." },
      { status: upstreamResponse.status || 502 },
    );
  }

  return Response.json({
    bridgeUrl: payload.bridgeUrl,
    challenge: payload.challenge,
    state: payload.state ?? "",
    expiresAt: payload.expiresAt ?? "",
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
