import type { CourseInventoryNode, CourseInventoryTaskGroup } from "@/components/study-pipeline-preview";
import type {
  BlueprintExtractionVariant,
  BlueprintNodeData,
  BlueprintProblem,
  BlueprintRenderedField,
  BlueprintStepKind,
  PipelineRunRecord,
} from "@/components/course-pipeline-blueprint-model";
import type { DocumentAsset, PDFDocumentStructure } from "@/components/extracted-document-inspector";
import {
  runArtifactSummary,
  runConfig,
  runMeta,
  runPreview,
} from "@/components/course-pipeline-blueprint-run-utils";
import {
  isLiveStatus,
  runDiagnosticProblems,
  runLiveEvidence,
  runLiveState,
  runTimingMeta,
} from "@/components/course-pipeline-live-state";

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
  courseId,
  document,
  resource,
  run,
  variants = [],
}: {
  activeRunIds: Set<string>;
  courseId?: string;
  document: PDFDocumentStructure | null;
  resource: CourseInventoryNode;
  run: PipelineRunRecord | null;
  variants?: BlueprintExtractionVariant[];
}): BlueprintNodeData {
  if (!run && !document) {
    return {
      title: "Extraction Variants",
      subtitle: "missing",
      detail: "OCR and extraction variants should appear here for this resource.",
      evidence: ["No extraction run record was found for this resource."],
      extractionVariants: variants,
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
      extractionVariants: variants,
      inputs: [{ label: "sections[]", detail: resource.name }],
      bodyData: extractedDocumentBodyData(document, courseId),
      outputs: [{ label: "extracted document", detail: document.engine, state: document.status }],
      outputPreview: extractedDocumentMarkdown(document, courseId),
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
      ...runLiveEvidence(run),
      ...(document ? [`Extracted document ${document.id}`, `${document.pages.length} pages`, `${document.assets.length} assets`] : ["No extracted document payload loaded"]),
    ],
    extractionVariants: variants,
    inputs: [{ label: "sections[]", detail: resource.name }],
    bodyData: document ? extractedDocumentBodyData(document, courseId, run) : undefined,
    outputs: [{ label: "extracted document", detail: run.engine, state: run.status }],
    outputPreview: document ? extractedDocumentMarkdown(document, courseId) : runPreview(run),
    problems: mergeProblems(runProblems(run), runDiagnosticProblems(run), documentProblems),
    stepKind: "split",
    tone: run.status === "failed" || run.status === "warning" ? "warning" : "run",
    status: run.status,
    active: activeRunIds.has(run.id),
    live: runLiveState(run),
    meta: [...runMeta(run), ...runTimingMeta(run)],
  };
}

export function codexNodeData({
  activeRunIds,
  hasMaterializedOutput = false,
  inputLabel,
  outputLabel,
  outputPreview,
  run,
  subtitle,
}: {
  activeRunIds: Set<string>;
  hasMaterializedOutput?: boolean;
  inputLabel: string;
  outputLabel: string;
  outputPreview?: string;
  run: PipelineRunRecord | null;
  subtitle: string;
}): BlueprintNodeData {
  if (!run) {
    if (hasMaterializedOutput) {
      return {
        title: "Codex Transform",
        subtitle: `${subtitle} · output loaded`,
        detail: "Transforms selected extracted content into website-ready task or script drafts.",
        evidence: [
          "Website output is already loaded from task-view.",
          "The immutable Codex run record was not exposed for this lane.",
        ],
        inputs: [{ label: "active input bundle", detail: inputLabel }],
        bodyData: codexBodyData({ hasMaterializedOutput, inputLabel, outputLabel, outputPreview, run, subtitle }),
        outputs: [{ label: outputLabel, state: "ready" }],
        outputPreview: outputPreview ?? "A website-ready draft is available downstream.",
        renderedFields: codexRenderedFields({ outputLabel, outputPreview }),
        stepKind: "transform",
        tone: "output",
        status: "ready",
        meta: [
          { label: "Input", value: inputLabel },
          { label: "Run record", value: "not exposed" },
        ],
      };
    }
    return {
      title: "Codex Transform",
      subtitle,
      detail: "Transforms selected extracted content into website-ready task or script drafts.",
      evidence: ["No Codex run has been recorded for this input yet."],
      inputs: [{ label: "active input bundle", detail: inputLabel }],
      bodyData: codexBodyData({ hasMaterializedOutput, inputLabel, outputLabel, outputPreview, run, subtitle }),
      outputs: [{ label: outputLabel, state: "missing" }],
      outputPreview: outputPreview ?? "Codex has not produced a draft for this lane yet.",
      renderedFields: codexRenderedFields({ outputLabel, outputPreview }),
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
    evidence: [`Run ${run.id}`, `Engine ${run.engine}`, `${run.artifactRefs?.length ?? 0} artifact refs`, ...runLiveEvidence(run)],
    inputs: [{ label: "active input bundle", detail: inputLabel }],
    bodyData: codexBodyData({ hasMaterializedOutput, inputLabel, outputLabel, outputPreview, run, subtitle }),
    outputs: [{ label: outputLabel, state: run.status }],
    outputPreview: outputPreview ?? runPreview(run),
    renderedFields: codexRenderedFields({ outputLabel, outputPreview }),
    problems: mergeProblems(runProblems(run), runDiagnosticProblems(run)),
    stepKind: "transform",
    tone: run.status === "failed" || run.status === "warning" ? "warning" : "run",
    status: run.status,
    active: activeRunIds.has(run.id),
    live: runLiveState(run),
    meta: [...runMeta(run), ...runTimingMeta(run)],
  };
}

function codexBodyData({
  hasMaterializedOutput,
  inputLabel,
  outputLabel,
  outputPreview,
  run,
  subtitle,
}: {
  hasMaterializedOutput: boolean;
  inputLabel: string;
  outputLabel: string;
  outputPreview?: string;
  run: PipelineRunRecord | null;
  subtitle: string;
}) {
  return {
    type: "codex_transform",
    subtitle,
    input: {
      label: "active input bundle",
      value: inputLabel,
    },
    output: {
      label: outputLabel,
      hasMaterializedOutput,
      contentMarkdown: outputPreview ?? null,
    },
    run: run
      ? {
          id: run.id,
          stage: run.stage,
          engine: run.engine,
          configHash: run.configHash,
          status: run.status,
          createdAt: run.createdAt,
          startedAt: run.startedAt ?? null,
          finishedAt: run.finishedAt ?? null,
          artifactRoot: run.artifactRoot,
        }
      : null,
  };
}

function codexRenderedFields({
  outputLabel,
  outputPreview,
}: {
  outputLabel: string;
  outputPreview?: string;
}): BlueprintRenderedField[] | undefined {
  if (!outputPreview?.trim()) return undefined;
  return [{
    label: outputLabel,
    path: "output.contentMarkdown",
    type: "markdown",
    value: outputPreview,
  }];
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
  documents?: {
    sheetDocument?: PDFDocumentStructure | null;
    solutionDocument?: PDFDocumentStructure | null;
  },
): BlueprintProblem[] {
  const problems: BlueprintProblem[] = [];
  const sheetAvailable = hasUsableExtraction(sheetRun, documents?.sheetDocument);
  const solutionAvailable = hasUsableExtraction(solutionRun, documents?.solutionDocument);
  if (!sheetAvailable) {
    problems.push({ label: "Sheet extraction missing", detail: "The assignment sheet has no extraction output.", severity: "warning" });
  }
  if (!group.solution) {
    problems.push({ label: "Solution missing", detail: "No solution PDF was paired with this assignment sheet.", severity: "warning" });
  } else if (!solutionAvailable) {
    problems.push({ label: "Solution extraction missing", detail: "The solution PDF exists, but no extraction output is stored.", severity: "warning" });
  }
  return problems;
}

function hasUsableExtraction(
  run: PipelineRunRecord | null,
  document: PDFDocumentStructure | null | undefined,
): boolean {
  if (run && run.status !== "failed") return true;
  if (document && document.status !== "failed") return true;
  return false;
}

function runProblems(run: PipelineRunRecord): BlueprintProblem[] | undefined {
  const problems: BlueprintProblem[] = [];
  if (run.status === "failed") {
    problems.push({ label: "Run failed", detail: run.error || "The run failed without a stored error.", severity: "error" });
  }
  if ((run.artifactRefs?.length ?? 0) === 0 && !isLiveStatus(run.status)) {
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
  const unrenderableUnusedImages = unusedImageAssets(document).filter((asset) => !asset || !asset.path);
  if (unrenderableUnusedImages.length > 0) {
    problems.push({ label: "Unused images", detail: `${unrenderableUnusedImages.length} extracted image asset(s) cannot be rendered.`, severity: "warning" });
  }
  if ((document.diagnostics.unknownBlocks?.length ?? 0) > 0) {
    problems.push({ label: "Unknown blocks", detail: `${document.diagnostics.unknownBlocks?.length} block(s) need review.`, severity: "warning" });
  }
  for (const warning of document.diagnostics.warnings ?? []) {
    problems.push({ label: "Extraction warning", detail: warning, severity: "warning" });
  }
  return problems;
}

function extractedDocumentBodyData(
  document: PDFDocumentStructure,
  courseId?: string,
  run?: PipelineRunRecord,
) {
  return {
    type: "extracted_document",
    document: {
      id: document.id,
      resource: document.resource,
      engine: document.engine,
      status: document.status,
      sourcePath: document.sourcePath ?? null,
      extractedPath: document.extractedPath ?? null,
      contentMarkdown: extractedDocumentMarkdown(document, courseId),
      pages: document.pages.map((page) => ({
        id: page.id,
        pageNumber: page.pageNumber,
        previewAssetId: page.previewAssetId ?? null,
        text: page.text ?? null,
        markdown: page.markdown ?? null,
        blocks: page.blocks,
        diagnostics: page.diagnostics ?? null,
      })),
      assets: document.assets.map((asset) => ({
        ...asset,
        url: extractedAssetUrl(courseId, asset.path),
      })),
      diagnostics: document.diagnostics,
    },
    run: run
      ? {
          id: run.id,
          stage: run.stage,
          engine: run.engine,
          configHash: run.configHash,
          status: run.status,
          createdAt: run.createdAt,
          startedAt: run.startedAt ?? null,
          finishedAt: run.finishedAt ?? null,
          artifactRoot: run.artifactRoot,
        }
      : null,
  };
}

function extractedDocumentMarkdown(document: PDFDocumentStructure, courseId?: string): string {
  const assetsById = new Map(document.assets.map((asset) => [asset.id, asset] as const));
  const referencedAssetIds = new Set<string>();
  const pageMarkdown = document.pages.flatMap((page) => {
    const pageBlocks = page.blocks
      .map((block) => {
        if (block.assetId) {
          referencedAssetIds.add(block.assetId);
          const asset = assetsById.get(block.assetId);
          if (asset) {
            return assetMarkdown(asset, courseId, block.label || `${document.resource.name} page ${page.pageNumber}`);
          }
        }
        if (block.markdown?.trim()) return block.markdown.trim();
        if (block.text?.trim()) return block.text.trim();
        return "";
      })
      .filter(Boolean);
    if (pageBlocks.length === 0) return [];
    if (document.pages.length <= 1) return pageBlocks;
    return [`## Page ${page.pageNumber}`, ...pageBlocks];
  });

  const supplementalAssets = unusedImageAssets(document)
    .filter((asset): asset is DocumentAsset => Boolean(asset?.path))
    .filter((asset) => !referencedAssetIds.has(asset.id));
  const supplementalMarkdown = supplementalAssets.length > 0
    ? [
        "## Extracted image assets",
        ...supplementalAssets.map((asset) => assetMarkdown(asset, courseId, asset.role || asset.id)),
      ]
    : [];
  const markdown = [...pageMarkdown, ...supplementalMarkdown].filter(Boolean).join("\n\n").trim();
  return markdown || `${document.resource.name}\n\n${document.pages.length} page(s), ${document.pages.flatMap((page) => page.blocks).length} block(s), ${document.assets.length} asset(s).`;
}

function unusedImageAssets(document: PDFDocumentStructure): Array<DocumentAsset | undefined> {
  const assetsById = new Map(document.assets.map((asset) => [asset.id, asset] as const));
  return (document.diagnostics.unusedImageAssets ?? []).map((assetId) => assetsById.get(assetId));
}

function assetMarkdown(asset: DocumentAsset, courseId: string | undefined, fallbackAlt: string): string {
  const alt = escapeMarkdownAlt(asset.role || fallbackAlt || asset.id);
  const url = extractedAssetUrl(courseId, asset.path);
  return url ? `![${alt}](${url})` : `[image asset: ${asset.id}]`;
}

function extractedAssetUrl(courseId: string | undefined, path: string): string {
  if (!courseId || !path) return "";
  return `/api/study-pipeline/courses/${encodeURIComponent(courseId)}/study-pipeline/extracted-asset?path=${encodeURIComponent(path)}`;
}

function escapeMarkdownAlt(value: string): string {
  return value.replace(/[[\]]/g, "");
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
