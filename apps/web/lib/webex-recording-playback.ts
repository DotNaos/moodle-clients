export function isHLSStreamUrl(value: string): boolean {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value, "https://moodle.local");
    return parsed.pathname.toLowerCase().endsWith(".m3u8");
  } catch {
    return /\.m3u8(?:[?#]|$)/i.test(value);
  }
}

export function nativeHLSMimeTypes(): string[] {
  return [
    "application/vnd.apple.mpegurl",
    "application/x-mpegURL",
  ];
}
