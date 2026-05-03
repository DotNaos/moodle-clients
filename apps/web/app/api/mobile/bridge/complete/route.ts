import {
  getMoodleInternalSecret,
  MOODLE_SERVICES_URL,
  readServiceJSON,
} from "@/lib/moodle-services";

export const runtime = "nodejs";

type BridgeCompleteResponse = {
  status?: string;
  user?: unknown;
  error?: string;
};

export async function POST(request: Request) {
  let internalSecret: string;
  try {
    internalSecret = getMoodleInternalSecret();
  } catch (error) {
    return bridgeJSON({ error: getErrorMessage(error) }, 500);
  }

  const body = await request.text();
  const upstreamResponse = await fetch(`${MOODLE_SERVICES_URL}/api/auth/clerk/mobile/bridge/complete`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      "X-Moodle-Internal-Secret": internalSecret,
    },
    body,
  });

  const payload = await readServiceJSON<BridgeCompleteResponse>(upstreamResponse);
  if (!upstreamResponse.ok) {
    return bridgeJSON(
      { error: payload.error ?? "Could not complete the mobile bridge request." },
      upstreamResponse.status || 502,
    );
  }

  return bridgeJSON({
    status: payload.status ?? "connected",
    user: payload.user ?? null,
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function bridgeJSON(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}
