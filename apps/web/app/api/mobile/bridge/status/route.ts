import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { encodeMoodleSession, MOODLE_SESSION_COOKIE } from "@/lib/moodle-session";
import {
  getMoodleInternalSecret,
  MOODLE_SERVICES_URL,
  readServiceJSON,
} from "@/lib/moodle-services";

export const runtime = "nodejs";

type BridgeStatusResponse = {
  status?: "pending" | "connected" | "expired";
  apiKey?: string;
  userId?: string;
  error?: string;
};

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const challenge = new URL(request.url).searchParams.get("challenge")?.trim();
  if (!challenge) {
    return Response.json({ error: "Challenge is missing." }, { status: 400 });
  }

  let internalSecret: string;
  try {
    internalSecret = getMoodleInternalSecret();
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }

  const upstreamResponse = await fetch(
    `${MOODLE_SERVICES_URL}/api/auth/clerk/mobile/bridge/status?challenge=${encodeURIComponent(challenge)}`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        "X-Clerk-User-Id": userId,
        "X-Moodle-Internal-Secret": internalSecret,
      },
    },
  );

  const payload = await readServiceJSON<BridgeStatusResponse>(upstreamResponse);
  if (!upstreamResponse.ok) {
    return Response.json(
      { error: payload.error ?? "Could not read the mobile bridge status." },
      { status: upstreamResponse.status || 502 },
    );
  }

  if (payload.status === "connected" && payload.apiKey) {
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
  }

  return Response.json({
    status: payload.status ?? "pending",
    userId: payload.userId ?? null,
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
