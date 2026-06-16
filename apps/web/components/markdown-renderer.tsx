"use client";

import katex from "katex";

type MarkdownRendererProps = {
  className?: string;
  text: string;
};

export function MarkdownRenderer({ className, text }: MarkdownRendererProps) {
  return (
    <div className={className}>
      {renderMarkdownTextToHtml(text).map((block, index) => (
        <div key={index} dangerouslySetInnerHTML={{ __html: block }} />
      ))}
    </div>
  );
}

export function renderMarkdownTextToHtml(text: string): string[] {
  return splitMarkdownBlocks(text).flatMap(renderMarkdownBlock);
}

function splitMarkdownBlocks(text: string): string[] {
  return text.trim().split(/\n{2,}/).filter(Boolean);
}

function renderMarkdownBlock(block: string): string[] {
  if (block.startsWith("```")) {
    const code = block.replace(/^```[a-zA-Z0-9_-]*\n?/i, "").replace(/```$/, "");
    return [`<pre class="overflow-auto rounded-2xl bg-secondary p-3 font-mono text-xs leading-5 text-foreground"><code>${escapeHtml(code)}</code></pre>`];
  }
  const image = block.match(/^!\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
  if (image) {
    return [`<figure class="overflow-hidden rounded-2xl bg-secondary"><img class="max-h-72 w-full object-contain" src="${escapeAttribute(image[2])}" alt="${escapeAttribute(image[1])}" /></figure>`];
  }
  if (/^<figure\b/i.test(block) && /<img\b/i.test(block)) {
    const src = htmlAttribute(block, "src");
    if (src) {
      const alt = htmlAttribute(block, "alt") ?? "";
      return [`<figure class="overflow-hidden rounded-2xl bg-secondary"><img class="max-h-72 w-full object-contain" src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" /></figure>`];
    }
  }
  if (/^>\s+/m.test(block)) {
    const quote = block.split("\n").map((line) => line.replace(/^>\s?/, "")).join("\n");
    return [`<blockquote class="border-l-2 border-border pl-3 text-muted-foreground">${inlineMarkdown(quote).replace(/\n/g, "<br />")}</blockquote>`];
  }

  return renderLineMarkdown(block);
}

function renderLineMarkdown(block: string): string[] {
  const lines = block
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      html.push(renderHeading(heading[1], heading[2]));
      index += 1;
      continue;
    }

    const bulletHeading = line.match(/^[-*]\s+(#{1,4})\s+(.+)$/);
    if (bulletHeading) {
      html.push(renderHeading(bulletHeading[1], bulletHeading[2]));
      index += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^\d+\.\s+(.+)$/);
        if (!item) {
          break;
        }
        items.push(normalizeListItemText(item[1]));
        index += 1;
      }
      html.push(renderList("ol", items));
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^[-*]\s+(.+)$/);
        if (!item || /^#{1,4}\s+/.test(item[1].trim())) {
          break;
        }
        items.push(normalizeListItemText(item[1]));
        index += 1;
      }
      if (items.length > 0) {
        html.push(renderList("ul", items));
        continue;
      }
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (/^(#{1,4})\s+/.test(current) || /^[-*]\s+(#{1,4})\s+/.test(current) || /^\d+\.\s+/.test(current) || /^[-*]\s+/.test(current)) {
        break;
      }
      paragraphLines.push(lines[index]);
      index += 1;
    }
    if (paragraphLines.length > 0) {
      html.push(`<p>${inlineMarkdown(paragraphLines.join("\n")).replace(/\n/g, "<br />")}</p>`);
      continue;
    }

    html.push(`<p>${inlineMarkdown(line)}</p>`);
    index += 1;
  }

  return html;
}

function renderHeading(marker: string, text: string): string {
  const level = Math.min(4, marker.length + 2);
  const sizeClass = level <= 3 ? "text-base" : "text-sm";
  return `<h${level} class="${sizeClass} mt-4 font-semibold tracking-tight text-foreground">${inlineMarkdown(text)}</h${level}>`;
}

function renderList(kind: "ol" | "ul", items: string[]): string {
  const listClass = kind === "ol" ? "ml-5 list-decimal space-y-1" : "ml-5 list-disc space-y-1";
  return `<${kind} class="${listClass}">${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${kind}>`;
}

function normalizeListItemText(text: string): string {
  return text.trim().replace(/^[-*]\s+/, "").replace(/^#{1,4}\s+/, "");
}

function inlineMarkdown(text: string): string {
  return renderMath(escapeHtml(text))
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a class="font-medium underline underline-offset-2" href="$2" rel="noreferrer" target="_blank">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em]">$1</code>');
}

function renderMath(value: string): string {
  return value
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: true, throwOnError: false }))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: true, throwOnError: false }))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: false, throwOnError: false }))
    // Single-dollar inline math: opening "$" not followed by space, closing "$" not preceded by space and not a price like "$5".
    .replace(/(?<![\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: false, throwOnError: false }));
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

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function htmlAttribute(html: string, name: string): string | null {
  const match = html.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match?.[1] ?? null;
}

function unescapeHtml(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ({
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
  })[entity] ?? entity);
}
