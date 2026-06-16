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
    expect(payload.prompt).toContain("Reply with the normal user-facing Markdown answer first.");
    expect(payload.prompt).toContain("<moodle-actions>");
    expect(payload.prompt).toContain("The chat UI hides the moodle-actions block");
    expect(payload.prompt).not.toContain("The host will convert your structured response");
  });

  test("allows fenced json-render only for Moodle chat and task-study runs", () => {
    const chatPayload = buildCodexRunServicePayload({
      prompt: "Mach mir eine Lernhilfe",
      images: [],
      attachmentImages: [],
      messages: [],
      moodleContext: { source: "moodle-web" },
    }, true);
    const formulaPayload = buildCodexRunServicePayload({
      prompt: "Formeln extrahieren",
      images: [],
      attachmentImages: [],
      messages: [],
      moodleContext: { source: "formula-collection" },
    }, false);

    expect(chatPayload.prompt).toContain("```json-render");
    expect(chatPayload.prompt).toContain("except for the optional fenced");
    expect(chatPayload.prompt).toContain("If the user asks to be quizzed");
    expect(chatPayload.prompt).toContain("Quiz");
    expect(formulaPayload.prompt).not.toContain("```json-render");
  });
});
