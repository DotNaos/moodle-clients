import type { CourseInventoryNode, CourseInventoryTaskGroup } from "@/components/study-pipeline-preview";
import type { BlueprintNodeData, BlueprintProblem, BlueprintStepKind, PipelineRunRecord } from "@/components/course-pipeline-blueprint-model";
import type { PDFDocumentStructure } from "@/components/extracted-document-inspector";
import {
  runArtifactSummary,
  runConfig,
  runMeta,
  runPreview,
} from "@/components/course-pipeline-blueprint-run-utils";

export function materializedStepNode({
  count,
  detail,
  input,
  output,
  resource,
  status,
  stepKind,
  title,
}: {
  count?: number;
  detail: string;
  input: string;
  output: string;
  resource: CourseInventoryNode;
  status: string;
  stepKind: BlueprintStepKind;
  title: string;
}): BlueprintNodeData {
  const missing = status === "missing" || status === "pending";
  return {
    title,
    subtitle: resource.name,
    detail,
    evidence: missing ? ["Backend has not exposed this materialized artifact yet."] : [`Materialized from ${resource.name}`],
    inputs: [{ label: input, detail: resource.name }],
    outputs: [{ label: output, detail: missing ? "not stored yet" : `${count ?? "unknown"} stored` }],
    outputPreview: missing ? "No page/section artifact is stored for this resource yet." : `${output} available for ${resource.name}${count === undefined ? "" : `\nCount: ${count}`}`,
    problems: missing ? [{ label: `${title} missing`, detail: `The ${output} artifact is not available yet.`, severity: "warning" }] : undefined,
    stepKind,
    tone: missing ? "warning" : "process",
    status,
    meta: [
      { label: "Resource", value: resource.name },
      { label: "Artifact", value: output },
      { label: "Stored count", value: count === undefined ? "unknown" : String(count) },
    ],
  };
}

export function extractionNodeData({
  activeRunIds,
  document,
  resource,
  run,
}: {
  activeRunIds: Set<string>;
  document: PDFDocumentStructure | null;
  resource: CourseInventoryNode;
  run: PipelineRunRecord | null;
}): BlueprintNodeData {
  if (!run && !document) {
    return {
      title: "Extraction Variants",
      subtitle: "missing",
      detail: "OCR and extraction variants should appear here for this resource.",
      evidence: ["No extraction run record was found for this resource."],
      inputs: [{ label: "sections[]", detail: resource.name }],
      outputs: [{ label: "extracted document", state: "missing" }],
      outputPreview: "Run pdftotext, docling, or marker to create inspectable extraction output.",
      problems: [{ label: "No extraction run", detail: "There is no extraction output to compare or select.", severity: "warning" }],
      stepKind: "split",
      tone: "warning",
      status: "missing",
      meta: [{ label: "Resource", value: resource.name }],
    };
  }
  if (!run && document) {
    const problems = extractedDocumentProblems(document);
    return {
      title: "Extraction Variants",
      subtitle: `${document.engine} · document only`,
      detail: "Extracted document data exists, but no immutable run record was exposed for this resource.",
      artifacts: extractedDocumentArtifacts(document),
      evidence: [
        `Document ${document.id}`,
        `Run ${document.runId}`,
        `Pages ${document.pages.length}`,
        `Assets ${document.assets.length}`,
      ],
      inputs: [{ label: "sections[]", detail: resource.name }],
      outputs: [{ label: "extracted document", detail: document.engine, state: document.status }],
      outputPreview: extractedDocumentPreview(document),
      problems: [
        { label: "Run record missing", detail: "The extracted document is available, but /runs did not include the matching immutable run.", severity: "warning" },
        ...problems,
      ],
      stepKind: "split",
      tone: problems.length > 0 ? "warning" : "run",
      status: document.status,
      meta: [
        { label: "Resource", value: resource.name },
        { label: "Run ID", value: document.runId },
        { label: "Engine", value: document.engine },
        { label: "Pages", value: String(document.pages.length) },
        { label: "Blocks", value: String(document.pages.reduce((sum, page) => sum + page.blocks.length, 0)) },
      ],
    };
  }
  if (!run) {
    throw new Error("Unreachable extraction node state.");
  }
  const documentProblems = document ? extractedDocumentProblems(document) : [];
  return {
    title: "Extraction Variants",
    subtitle: `${run.engine} · ${run.configHash}`,
    detail: "Stores OCR/extraction output for this resource. Multiple engine variants should be comparable here.",
    artifacts: [...runArtifactSummary(run), ...(document ? extractedDocumentArtifacts(document) : [])],
    config: runConfig(run),
    evidence: [
      `Run ${run.id}`,
      `Engine ${run.engine}`,
      `${run.artifactRefs?.length ?? 0} artifact refs`,
      ...(document ? [`Extracted document ${document.id}`, `${document.pages.length} pages`, `${document.assets.length} assets`] : ["No extracted document payload loaded"]),
    ],
    inputs: [{ label: "sections[]", detail: resource.name }],
    outputs: [{ label: "extracted document", detail: run.engine, state: run.status }],
    outputPreview: document ? extractedDocumentPreview(document) : runPreview(run),
    problems: mergeProblems(runProblems(run), documentProblems),
    stepKind: "split",
    tone: run.status === "failed" ? "warning" : "run",
    status: run.status,
    active: activeRunIds.has(run.id),
    meta: runMeta(run),
  };
}

export function codexNodeData({
  activeRunIds,
  inputLabel,
  outputLabel,
  outputPreview,
  run,
  subtitle,
}: {
  activeRunIds: Set<string>;
  inputLabel: string;
  outputLabel: string;
  outputPreview?: string;
  run: PipelineRunRecord | null;
  subtitle: string;
}): BlueprintNodeData {
  if (!run) {
    return {
      title: "Codex Transform",
      subtitle,
      detail: "Transforms selected extracted content into website-ready task or script drafts.",
      evidence: ["No Codex run has been recorded for this input yet."],
      inputs: [{ label: "active input bundle", detail: inputLabel }],
      outputs: [{ label: outputLabel, state: "missing" }],
      outputPreview: outputPreview ?? "Codex has not produced a draft for this lane yet.",
      problems: [{ label: "No Codex output", detail: "There is no final draft to validate or publish.", severity: "warning" }],
      stepKind: "transform",
      tone: "warning",
      status: "missing",
      meta: [{ label: "Input", value: inputLabel }],
    };
  }
  return {
    title: "Codex Transform",
    subtitle: `${run.engine} · ${run.configHash}`,
    detail: "Creates user-facing content from the selected input bundle. Removals, rewrites, and generated content must stay traceable.",
    artifacts: runArtifactSummary(run),
    config: runConfig(run),
    evidence: [`Run ${run.id}`, `Engine ${run.engine}`, `${run.artifactRefs?.length ?? 0} artifact refs`],
    inputs: [{ label: "active input bundle", detail: inputLabel }],
    outputs: [{ label: outputLabel, state: run.status }],
    outputPreview: outputPreview ?? runPreview(run),
    problems: runProblems(run),
    stepKind: "transform",
    tone: run.status === "failed" ? "warning" : "run",
    status: run.status,
    active: activeRunIds.has(run.id),
    meta: runMeta(run),
  };
}

export function finalOutputNodeData({
  sourceLabel,
  status,
  title,
  type,
  upstreamProblems,
}: {
  sourceLabel: string;
  status: string;
  title: string;
  type: "task" | "script";
  upstreamProblems: BlueprintProblem[];
}): BlueprintNodeData {
  const ready = status === "ok" || status === "succeeded";
  const problems = [
    ...upstreamProblems,
    ...(ready ? [] : [{ label: "Output not ready", detail: "The upstream Codex transform has not produced a validated website-ready output.", severity: "warning" as const }]),
  ];
  return {
    title,
    subtitle: type === "task" ? "website task output" : "website script output",
    detail: "Final output is only valid when it renders like website content and remains source-linked.",
    evidence: [`Source lane: ${sourceLabel}`, "Output must validate images, LaTeX, encoding, and source mapping."],
    inputs: [{ label: type === "task" ? "task draft" : "script draft", detail: sourceLabel }],
    outputs: [{ label: type === "task" ? "published task" : "published script section", state: ready ? "ready" : "needs_review" }],
    outputPreview: ready
      ? `${title} is ready to render in the course UI.`
      : `${title} is not ready. Inspect upstream nodes before trusting the website output.`,
    problems: problems.length > 0 ? problems : undefined,
    stepKind: "transform",
    tone: ready ? "output" : "warning",
    status: ready ? "ready" : "needs_review",
    meta: [
      { label: "Output type", value: type },
      { label: "Validation", value: ready ? "ready" : "needs review" },
    ],
  };
}

export function missingSolutionNode(group: CourseInventoryTaskGroup): BlueprintNodeData {
  return {
    title: "Solution PDF",
    subtitle: "missing",
    detail: "This task group has no paired solution input.",
    evidence: [group.pairingReason || "No matching solution PDF was found."],
    inputs: [{ label: "task group", detail: group.title }],
    outputs: [{ label: "solution pdf", state: "missing" }],
    outputPreview: "No solution file is available for this group.",
    problems: [{ label: "Solution missing", detail: "The collect step will continue with a missing solution input.", severity: "warning" }],
    stepKind: "transform",
    tone: "warning",
    status: group.pairingStatus,
    meta: [{ label: "Task group", value: group.title }],
  };
}

export function collectProblems(
  group: CourseInventoryTaskGroup,
  sheetRun: PipelineRunRecord | null,
  solutionRun: PipelineRunRecord | null,
): BlueprintProblem[] {
  const problems: BlueprintProblem[] = [];
  if (!sheetRun) {
    problems.push({ label: "Sheet extraction missing", detail: "The assignment sheet has no extraction output.", severity: "warning" });
  }
  if (!group.solution) {
    problems.push({ label: "Solution missing", detail: "No solution PDF was paired with this assignment sheet.", severity: "warning" });
  } else if (!solutionRun) {
    problems.push({ label: "Solution extraction missing", detail: "The solution PDF exists, but no extraction output is stored.", severity: "warning" });
  }
  return problems;
}

function runProblems(run: PipelineRunRecord): BlueprintProblem[] | undefined {
  const problems: BlueprintProblem[] = [];
  if (run.status === "failed") {
    problems.push({ label: "Run failed", detail: run.error || "The run failed without a stored error.", severity: "error" });
  }
  if ((run.artifactRefs?.length ?? 0) === 0) {
    problems.push({ label: "No artifacts", detail: "The run did not store any artifact references.", severity: "warning" });
  }
  return problems.length > 0 ? problems : undefined;
}

export function extractedDocumentProblems(document: PDFDocumentStructure): BlueprintProblem[] {
  const problems: BlueprintProblem[] = [];
  if (document.status === "failed") {
    problems.push({ label: "Extraction failed", detail: "The extracted document is marked as failed.", severity: "error" });
  }
  if (document.pages.length === 0) {
    problems.push({ label: "No pages", detail: "The extracted document contains no pages.", severity: "warning" });
  }
  if (document.pages.some((page) => page.blocks.length === 0)) {
    problems.push({ label: "Empty page structure", detail: "At least one extracted page has no detected blocks.", severity: "warning" });
  }
  if ((document.diagnostics.pagesMissingText?.length ?? 0) > 0) {
    problems.push({ label: "Pages missing text", detail: `Pages: ${document.diagnostics.pagesMissingText?.join(", ")}`, severity: "warning" });
  }
  if ((document.diagnostics.visualOnlyPages?.length ?? 0) > 0) {
    problems.push({ label: "Visual-only pages", detail: `Pages: ${document.diagnostics.visualOnlyPages?.join(", ")}`, severity: "warning" });
  }
  if ((document.diagnostics.unusedImageAssets?.length ?? 0) > 0) {
    problems.push({ label: "Unused images", detail: `${document.diagnostics.unusedImageAssets?.length} extracted image asset(s) are not referenced.`, severity: "warning" });
  }
  if ((document.diagnostics.unknownBlocks?.length ?? 0) > 0) {
    problems.push({ label: "Unknown blocks", detail: `${document.diagnostics.unknownBlocks?.length} block(s) need review.`, severity: "warning" });
  }
  for (const warning of document.diagnostics.warnings ?? []) {
    problems.push({ label: "Extraction warning", detail: warning, severity: "warning" });
  }
  return problems;
}

function extractedDocumentPreview(document: PDFDocumentStructure): string {
  const blocks = document.pages.flatMap((page) => page.blocks);
  const text = blocks
    .map((block) => block.markdown || block.text || (block.assetId ? `[${block.type}: ${block.assetId}]` : ""))
    .filter(Boolean)
    .slice(0, 8)
    .join("\n\n");
  return text || `${document.resource.name}\n${document.pages.length} page(s), ${blocks.length} block(s), ${document.assets.length} asset(s).`;
}

function extractedDocumentArtifacts(document: PDFDocumentStructure): string[] {
  return [
    `document:${document.id} · run ${document.runId}`,
    ...document.assets.slice(0, 8).map((asset) => `${asset.id}: ${asset.kind}${asset.pageNumber ? ` · page ${asset.pageNumber}` : ""} · ${asset.path}`),
  ];
}

function mergeProblems(...groups: Array<BlueprintProblem[] | undefined>): BlueprintProblem[] | undefined {
  const problems = groups.flatMap((group) => group ?? []);
  return problems.length > 0 ? problems : undefined;
}
