import katex from "katex";

export const FORMULA_PRINT_STYLES = `
  @page {
    size: A4;
    margin: 12mm;
  }

  :root {
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #18181b;
    background: #ffffff;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: #ffffff;
  }

  .formula-page {
    width: 100%;
    max-width: 180mm;
    margin: 0 auto;
  }

  .formula-title {
    margin: 0;
    font-size: 24pt;
    line-height: 1.12;
    font-weight: 750;
    letter-spacing: 0;
  }

  .formula-subtitle {
    margin: 4mm 0 8mm;
    color: #71717a;
    font-size: 10pt;
  }

  .formula-body {
    font-size: 10pt;
    line-height: 1.34;
  }

  .formula-body h1,
  .formula-body h2,
  .formula-body h3 {
    break-after: avoid;
    page-break-after: avoid;
    margin: 5mm 0 1.7mm;
    line-height: 1.18;
    letter-spacing: 0;
  }

  .formula-body h1 {
    font-size: 16pt;
  }

  .formula-body h2 {
    font-size: 13pt;
  }

  .formula-body h3 {
    font-size: 11pt;
  }

  .formula-body p,
  .formula-body ul,
  .formula-body ol {
    margin: 0 0 2mm;
  }

  .formula-body ul,
  .formula-body ol {
    padding-left: 6mm;
  }

  .formula-body li {
    margin: 0 0 1.1mm;
  }

  .formula-body code {
    border-radius: 3px;
    background: #f4f4f5;
    padding: 0.2em 0.35em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.88em;
  }

  .formula-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 4mm 0;
    font-size: 9pt;
  }

  .formula-body th,
  .formula-body td {
    border-bottom: 1px solid #e4e4e7;
    padding: 1.5mm 2mm;
    text-align: left;
    vertical-align: top;
  }

  .formula-body .katex-display {
    margin: 1.8mm 0;
    overflow: visible;
  }
`;

export function renderFormulaMarkdownHTML(markdown: string): string {
  const normalized = stripOuterMarkdownFence(markdown.trim());
  if (!normalized) {
    return "";
  }
  return renderFormulaLines(normalized.split(/\r?\n/));
}

export function renderFormulaDocumentHTML({
  markdown,
  subtitle,
  title,
}: {
  markdown: string;
  subtitle: string;
  title: string;
}): string {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css" />
  <style>${FORMULA_PRINT_STYLES}</style>
</head>
<body>
  <main class="formula-page">
    <h1 class="formula-title">${escapeHtml(title)}</h1>
    <p class="formula-subtitle">${escapeHtml(subtitle)}</p>
    <article class="formula-body">${renderFormulaMarkdownHTML(markdown)}</article>
  </main>
</body>
</html>`;
}

function renderFormulaLines(lines: string[]): string {
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: { items: string[]; type: "ol" | "ul" } | null = null;

  function flushParagraph() {
    if (paragraph.length === 0) {
      return;
    }
    html.push(`<p>${inlineFormulaMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!list) {
      return;
    }
    html.push(`<${list.type}>${list.items.map((item) => `<li>${inlineFormulaMarkdown(item)}</li>`).join("")}</${list.type}>`);
    list = null;
  }

  function flushAll() {
    flushParagraph();
    flushList();
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      flushAll();
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushAll();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineFormulaMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (isPlainFormulaHeading(trimmed)) {
      flushAll();
      html.push(`<h2>${inlineFormulaMarkdown(trimmed.replace(/:$/, ""))}</h2>`);
      continue;
    }

    if (isTableStart(lines, index)) {
      flushAll();
      const tableRows: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        tableRows.push(lines[index] ?? "");
        index += 1;
      }
      index -= 1;
      html.push(renderTable(tableRows.join("\n")));
      continue;
    }

    const unorderedItem = trimmed.match(/^[-*]\s+(.+)$/);
    if (unorderedItem) {
      flushParagraph();
      if (list?.type !== "ul") {
        flushList();
        list = { items: [], type: "ul" };
      }
      list.items.push(unorderedItem[1]);
      continue;
    }

    const orderedItem = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (orderedItem) {
      flushParagraph();
      if (list?.type !== "ol") {
        flushList();
        list = { items: [], type: "ol" };
      }
      list.items.push(orderedItem[1]);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushAll();
  return html.join("\n");
}

function renderTable(block: string): string {
  const rows = block.split("\n").filter((row) => row.trim().startsWith("|"));
  const normalizedRows = rows.filter((row) => !/^\|\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(row.trim()));
  const [head, ...body] = normalizedRows.map((row) =>
    row.replace(/^\||\|$/g, "").split("|").map((cell) => inlineFormulaMarkdown(cell.trim())),
  );
  if (!head) {
    return "";
  }
  return [
    "<table>",
    `<thead><tr>${head.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead>`,
    `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>`,
    "</table>",
  ].join("");
}

function isTableStart(lines: string[], index: number): boolean {
  const first = lines[index]?.trim() ?? "";
  const second = lines[index + 1]?.trim() ?? "";
  return first.startsWith("|") && second.includes("---");
}

function isPlainFormulaHeading(value: string): boolean {
  return /^(?:vorgaben(?: und annahmen)?|annahmen zu den vorgaben|pdf-?zuordnung|formeln?|definitionen|prüfungs?vorgaben|exam(?:ination)? rules|formula sheet rules|parallelisierung|cache|mpi|netzwerk|topolog(?:ie|ies)|speicher|matri(?:x|zen)|sorting):?$/i.test(value);
}

function inlineFormulaMarkdown(text: string): string {
  const escaped = escapeHtml(text);
  return renderFormulaMath(escaped)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "<a href=\"$2\" rel=\"noreferrer\" target=\"_blank\">$1</a>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderFormulaMath(value: string): string {
  return value
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: true, throwOnError: false }))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: true, throwOnError: false }))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: false, throwOnError: false }))
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (match: string, prefix: string, expression: string) => {
      if (!/[=\\_^{}+\-*/<>∑√α-ωΑ-Ω]/.test(unescapeHtml(expression))) {
        return match;
      }
      return `${prefix}${katex.renderToString(unescapeHtml(expression), { displayMode: false, throwOnError: false })}`;
    });
}

function stripOuterMarkdownFence(value: string): string {
  const match = value.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1].trim() : value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
