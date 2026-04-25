const REDACTED = "[redacted]";
const SENSITIVE_PATTERN = /\b(qrlogin|privatetoken|wstoken|token)=([^&\s"]+)/gi;
const MOBILE_LINK_PATTERN = /moodlemobile:\/\/\S+/gi;

export function logDevError(scope: string, error: unknown, details: Record<string, unknown> = {}) {
  if (!isDevBuild()) {
    return;
  }

  const payload = sanitizeForLog({
    ...details,
    error: serializeError(error),
  });

  console.error(`[MoodleClient] ${scope}`, payload);
}

export function logDevInfo(scope: string, details: Record<string, unknown> = {}) {
  if (!isDevBuild()) {
    return;
  }

  console.info(`[MoodleClient] ${scope}`, sanitizeForLog(details));
}

export function sanitizeForLog(value: unknown): unknown {
  if (typeof value === "string") {
    return redact(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeForLog);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sanitizeForLog(entry),
      ]),
    );
  }

  return value;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
}

function redact(value: string): string {
  return value
    .replace(MOBILE_LINK_PATTERN, "moodlemobile://[redacted]")
    .replace(SENSITIVE_PATTERN, "$1=" + REDACTED);
}

function isDevBuild(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}
