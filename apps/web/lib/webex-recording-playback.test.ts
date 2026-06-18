import { describe, expect, test } from "bun:test";

import { isHLSStreamUrl, nativeHLSMimeTypes } from "@/lib/webex-recording-playback";

describe("Webex recording playback helpers", () => {
  test("detects HLS playlist URLs with query strings", () => {
    expect(isHLSStreamUrl("https://fhgr.webex.com/video/recording.m3u8?token=redacted")).toBe(true);
  });

  test("does not treat direct mp4 recordings as HLS", () => {
    expect(isHLSStreamUrl("https://fhgr.webex.com/video/recording.mp4?token=redacted")).toBe(false);
  });

  test("checks the native HLS MIME types browsers advertise", () => {
    expect(nativeHLSMimeTypes()).toContain("application/vnd.apple.mpegurl");
    expect(nativeHLSMimeTypes()).toContain("application/x-mpegURL");
  });
});
