import { createHash } from "crypto";
import { describe, expect, test } from "bun:test";

import {
  isMoodleBrowserSSOTokenUrl,
  parseMoodleBrowserSSOToken,
  type MoodleBrowserSSOLaunch,
} from "../src/moodleBrowserSSO";

describe("Moodle browser SSO callback", () => {
  const launch: MoodleBrowserSSOLaunch = {
    siteUrl: "https://moodle.fhgr.ch/",
    passport: "passport-123",
    urlScheme: "moodle-client",
  };

  test("accepts a signed Moodle mobile token callback", () => {
    const callbackUrl = createCallbackUrl(launch, "mobile-token", "private-token");

    expect(isMoodleBrowserSSOTokenUrl(callbackUrl)).toBe(true);
    expect(parseMoodleBrowserSSOToken(callbackUrl, launch)).toEqual({
      siteUrl: "https://moodle.fhgr.ch",
      token: "mobile-token",
      privateToken: "private-token",
    });
  });

  test("accepts Moodle's legacy moodlemobile callback scheme", () => {
    const callbackUrl = createCallbackUrl(launch, "mobile-token").replace(
      "moodle-client://",
      "moodlemobile://",
    );

    expect(parseMoodleBrowserSSOToken(callbackUrl, launch).token).toBe("mobile-token");
  });

  test("rejects callbacks that were not signed for this launch", () => {
    const callbackUrl = createCallbackUrl(
      { ...launch, passport: "different-passport" },
      "mobile-token",
    );

    expect(() => parseMoodleBrowserSSOToken(callbackUrl, launch)).toThrow(
      "signature did not match",
    );
  });

  test("rejects callbacks for a different app scheme", () => {
    const callbackUrl = createCallbackUrl(launch, "mobile-token").replace(
      "moodle-client://",
      "other-app://",
    );

    expect(() => parseMoodleBrowserSSOToken(callbackUrl, launch)).toThrow(
      "unexpected URL scheme",
    );
  });
});

function createCallbackUrl(
  launch: MoodleBrowserSSOLaunch,
  token: string,
  privateToken = "",
): string {
  const normalizedSiteUrl = launch.siteUrl.replace(/\/+$/, "");
  const signature = createHash("md5")
    .update(`${normalizedSiteUrl}${launch.passport}`, "ascii")
    .digest("hex");
  const payload = [signature, token, privateToken].join(":::");
  return `${launch.urlScheme}://token=${encodeURIComponent(Buffer.from(payload).toString("base64"))}`;
}
