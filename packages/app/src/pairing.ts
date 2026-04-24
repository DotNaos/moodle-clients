import type { MoodleConnection } from "./moodle";

const MOBILE_PAIR_QR_SCHEME = "moodlereadonlyproxy://pair";

export type MobilePairTarget = {
  pairId: string;
  serverOrigin: string;
};

export function parseMobilePairTarget(raw: string): MobilePairTarget {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Pairing QR is empty.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Pairing QR is invalid.");
  }

  if (`${parsed.protocol}//${parsed.host}${parsed.pathname}` !== MOBILE_PAIR_QR_SCHEME) {
    throw new Error("This QR code is not a Moodle pairing QR.");
  }

  const pairId = parsed.searchParams.get("pairId")?.trim() ?? "";
  const server = parsed.searchParams.get("server")?.trim() ?? "";
  if (!pairId || !server) {
    throw new Error("Pairing QR is incomplete.");
  }

  let serverUrl: URL;
  try {
    serverUrl = new URL(server);
  } catch {
    throw new Error("Pairing QR contains an invalid server URL.");
  }

  if (serverUrl.protocol !== "https:" && serverUrl.protocol !== "http:") {
    throw new Error("Pairing QR contains an invalid server URL.");
  }

  return {
    pairId,
    serverOrigin: serverUrl.origin,
  };
}

export async function completeMobilePairing(
  target: MobilePairTarget,
  connection: MoodleConnection,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${target.serverOrigin}/api/mobile/pair/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pairId: target.pairId,
        moodleSiteUrl: connection.moodleSiteUrl,
        moodleUserId: connection.moodleUserId,
        moodleMobileToken: connection.moodleMobileToken,
      }),
    });
  } catch {
    throw new Error("Could not reach the pairing server.");
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = (await response.json()) as Record<string, unknown>;
  } catch {
    if (!response.ok) {
      throw new Error("The pairing server returned invalid JSON.");
    }
  }

  if (!response.ok) {
    const message = typeof parsed.message === "string" ? parsed.message : "";
    throw new Error(message || "The pairing server rejected the mobile login.");
  }
}
