export function preparePreviewMarkdown(rawPreview: string): { hiddenCount: number; markdown: string } {
  const lines = stripPreviewFrontmatter(rawPreview)
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n");
  const kept: string[] = [];
  let hiddenCount = 0;
  let skippingOriginalSources = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,4}\s+Original Sources$/i.test(trimmed)) {
      skippingOriginalSources = true;
      hiddenCount += 1;
      continue;
    }
    if (skippingOriginalSources) {
      hiddenCount += trimmed ? 1 : 0;
      continue;
    }
    if (isPipelineTraceLine(trimmed)) {
      hiddenCount += 1;
      continue;
    }
    kept.push(line);
  }
  const withoutDuplicateTitle = removeDuplicateLeadingTitle(kept.join("\n"));
  const markdown = normalizePreviewMarkdown(withoutDuplicateTitle)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { hiddenCount, markdown };
}

function stripPreviewFrontmatter(rawPreview: string): string {
  return rawPreview
    .replace(/^---\s*\n[\s\S]*?\n---\s*/u, "")
    .replace(/^([^\n]+)\n---\s*\n[\s\S]*?\n---\s*/u, "$1\n");
}

function isPipelineTraceLine(line: string): boolean {
  return [
    /^Source task:/i,
    /^Source script:/i,
    /^Solution status:/i,
    /^Solution page:/i,
    /^This is the versioned working copy/i,
    /^#{1,4}\s+Task Text$/i,
  ].some((pattern) => pattern.test(line));
}

function removeDuplicateLeadingTitle(markdown: string): string {
  const lines = markdown.split("\n");
  const first = lines[0]?.trim();
  const second = lines[1]?.trim();
  if (first && second) {
    const headingText = second.replace(/^#{1,6}\s+/, "").trim();
    if (headingText && first.toLowerCase() === headingText.toLowerCase()) {
      return lines.slice(1).join("\n");
    }
  }
  return markdown;
}

function normalizePreviewMarkdown(markdown: string): string {
  return markdown
    .replace(/^``([a-zA-Z0-9_-]*)\s*$/gm, "```$1")
    .replace(/^```pseud\no\n/gm, "```pseudo\n")
    .replace(/([^\n])\n?(```[a-zA-Z0-9_-]*\n)/g, "$1\n\n$2")
    .replace(/(\n```\n)([^\n])/g, "$1\n$2")
    .replace(/([^\n])(\s*#{1,4}\s+)/g, "$1\n\n$2")
    .replace(/^(#{1,4}\s+.+)\n(?!\n)/gm, "$1\n\n")
    .replace(/([^\n])(<figure\b)/g, "$1\n\n$2")
    .replace(/(<\/figure>)([^\n])/g, "$1\n\n$2")
    .replace(/```([a-zA-Z0-9_-]+)([^\n`])/g, "```$1\n$2");
}
