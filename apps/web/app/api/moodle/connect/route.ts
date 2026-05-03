import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { encodeMoodleSession, MOODLE_SESSION_COOKIE } from "@/lib/moodle-session";
import {
  getMoodleInternalSecret,
  MOODLE_SERVICES_URL,
  readServiceJSON,
} from "@/lib/moodle-services";

export const runtime = "nodejs";

type QRExchangeResponse = {
  user?: unknown;
  apiKey?: string;
  apiKeyRecord?: unknown;
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

  const body = (await request.json().catch(() => null)) as { qr?: unknown; name?: unknown } | null;
  const qr = typeof body?.qr === "string" ? body.qr.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!qr) {
    return Response.json({ error: "QR code is missing." }, { status: 400 });
  }

  const upstreamResponse = await fetch(`${MOODLE_SERVICES_URL}/api/auth/clerk/qr/exchange`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Clerk-User-Id": userId,
      "X-Moodle-Internal-Secret": internalSecret,
    },
    body: JSON.stringify({ qr, name }),
  });

  const payload = await readServiceJSON<QRExchangeResponse>(upstreamResponse);
  if (!upstreamResponse.ok || !payload.apiKey) {
    return Response.json(
      { error: payload.error ?? "Could not connect Moodle account." },
      { status: upstreamResponse.status || 502 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(
    MOODLE_SESSION_COOKIE,
    encodeMoodleSession({
      clerkUserId: userId,
      apiKey: payload.apiKey,
      createdAt: Date.now(),
    }),
    {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 180,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  );

  return Response.json({
    user: payload.user ?? null,
    apiKeyRecord: payload.apiKeyRecord ?? null,
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
