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
});
