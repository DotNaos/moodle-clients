import {
  getMoodleInternalSecret,
  MOODLE_SERVICES_URL,
  readServiceJSON,
} from "@/lib/moodle-services";

export type CodexStateKind =
  | "codex-auth"
  | "codex-session"
  | "codex-memory"
  | "codex-artifacts";

type CodexStateSnapshotResponse = {
  snapshot?: {
    id?: string;
    kind?: string;
    createdAt?: string;
  };
  zipBase64?: string;
  error?: string;
};

const CODEX_STATE_PATH = "/api/auth/clerk/codex/state";

export async function getCodexStateSnapshot(
  clerkUserId: string,
  kind: CodexStateKind,
): Promise<CodexStateSnapshotResponse | null> {
  const upstreamUrl = new URL(`${MOODLE_SERVICES_URL}${CODEX_STATE_PATH}`);
  upstreamUrl.searchParams.set("kind", kind);

  const response = await fetch(upstreamUrl, {
    method: "GET",
    cache: "no-store",
    headers: codexStateHeaders(clerkUserId),
  });
  const payload = await readServiceJSON<CodexStateSnapshotResponse>(response);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load Codex auth state.");
  }

  return payload;
}

export async function saveCodexStateSnapshot(
  clerkUserId: string,
  input: {
    kind: CodexStateKind;
    zipBase64: string;
    metadata?: Record<string, unknown>;
  },
): Promise<CodexStateSnapshotResponse> {
  const response = await fetch(`${MOODLE_SERVICES_URL}${CODEX_STATE_PATH}`, {
    method: "POST",
    cache: "no-store",
    headers: codexStateHeaders(clerkUserId),
    body: JSON.stringify(input),
  });
  const payload = await readServiceJSON<CodexStateSnapshotResponse>(response);

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not save Codex auth state.");
  }

  return payload;
}

function codexStateHeaders(clerkUserId: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Clerk-User-Id": clerkUserId,
    "X-Moodle-Internal-Secret": getMoodleInternalSecret(),
  };
}
