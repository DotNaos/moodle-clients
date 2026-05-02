import type { MoodleConnection } from "./moodle";

const MOBILE_PAIR_QR_SCHEME = "moodlereadonlyproxy://pair";
const MOBILE_BRIDGE_QR_SCHEME = "moodleauth://bridge";
const DEFAULT_BRIDGE_COMPLETE_PATH = "/api/mobile/bridge/complete";
const LEGACY_PAIR_COMPLETE_PATH = "/api/mobile/pair/complete";

export type MobilePairTarget = {
  challenge: string;
  endpoint: string;
  origin: string;
  appName?: string;
  state?: string;
  legacyPairId?: string;
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

  const kind = getPairingKind(parsed);
  if (!kind) {
    throw new Error("This QR code is not a Moodle pairing QR.");
  }

  const challenge = firstSearchParam(parsed, ["challenge", "pairId", "code"]);
  const state = firstSearchParam(parsed, ["state"]);
  const appName = firstSearchParam(parsed, ["app", "appName", "client_name"]);
  const originValue = firstSearchParam(parsed, ["origin", "server"]);
  const endpointValue = firstSearchParam(parsed, ["endpoint", "callback", "complete"]);

  if (!challenge) {
    throw new Error("Pairing QR is incomplete.");
  }

  const originUrl = parseOrigin(originValue, parsed);
  const endpointUrl = parseEndpoint(
    endpointValue,
    originUrl,
    kind === "legacy" ? LEGACY_PAIR_COMPLETE_PATH : DEFAULT_BRIDGE_COMPLETE_PATH,
  );
  assertSafeEndpoint(endpointUrl);

  const legacyPairId = kind === "legacy" ? challenge : undefined;

  return {
    challenge,
    endpoint: endpointUrl.toString(),
    origin: originUrl.origin,
    ...(appName ? { appName } : {}),
    ...(state ? { state } : {}),
    ...(legacyPairId ? { legacyPairId } : {}),
  };
}

export async function completeMobilePairing(
  target: MobilePairTarget,
  connection: MoodleConnection,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(target.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        challenge: target.challenge,
        pairId: target.legacyPairId ?? target.challenge,
        state: target.state,
        origin: target.origin,
        moodleSiteUrl: connection.moodleSiteUrl,
        moodleUserId: connection.moodleUserId,
        moodleMobileToken: connection.moodleMobileToken,
        source: "moodle-clients-mobile",
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

function getPairingKind(parsed: URL): "bridge" | "legacy" | null {
  const normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  if (normalized === MOBILE_BRIDGE_QR_SCHEME) {
    return "bridge";
  }
  if (normalized === MOBILE_PAIR_QR_SCHEME) {
    return "legacy";
  }
  if (
    (parsed.protocol === "https:" || isLocalHttp(parsed)) &&
    parsed.pathname.replace(/\/+$/, "") === "/mobile-bridge"
  ) {
    return "bridge";
  }
  return null;
}

function firstSearchParam(parsed: URL, names: string[]): string {
  for (const name of names) {
    const value = parsed.searchParams.get(name)?.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function parseOrigin(value: string, fallback: URL): URL {
  const rawOrigin = value || fallback.origin;
  let originUrl: URL;
  try {
    originUrl = new URL(rawOrigin);
  } catch {
    throw new Error("Pairing QR contains an invalid origin.");
  }
  if (originUrl.protocol !== "https:" && !isLocalHttp(originUrl)) {
    throw new Error("Pairing QR origin must use HTTPS.");
  }
  return new URL(originUrl.origin);
}

function parseEndpoint(value: string, originUrl: URL, fallbackPath: string): URL {
  try {
    return value ? new URL(value, originUrl) : new URL(fallbackPath, originUrl);
  } catch {
    throw new Error("Pairing QR contains an invalid endpoint.");
  }
}

function assertSafeEndpoint(endpointUrl: URL): void {
  if (endpointUrl.protocol === "https:" || isLocalHttp(endpointUrl)) {
    return;
  }
  throw new Error("Pairing endpoint must use HTTPS.");
}

function isLocalHttp(url: URL): boolean {
  if (url.protocol !== "http:") {
    return false;
  }
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]" ||
    url.hostname === "::1"
  );
}
