"use client";

import katex from "katex";

type MarkdownRendererProps = {
  className?: string;
  text: string;
};

export function MarkdownRenderer({ className, text }: MarkdownRendererProps) {
  return (
    <div className={className}>
      {renderMarkdownBlocks(splitMarkdownBlocks(text)).map((block, index) => (
        <div key={index} dangerouslySetInnerHTML={{ __html: block }} />
      ))}
    </div>
  );
}

function splitMarkdownBlocks(text: string): string[] {
  return text.trim().split(/\n{2,}/).filter(Boolean);
}

function renderMarkdownBlocks(blocks: string[]): string[] {
  return blocks.map(renderMarkdownBlock);
}

function renderMarkdownBlock(block: string): string {
  if (block.startsWith("```")) {
    const language = block.match(/^```([a-zA-Z0-9_-]+)/)?.[1];
    const code = block.replace(/^```[a-zA-Z0-9_-]*\n?/i, "").replace(/```$/, "");
    return `<pre class="overflow-auto rounded-2xl bg-secondary p-3 font-mono text-xs leading-5 text-foreground"><code>${language ? `<span class="mb-2 block text-[0.7rem] uppercase text-muted-foreground">${escapeHtml(language)}</span>` : ""}${escapeHtml(code)}</code></pre>`;
  }
  const heading = block.match(/^(#{1,4})\s+(.+)$/);
  if (heading) {
    const level = Math.min(4, heading[1].length + 2);
    const sizeClass = level <= 3 ? "text-base" : "text-sm";
    return `<h${level} class="${sizeClass} mt-4 font-semibold tracking-tight text-foreground">${inlineMarkdown(heading[2])}</h${level}>`;
  }
  if (/^>\s+/m.test(block)) {
    const quote = block.split("\n").map((line) => line.replace(/^>\s?/, "")).join("\n");
    return `<blockquote class="border-l-2 border-border pl-3 text-muted-foreground">${inlineMarkdown(quote).replace(/\n/g, "<br />")}</blockquote>`;
  }
  if (/^[-*]\s+/m.test(block)) {
    const items = block.split("\n").filter(Boolean).map((line) => line.replace(/^[-*]\s+/, ""));
    return `<ul class="ml-5 list-disc space-y-1">${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`;
  }
  if (/^\d+\.\s+/m.test(block)) {
    const items = block.split("\n").filter(Boolean).map((line) => line.replace(/^\d+\.\s+/, ""));
    return `<ol class="ml-5 list-decimal space-y-1">${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ol>`;
  }
  return `<p>${inlineMarkdown(block).replace(/\n/g, "<br />")}</p>`;
}

function inlineMarkdown(text: string): string {
  return renderMath(escapeHtml(text))
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a class="font-medium underline underline-offset-2" href="$2" rel="noreferrer" target="_blank">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em]">$1</code>');
}

function renderMath(value: string): string {
  return value
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: true, throwOnError: false }))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: true, throwOnError: false }))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: false, throwOnError: false }));
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
  return value.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ({
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
  })[entity] ?? entity);
}
