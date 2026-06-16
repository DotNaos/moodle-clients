import { describe, expect, test } from "bun:test";

import { renderMarkdownTextToHtml } from "@/components/markdown-renderer";

describe("MarkdownRenderer", () => {
  test("renders headings even when they are adjacent to body text", () => {
    const html = renderMarkdownTextToHtml("## Mein kurzer Tipp\nImmer zuerst den Teil lesen.").join("");

    expect(html).toContain("<h4");
    expect(html).toContain("Mein kurzer Tipp");
    expect(html).toContain("<p>Immer zuerst den Teil lesen.</p>");
    expect(html).not.toContain("## Mein kurzer Tipp");
  });

  test("strips redundant nested dash markers from ordered list items", () => {
    const html = renderMarkdownTextToHtml(
      ["1. - **Einführung:**", "2. - _Teil 01_", "3. - ## Grundlagen"].join("\n"),
    ).join("");

    expect(html).toContain('<ol class="ml-5 list-decimal space-y-1">');
    expect(html).toContain("<li><strong>Einführung:</strong></li>");
    expect(html).toContain("<li><em>Teil 01</em></li>");
    expect(html).toContain("<li>Grundlagen</li>");
    expect(html).not.toContain("<li>-");
    expect(html).not.toContain("## Grundlagen");
  });

  test("promotes bullet-prefixed headings into real headings", () => {
    const html = renderMarkdownTextToHtml("- ## Mein kurzer Tipp\n- Fang mit den älteren Teilen an.").join("");

    expect(html).toContain("<h4");
    expect(html).toContain("Mein kurzer Tipp");
    expect(html).toContain("<ul");
    expect(html).toContain("<li>Fang mit den älteren Teilen an.</li>");
    expect(html).not.toContain("<li>## Mein kurzer Tipp</li>");
  });

  test("renders unindented numbered outline headings without repeated ordered list markers", () => {
    const html = renderMarkdownTextToHtml(
      [
        "**Empfohlener Start**",
        "1. **Überblick holen**",
        "- Einführung in Deep Learning",
        "- Einführungsfolien",
        "1. **Grundlagen aufbauen**",
        "- Tensors",
      ].join("\n"),
    ).join("");

    expect(html).toContain('<p class="mt-3 font-semibold text-foreground"><strong>Überblick holen</strong></p>');
    expect(html).toContain('<p class="mt-3 font-semibold text-foreground"><strong>Grundlagen aufbauen</strong></p>');
    expect(html).toContain("<ul");
    expect(html).not.toContain("<ol");
  });

  test("renders Moodle material citations as internal dashboard links", () => {
    const html = renderMarkdownTextToHtml(
      "Siehe [Aufgabenblatt 01](moodle-resource:22584:mod_resource_123).",
    ).join("");

    expect(html).toContain('href="/courses/22584/materials/mod_resource_123"');
    expect(html).toContain("Aufgabenblatt 01");
    expect(html).not.toContain("moodle-resource:");
  });
});
