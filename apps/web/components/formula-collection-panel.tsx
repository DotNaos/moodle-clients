"use client";

import { Download, FileText, Printer, RefreshCw, Sigma, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Course } from "@/lib/dashboard-data";
import { courseTitle } from "@/lib/dashboard-data";
import { renderFormulaMarkdownHTML } from "@/lib/formula-renderer";
import { cn } from "@/lib/utils";
import type { ScriptPDFMappingItem, TaskViewResponse } from "@/components/task-study-panel";

type FormulaCollectionPanelProps = {
  course: Course;
  pdfMapping: ScriptPDFMappingItem[];
  view: TaskViewResponse | null;
};

export function FormulaCollectionPanel({
  course,
  pdfMapping,
  view,
}: FormulaCollectionPanelProps) {
  const [markdown, setMarkdown] = useState("");
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState<"download" | "print" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const title = `${courseTitle(course)} Formelsammlung`;
  const subtitle = "Generated from Moodle script and course PDFs.";
  const previewHTML = useMemo(() => renderFormulaMarkdownHTML(markdown), [markdown]);
  const canExport = markdown.trim().length > 0 && !exporting;

  useEffect(() => {
    setMarkdown("");
    setError(null);
    setMessage(null);
  }, [course.id]);

  async function generateFormulaCollection() {
    if (!view?.scriptMarkdown.trim()) {
      setError("Erstelle oder aktualisiere zuerst das Script, damit Codex die Formelsammlung aus dem Kurs ableiten kann.");
      return;
    }
    setGenerating(true);
    setError(null);
    setMessage("Codex erstellt die Formelsammlung...");
    try {
      const response = await runCodex(buildFormulaPrompt({
        course,
        pdfMapping,
        view,
      }));
      const generatedMarkdown = response.finalResponse.trim();
      if (!generatedMarkdown) {
        throw new Error("Codex hat keinen Text für die Formelsammlung zurückgegeben.");
      }
      setMarkdown(generatedMarkdown);
      setMessage("Formelsammlung erstellt. Du kannst sie jetzt als PDF herunterladen oder zum Drucken öffnen.");
    } catch (generateError) {
      const fallbackMarkdown = buildExtractedFormulaCollection({ course, pdfMapping, view });
      setMarkdown(fallbackMarkdown);
      setError(null);
      setMessage(`${formatCodexGenerationError(generateError)} Ich habe deshalb eine Formelsammlung direkt aus dem Script erstellt.`);
    } finally {
      setGenerating(false);
    }
  }

  async function exportPDF(action: "download" | "print") {
    if (!markdown.trim()) {
      return;
    }
    setExporting(action);
    setError(null);
    try {
      const response = await fetch("/api/formula/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markdown, subtitle, title }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? `PDF export failed with ${response.status}.`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (action === "download") {
        const link = document.createElement("a");
        link.href = url;
        link.download = `${safeFilename(title)}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
      }
    } catch (exportError) {
      setError(getErrorMessage(exportError));
    } finally {
      setExporting(null);
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-visible bg-background px-4 py-6 lg:overflow-auto lg:px-10 lg:py-9">
      <div className="mx-auto max-w-[88ch]">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <Sigma aria-hidden className="size-4" />
              Formelsammlung
            </p>
            <h3 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-foreground">
              {courseTitle(course)}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Codex erstellt eine kompakte, druckbare Sammlung anhand des Scripts, der PDF-Reihenfolge und der Vorgaben aus den ersten Kursunterlagen.
            </p>
          </div>
          <Button
            className="self-start"
            disabled={generating}
            onClick={() => void generateFormulaCollection()}
            type="button"
          >
            {generating ? <Spinner aria-hidden /> : markdown ? <RefreshCw aria-hidden /> : <WandSparkles aria-hidden />}
            {markdown ? "Neu erstellen" : "Erstellen"}
          </Button>
        </header>

        {error ? <div className="mt-4 rounded-3xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
        {message ? <div className="mt-4 rounded-3xl bg-secondary px-4 py-3 text-sm text-muted-foreground">{message}</div> : null}

        <section className="mt-6 border-b border-border pb-6">
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="text-sm font-semibold text-foreground">Ausgangsmaterial</h4>
            <span className="shrink-0 text-xs text-muted-foreground">{pdfMapping.length} PDFs</span>
          </div>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {pdfMapping.length > 0 ? pdfMapping.slice(0, 8).map((item) => (
              <li key={item.resourceId} className="flex min-w-0 gap-2 text-sm leading-6">
                <span className="w-7 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{String(item.order).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.areas[0] ?? "Noch keinem Script-Bereich zugeordnet"}</span>
                </span>
              </li>
            )) : (
              <li className="text-sm text-muted-foreground">Noch keine PDF-Zuordnung im Script gefunden.</li>
            )}
          </ol>
        </section>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button disabled={!canExport} onClick={() => void exportPDF("download")} type="button" variant="secondary">
            {exporting === "download" ? <Spinner aria-hidden /> : <Download aria-hidden />}
            PDF herunterladen
          </Button>
          <Button disabled={!canExport} onClick={() => void exportPDF("print")} type="button" variant="secondary">
            {exporting === "print" ? <Spinner aria-hidden /> : <Printer aria-hidden />}
            Drucken
          </Button>
        </div>

        <article
          className={cn(
            "paper-markdown formula-body mt-7 min-h-[360px] break-words bg-card px-5 py-5 text-[0.98rem] leading-7 text-foreground sm:px-8 sm:py-7",
            markdown ? "space-y-4" : "grid place-items-center text-center",
          )}
        >
          {markdown ? (
            <div dangerouslySetInnerHTML={{ __html: previewHTML }} />
          ) : (
            <div className="max-w-md">
              <FileText className="mx-auto mb-3 text-muted-foreground" aria-hidden />
              <p className="font-medium text-foreground">Noch keine Formelsammlung erstellt</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Starte den Generator, danach erscheint hier die druckbare Vorschau.
              </p>
            </div>
          )}
        </article>
      </div>
    </main>
  );
}

function buildFormulaPrompt({
  course,
  pdfMapping,
  view,
}: {
  course: Course;
  pdfMapping: ScriptPDFMappingItem[];
  view: TaskViewResponse;
}): string {
  const resourceList = view.resources
    .map((resource, index) => `${index + 1}. ${resource.title} (${resource.kind}, id: ${resource.resourceId})`)
    .join("\n");
  const mappingList = pdfMapping
    .map((item) => `${item.order}. ${item.title}: ${item.areas.join("; ") || "no explicit script area"}`)
    .join("\n");
  const scriptExcerpt = buildFormulaSourceExcerpt(view.scriptMarkdown);

  return [
    "Create a compact printable formula collection for this Moodle course.",
    "Use the course script excerpt and ordered PDF mapping as the source of truth.",
    "First infer the allowed/required formula-sheet constraints from the first PDFs or early script sections, especially organization, examination, rules, or course-content material.",
    "If those constraints are not explicit in the provided material, include a short 'Annahmen zu den Vorgaben' section and keep it conservative.",
    "Do not invent formulas that are not supported by the course material. Prefer formulas, definitions, variables, units, and one-line usage notes.",
    "Return the formula collection as Markdown in the structured answer field. Return no UI actions.",
    "Use LaTeX for formulas with \\( ... \\) or $$ ... $$. Keep it print-friendly and dense.",
    "",
    `Course: ${courseTitle(course)}`,
    "",
    "Ordered PDFs and resources:",
    resourceList || "No resources provided.",
    "",
    "PDF to script mapping:",
    mappingList || "No explicit mapping available.",
    "",
    "Relevant course script excerpt:",
    scriptExcerpt || "No script excerpt available.",
  ].join("\n");
}

export function buildExtractedFormulaCollection({
  course,
  pdfMapping,
  view,
}: {
  course: Course;
  pdfMapping: ScriptPDFMappingItem[];
  view: TaskViewResponse;
}): string {
  const blocks = view.scriptMarkdown.trim().split(/\n{2,}/).filter(Boolean);
  const constraints = extractConstraintLines(blocks);
  const formulaSections = extractFormulaSections(blocks);
  const pdfLines = pdfMapping.map((item) => `- ${item.title}: ${item.areas.join("; ") || "kein eindeutiger Bereich"}`);

  return [
    `# ${courseTitle(course)} Formelsammlung`,
    "",
    "## Vorgaben und Annahmen",
    "",
    ...(constraints.length > 0
      ? constraints.map((line) => `- ${line}`)
      : [
          "- Keine expliziten Formelsammlungs-Vorgaben im verfügbaren Script-Auszug gefunden.",
          "- Inhalt wurde konservativ aus den im Script markierten Formeln und prüfungsnahen Begriffen extrahiert.",
        ]),
    "",
    "## PDF-Zuordnung",
    "",
    ...(pdfLines.length > 0 ? pdfLines : ["- Keine PDF-Zuordnung gefunden."]),
    "",
    ...formulaSections.flatMap((section) => [
      `## ${section.title}`,
      "",
      ...section.lines.map((line) => `- ${line}`),
      "",
    ]),
    ...(formulaSections.length > 0
      ? []
      : [
          "## Relevante Begriffe",
          "",
          "- Im Script wurden keine eindeutig extrahierbaren Formeln gefunden. Starte die Script-Aktualisierung und danach die Formelsammlung erneut.",
        ]),
  ].join("\n").trim();
}

export function buildFormulaSourceExcerpt(markdown: string): string {
  const blocks = markdown.trim().split(/\n{2,}/).filter(Boolean);
  const selected: string[] = [];
  const seen = new Set<string>();

  function append(block: string) {
    const normalized = block.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    selected.push(block.length > 1_800 ? `${block.slice(0, 1_800)}...` : block);
  }

  for (const block of blocks.slice(0, 42)) {
    append(block);
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index] ?? "";
    if (isFormulaRelevantBlock(block)) {
      const previousHeading = findNearestHeading(blocks, index);
      if (previousHeading) {
        append(previousHeading);
      }
      append(block);
    }
    if (selected.join("\n\n").length > 48_000) {
      break;
    }
  }

  return selected.join("\n\n").slice(0, 52_000);
}

function isFormulaRelevantBlock(block: string): boolean {
  const text = block.toLowerCase();
  return /(\$\$|\\\(|\\\[|=|≤|>=|<=|∑|√|π|θ|Ω)/.test(block)
    || /(formula|formel|exam|examination|prüfung|pruefung|hilfsmittel|allowed|open book|closed internet|learning outcome|course content)/i.test(block)
    || /(speedup|efficien|amdahl|gustafson|throughput|latency|bandwidth|cache|coheren|mpi|collective|barrier|broadcast|scatter|gather|reduce|allreduce|prefix|matrix|solver|sorting|complexity|load balanc|roofline|flop|parallel)/.test(text);
}

function findNearestHeading(blocks: string[], index: number): string | null {
  for (let current = index; current >= 0; current -= 1) {
    const block = blocks[current]?.trim() ?? "";
    if (/^#{1,3}\s+/.test(block)) {
      return block;
    }
  }
  return null;
}

function extractConstraintLines(blocks: string[]): string[] {
  const lines: string[] = [];
  const constraintBlockPattern = /\b(?:exam|examination|prüfung|pruefung|hilfsmittel|allowed|open book|closed internet|formelsammlung|formula sheet)\b/i;
  const constraintLinePattern = /\b(?:written exam|exam|examination|prüfung|pruefung|hilfsmittel|allowed|open book|closed internet|formelsammlung|formula sheet|minutes|internet|devices|electronic)\b/i;
  for (const block of blocks.slice(0, 54)) {
    if (!constraintBlockPattern.test(block)) {
      continue;
    }
    for (const line of splitReadableLines(block)) {
      if (isHeadingLikeLine(line)) {
        continue;
      }
      if (constraintLinePattern.test(line)) {
        appendUniqueLine(lines, line);
      }
    }
  }
  return lines.slice(0, 8);
}

function extractFormulaSections(blocks: string[]): Array<{ title: string; lines: string[] }> {
  const sections = new Map<string, string[]>();
  let currentHeading = "Grundlagen";

  for (const block of blocks) {
    const heading = block.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      currentHeading = stripLocalMarkdown(heading[1]);
      continue;
    }

    if (!isFormulaRelevantBlock(block)) {
      continue;
    }

    const sectionLines = sections.get(currentHeading) ?? [];
    for (const line of splitReadableLines(block)) {
      if (!isExtractableFormulaLine(line)) {
        continue;
      }
      appendUniqueLine(sectionLines, line);
      if (sectionLines.length >= 10) {
        break;
      }
    }
    if (sectionLines.length > 0) {
      sections.set(currentHeading, sectionLines);
    }
    if (sections.size >= 14) {
      break;
    }
  }

  return [...sections.entries()].map(([title, lines]) => ({ title, lines }));
}

function isExtractableFormulaLine(line: string): boolean {
  if (/^examples?\b/i.test(line) || isHeadingLikeLine(line)) {
    return false;
  }
  const text = line.toLowerCase();
  return /(\$\$|\\\(|\\\[|=|≤|>=|<=|∑|√|π|θ|Ω)/.test(line)
    || /(formula|formel|speedup|efficien|amdahl|gustafson|throughput|latency|bandwidth|cache|coheren|mpi|collective|barrier|broadcast|scatter|gather|reduce|allreduce|prefix|matrix|solver|sorting|complexity|load balanc|roofline|flop)/.test(text);
}

function splitReadableLines(block: string): string[] {
  return block
    .split(/\n|(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/)
    .map((line) => stripLocalMarkdown(line.replace(/^[-*]\s+/, "").trim()))
    .filter((line) => line.length > 0 && !/^source\s*:/i.test(line))
    .map((line) => line.length > 240 ? `${line.slice(0, 240)}...` : line);
}

function appendUniqueLine(lines: string[], line: string): void {
  const normalized = line.replace(/\s+/g, " ").toLowerCase();
  if (!normalized || lines.some((candidate) => candidate.replace(/\s+/g, " ").toLowerCase() === normalized)) {
    return;
  }
  lines.push(line);
}

function stripLocalMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function isHeadingLikeLine(value: string): boolean {
  return /^(?:\d+(?:\.\d+)*\.?\s+|[A-ZÄÖÜ][A-Za-zÄÖÜäöüß -]{0,80}:?$)/.test(value)
    && !/[.!?]$/.test(value);
}

async function runCodex(prompt: string): Promise<{ finalResponse: string }> {
  const response = await fetch("/api/codex/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt,
      moodleContext: { source: "formula-collection" },
      stream: false,
    }),
  });
  const payload = await response.json().catch(() => ({})) as { finalResponse?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Codex failed with ${response.status}.`);
  }
  return { finalResponse: payload.finalResponse ?? "" };
}

function safeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "formelsammlung";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatCodexGenerationError(error: unknown): string {
  const message = getErrorMessage(error);
  if (/before returning a result|failed before returning/i.test(message)) {
    return "Codex ist beim Erstellen abgebrochen.";
  }
  return message;
}
