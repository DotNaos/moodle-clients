import { createHmac, timingSafeEqual } from "crypto";

export const MOODLE_SESSION_COOKIE = "moodle_session";

export type MoodleSession = {
  clerkUserId: string;
  apiKey: string;
  createdAt: number;
};

export function encodeMoodleSession(session: MoodleSession): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeMoodleSession(value: string | undefined, clerkUserId: string): MoodleSession | null {
  if (!value) {
    return null;
  }
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<MoodleSession>;
    if (decoded.clerkUserId !== clerkUserId || !decoded.apiKey || typeof decoded.createdAt !== "number") {
      return null;
    }
    return decoded as MoodleSession;
  } catch {
    return null;
  }
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signingSecret(): string {
  const secret = process.env.MOODLE_WEB_COOKIE_SECRET ?? process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error("MOODLE_WEB_COOKIE_SECRET is not configured.");
  }
  return secret;
}
