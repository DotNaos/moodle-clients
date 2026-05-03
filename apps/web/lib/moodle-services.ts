export const MOODLE_SERVICES_URL =
  process.env.MOODLE_SERVICES_URL ?? "https://moodle-services.os-home.net";

export function getMoodleInternalSecret(): string {
  const internalSecret = process.env.MOODLE_WEB_INTERNAL_SECRET;
  if (!internalSecret) {
    throw new Error("Moodle web connection secret is not configured.");
  }
  return internalSecret;
}

export async function readServiceJSON<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}
