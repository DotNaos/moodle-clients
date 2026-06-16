import { describe, expect, test } from "bun:test";

import { buildCodexRunServicePayload } from "@/lib/codex-run-request";

describe("buildCodexRunServicePayload", () => {
  test("keeps schema for non-streaming structured runs", () => {
    const payload = buildCodexRunServicePayload({
      prompt: "Kurz zusammenfassen",
      images: [],
      attachmentImages: [],
      messages: [],
      moodleContext: null,
    }, false);

    expect(payload.stream).toBe(false);
    expect(payload.outputSchema).toBeDefined();
    expect(payload.prompt).toContain("Return a concise answer plus optional UI actions.");
  });

  test("uses plain text and no schema for streaming chat runs", () => {
    const payload = buildCodexRunServicePayload({
      prompt: "Erklaere das in fuenf Saetzen",
      images: [],
      attachmentImages: [],
      messages: [],
      moodleContext: null,
    }, true);

    expect(payload.stream).toBe(true);
    expect(payload.outputSchema).toBe(undefined);
    expect(payload.prompt).toContain("Reply in plain Markdown text only.");
    expect(payload.prompt).toContain("<moodle-actions>");
    expect(payload.prompt).toContain("The chat UI hides the moodle-actions block");
    expect(payload.prompt).not.toContain("The host will convert your structured response");
  });
});
