export function stripHtml(value: string): string {
  return value.replaceAll(/<[^>]+>/g, " ").replaceAll(/\s+/g, " ").trim();
}

export function getSafeMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "The request failed.";
}

export function getErrorDebugDetails(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return [];
  }

  const details = (error as Error & { debugDetails?: unknown }).debugDetails;
  return Array.isArray(details)
    ? details.filter((detail): detail is string => typeof detail === "string" && Boolean(detail.trim()))
    : [];
}

export function compactUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.host;
  } catch {
    return value;
  }
}

export function getInitials(value: string): string {
  const words = value
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function sanitizeCourseName(name: string): string {
  if (!name) return name;
  let clean = stripHtml(name);

  // Replace HTML entities
  clean = clean
    .replaceAll(/&amp;/g, "&")
    .replaceAll(/&quot;/g, '"')
    .replaceAll(/&#039;/g, "'")
    .replaceAll(/&lt;/g, "<")
    .replaceAll(/&gt;/g, ">");

  // Remove things like (cds-116) or (cds-1091)
  clean = clean.replace(/\s*\([^)]*\)/g, "");

  // Remove semester suffixes like FS26, HS24
  clean = clean.replace(/\s*(FS|HS)\d{2}/g, "");

  return clean.trim();
}
