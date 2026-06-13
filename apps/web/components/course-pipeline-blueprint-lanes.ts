import { MarkerType, type Edge } from "@xyflow/react";

import type { CourseInventoryNode, CourseInventoryResponse, CourseInventoryTaskGroup } from "@/components/study-pipeline-preview";
import { buildExtractionVariants } from "@/components/course-pipeline-blueprint-extraction-variants";
import {
  codexNodeData,
  collectProblems,
  extractedDocumentProblems,
  extractionNodeData,
  materializedStepNode,
  missingSolutionNode,
} from "@/components/course-pipeline-blueprint-node-data";
import {
  finalScriptOutputNodeData,
  finalTaskOutputNodeData,
} from "@/components/course-pipeline-blueprint-output-data";
import type {
  BlueprintGraphNode,
  BlueprintNode,
  BlueprintNodeData,
  ExtractedLookup,
  OutputLookup,
  PipelineRunRecord,
  PipelineRunsResponse,
} from "@/components/course-pipeline-blueprint-model";
import { resourceKeys } from "@/components/course-pipeline-blueprint-model";
import {
  formatDateTime,
  runArtifactSummary,
  runConfig,
  runMeta,
  runPreview,
  stableId,
  STAGE_LABELS,
} from "@/components/course-pipeline-blueprint-run-utils";

type BlueprintNodeInput = Omit<BlueprintNode, "type"> & { type?: "blueprint" };
type ExtractedDocumentRecord = NonNullable<ExtractedLookup["response"]>["documents"][number];

export function addTaskGroupLane({
  activeRunIds,
  edges,
  extractedLookup,
  group,
  hiddenSiblingTitles,
  index,
  nodes,
  outputLookup,
  runLookup,
  y,
}: {
  activeRunIds: Set<string>;
  edges: Edge[];
  extractedLookup: ExtractedLookup;
  group: CourseInventoryTaskGroup;
  hiddenSiblingTitles?: string[];
  index: number;
  nodes: BlueprintGraphNode[];
  outputLookup: OutputLookup;
  runLookup: RunLookup;
  y: number;
}) {
  const baseId = stableId(group.id);
  const groupId = `task-group-${baseId}`;
  const sheetPdfId = `${groupId}-sheet-pdf`;
  const solutionPdfId = `${groupId}-solution-pdf`;
  const sheetPagesId = `${groupId}-sheet-pages`;
  const solutionPagesId = `${groupId}-solution-pages`;
  const sheetSectionsId = `${groupId}-sheet-sections`;
  const solutionSectionsId = `${groupId}-solution-sections`;
  const sheetExtractionId = `${groupId}-sheet-extraction`;
  const solutionExtractionId = `${groupId}-solution-extraction`;
  const collectId = `${groupId}-collect`;
  const codexId = `${groupId}-codex`;
  const outputId = `${groupId}-output`;
  const paired = Boolean(group.solution);
  const sheetRun = findLatestRun(runLookup, group.sheet.id, ["extracted", "extract_text", "extract_pages"]);
  const solutionRun = group.solution ? findLatestRun(runLookup, group.solution.id, ["extracted", "extract_text", "extract_pages"]) : null;
  const sheetDocument = findExtractedDocument(extractedLookup, group.sheet.id);
  const solutionDocument = group.solution ? findExtractedDocument(extractedLookup, group.solution.id) : null;
  const codexRun = findLatestRun(runLookup, group.sheet.id, ["curated", "codex_curate"]);
  const taskOutputs = findTaskOutputs(outputLookup, group.sheet.id);
  const collectIssues = collectProblems(group, sheetRun, solutionRun, { sheetDocument, solutionDocument });

  addNode(nodes, {
    id: groupId,
    position: { x: PIPELINE_X.group, y },
    data: {
      title: group.title,
      subtitle: paired ? "sheet + solution" : group.pairingStatus.replaceAll("_", " "),
      detail: group.pairingReason || "Classified task group from Moodle resources.",
      evidence: [
        `Sheet: ${group.sheet.name}`,
        group.solution ? `Solution: ${group.solution.name}` : "Solution: missing",
        `Pairing confidence: ${group.pairingConfidence || "unknown"}`,
      ],
      hiddenItems: hiddenSiblingTitles,
      inputs: [{ label: "task group", detail: "classified Moodle resources" }],
      outputs: [
        { label: "sheet pdf", detail: group.sheet.name },
        { label: "solution pdf", detail: group.solution?.name ?? "missing", state: paired ? "available" : "missing" },
      ],
      outputPreview: `${group.sheet.name}${group.solution ? `\n${group.solution.name}` : "\nMissing solution"}`,
      problems: paired ? undefined : [{ label: "Solution missing", detail: "Codex can still build a task, but solution checks cannot be trusted.", severity: "warning" }],
      stepKind: "split",
      tone: paired ? "resource" : "warning",
      status: group.pairingStatus,
      meta: [
        { label: "Sheet", value: group.sheet.name },
        { label: "Solution", value: group.solution?.name ?? "missing" },
        { label: "Confidence", value: group.pairingConfidence || "unknown" },
      ],
    },
  });
  addEdge(edges, "resource-set", groupId, "task group", {
    sourceHandle: "out-0",
    targetHandle: "in-2",
  });

  addPdfPath({
    activeRunIds,
    courseId: extractedLookup.response?.courseId,
    edges,
    extractionId: sheetExtractionId,
    extractionRun: sheetRun,
    extractedDocument: sheetDocument,
    nodes,
    pagesId: sheetPagesId,
    pdfId: sheetPdfId,
    resource: group.sheet,
    runLookup,
    sectionsId: sheetSectionsId,
    sourceId: groupId,
    sourceHandle: "out-1",
    targetHandle: "in-2",
    x: PIPELINE_X.pdf,
    y: y - PDF_PAIR_OFFSET,
  });

  if (group.solution) {
    addPdfPath({
      activeRunIds,
      courseId: extractedLookup.response?.courseId,
      edges,
      extractionId: solutionExtractionId,
      extractionRun: solutionRun,
      extractedDocument: solutionDocument,
      nodes,
      pagesId: solutionPagesId,
      pdfId: solutionPdfId,
      resource: group.solution,
      runLookup,
      sectionsId: solutionSectionsId,
      sourceHandle: "out-4",
      sourceId: groupId,
      targetHandle: "in-2",
      x: PIPELINE_X.pdf,
      y: y + PDF_PAIR_OFFSET,
    });
  } else {
    addNode(nodes, {
      id: solutionPdfId,
      position: { x: PIPELINE_X.pdf, y: y + PDF_PAIR_OFFSET },
      data: missingSolutionNode(group),
    });
    addEdge(edges, groupId, solutionPdfId, "missing", { muted: true, sourceHandle: "out-4", targetHandle: "in-2" });
  }

  addNode(nodes, {
    id: collectId,
    position: { x: PIPELINE_X.collect, y },
    data: {
      title: "Collect Pair",
      subtitle: paired ? "sheet + solution" : "sheet only",
      detail: "Combines assignment and solution extractions into one Codex input bundle.",
      evidence: [
        `Sheet extraction: ${sheetRun ? sheetRun.status : sheetDocument ? `${sheetDocument.status} document` : "missing"}`,
        `Solution extraction: ${solutionRun ? solutionRun.status : solutionDocument ? `${solutionDocument.status} document` : group.solution ? "missing" : "not available"}`,
      ],
      inputs: [
        { label: "sheet extraction", detail: group.sheet.name, state: sheetRun?.status ?? sheetDocument?.status ?? "missing" },
        { label: "solution extraction", detail: group.solution?.name ?? "missing", state: solutionRun?.status ?? solutionDocument?.status ?? "missing" },
      ],
      outputPreview: `Codex input bundle\nSheet: ${group.sheet.name}\nSolution: ${group.solution?.name ?? "missing"}`,
      outputs: [{ label: "task input bundle", detail: group.title }],
      problems: collectIssues,
      stepKind: "collect",
      tone: collectIssues.length > 0 ? "warning" : "process",
      status: collectIssues.length > 0 ? "needs_review" : "ready",
      meta: [
        { label: "Input count", value: group.solution ? "2" : "1" },
        { label: "Output", value: "Codex task input bundle" },
      ],
    },
  });
  addEdge(edges, sheetExtractionId, collectId, "sheet", { sourceHandle: "out-2", targetHandle: "in-1" });
  addEdge(edges, group.solution ? solutionExtractionId : solutionPdfId, collectId, "solution", {
    muted: !group.solution,
    sourceHandle: "out-2",
    targetHandle: "in-4",
  });

  addNode(nodes, {
    id: codexId,
    position: { x: PIPELINE_X.codex, y },
    data: codexNodeData({
      activeRunIds,
      inputLabel: group.title,
      outputLabel: "task draft[]",
      outputPreview: taskOutputs.length > 0
        ? taskOutputs.map((task) => `${task.title}\n${task.promptMarkdown}`).join("\n\n")
        : undefined,
      hasMaterializedOutput: taskOutputs.length > 0,
      run: codexRun,
      subtitle: "task transform",
    }),
  });
  addEdge(edges, collectId, codexId, "task input", { edgeType: "straight", sourceHandle: "out-2", targetHandle: "in-2" });

  addNode(nodes, {
    id: outputId,
    position: { x: PIPELINE_X.output, y },
    data: finalTaskOutputNodeData({
      group,
      index,
      outputs: taskOutputs,
      sourceDocuments: [sheetDocument, solutionDocument],
      upstreamProblems: collectIssues,
    }),
  });
  addEdge(edges, codexId, outputId, "publish", { edgeType: "straight", sourceHandle: "out-2", targetHandle: "in-2" });
}

export function addScriptLane({
  activeRunIds,
  edges,
  extractedLookup,
  index,
  nodes,
  outputLookup,
  resource,
  runLookup,
  y,
}: {
  activeRunIds: Set<string>;
  edges: Edge[];
  extractedLookup: ExtractedLookup;
  index: number;
  nodes: BlueprintGraphNode[];
  outputLookup: OutputLookup;
  resource: CourseInventoryNode;
  runLookup: RunLookup;
  y: number;
}) {
  const baseId = `script-${stableId(resource.id)}`;
  const pdfId = `${baseId}-pdf`;
  const pagesId = `${baseId}-pages`;
  const sectionsId = `${baseId}-sections`;
  const extractionId = `${baseId}-extraction`;
  const selectedId = `${baseId}-selected`;
  const codexId = `${baseId}-codex`;
  const outputId = `${baseId}-output`;
  const extractionRun = findLatestRun(runLookup, resource.id, ["extracted", "extract_text", "extract_pages"]);
  const extractedDocument = findExtractedDocument(extractedLookup, resource.id);
  const codexRun = findLatestRun(runLookup, resource.id, ["curated", "codex_curate"]);
  const scriptOutputs = findScriptOutputs(outputLookup, resource.id);
  const selectedExtractionReady = Boolean((extractionRun && extractionRun.status !== "failed") || (extractedDocument && extractedDocument.status !== "failed"));

  addNode(nodes, {
    id: baseId,
    position: { x: PIPELINE_X.group, y },
    data: {
      title: `Script Group ${index + 1}`,
      subtitle: resource.name,
      detail: "Lecture material is processed into script sections rather than task outputs.",
      evidence: [`Resource: ${resource.name}`, `Reason: ${resource.reason || "lecture material"}`],
      inputs: [{ label: "script group", detail: "classified Moodle resource" }],
      outputs: [{ label: "script pdf", detail: resource.name }],
      outputPreview: resource.name,
      stepKind: "transform",
      tone: "resource",
      status: resource.confidence ? `${resource.confidence} confidence` : "classified",
      meta: [
        { label: "Resource ID", value: resource.id },
        { label: "Section", value: resource.sectionName || "unknown" },
      ],
    },
  });
  addEdge(edges, "resource-set", baseId, "script group", {
    sourceHandle: "out-2",
    targetHandle: "in-2",
  });

  addPdfPath({
    activeRunIds,
    courseId: extractedLookup.response?.courseId,
    edges,
    extractionId,
    extractionRun,
    extractedDocument,
    nodes,
    pagesId,
    pdfId,
    resource,
    runLookup,
    sectionsId,
    sourceHandle: "out-2",
    sourceId: baseId,
    targetHandle: "in-2",
    x: PIPELINE_X.pdf,
    y,
  });

  addNode(nodes, {
    id: selectedId,
    position: { x: PIPELINE_X.collect, y },
    data: {
      title: "Selected Extraction",
      subtitle: extractionRun ? extractionRun.engine : extractedDocument ? `${extractedDocument.engine} document` : "missing",
      detail: "The active extraction becomes the input for script curation.",
      artifacts: extractionRun ? runArtifactSummary(extractionRun) : extractedDocument ? [`document:${extractedDocument.id} · run ${extractedDocument.runId}`] : [],
      config: extractionRun ? runConfig(extractionRun) : [],
      evidence: extractionRun
        ? [`Run ${extractionRun.id}`]
        : extractedDocument
          ? [`Document ${extractedDocument.id}`, `Run ${extractedDocument.runId}`, `${extractedDocument.pages.length} pages`]
          : ["No selected extraction run recorded"],
      inputs: [{ label: "extraction variants", detail: resource.name }],
      outputs: [{ label: "active extraction", detail: extractionRun?.engine ?? extractedDocument?.engine ?? "missing", state: extractionRun?.status ?? extractedDocument?.status ?? "missing" }],
      outputPreview: extractionRun
        ? runPreview(extractionRun)
        : extractedDocument
          ? `${resource.name}\n${extractedDocument.pages.length} page(s), ${extractedDocument.pages.reduce((sum, page) => sum + page.blocks.length, 0)} block(s).`
        : `No active extraction is selected for ${resource.name}.\nRun an extraction engine before Codex can build script sections.`,
      problems: selectedExtractionReady ? undefined : [{ label: "No active extraction", detail: "The script source has not produced a selected extraction.", severity: "warning" }],
      stepKind: "transform",
      tone: selectedExtractionReady ? "run" : "warning",
      status: extractionRun?.status ?? extractedDocument?.status ?? "missing",
      active: extractionRun ? activeRunIds.has(extractionRun.id) : false,
      meta: extractionRun ? runMeta(extractionRun) : [
        { label: "Resource", value: resource.name },
        { label: "Document", value: extractedDocument?.id ?? "missing" },
      ],
    },
  });
  addEdge(edges, extractionId, selectedId, "select", { edgeType: "straight", sourceHandle: "out-2", targetHandle: "in-2" });

  addNode(nodes, {
    id: codexId,
    position: { x: PIPELINE_X.codex, y },
    data: codexNodeData({
      activeRunIds,
      inputLabel: resource.name,
      outputLabel: "script section[]",
      outputPreview: scriptOutputs.length > 0
        ? scriptOutputs.map((section) => `${section.title}\n${section.statusLabel}`).join("\n\n")
        : undefined,
      hasMaterializedOutput: scriptOutputs.length > 0,
      run: codexRun,
      subtitle: "script transform",
    }),
  });
  addEdge(edges, selectedId, codexId, "active extraction", { edgeType: "straight", sourceHandle: "out-2", targetHandle: "in-2" });

  addNode(nodes, {
    id: outputId,
    position: { x: PIPELINE_X.output, y },
    data: finalScriptOutputNodeData({
      index,
      outputs: scriptOutputs,
      resource,
      upstreamProblems: selectedExtractionReady ? [] : [{ label: "Extraction missing", detail: "No extraction is available for this script resource.", severity: "warning" }],
    }),
  });
  addEdge(edges, codexId, outputId, "publish", { edgeType: "straight", sourceHandle: "out-2", targetHandle: "in-2" });
}

function addPdfPath({
  activeRunIds,
  courseId,
  edges,
  extractionId,
  extractionRun,
  extractedDocument,
  nodes,
  pagesId,
  pdfId,
  resource,
  runLookup,
  sectionsId,
  sourceHandle = "out-2",
  sourceId,
  targetHandle = "in-2",
  yOffset = 0,
  x,
  y,
}: {
  activeRunIds: Set<string>;
  courseId?: string;
  edges: Edge[];
  extractionId: string;
  extractionRun: PipelineRunRecord | null;
  extractedDocument: ExtractedDocumentRecord | null;
  nodes: BlueprintGraphNode[];
  pagesId: string;
  pdfId: string;
  resource: CourseInventoryNode;
  runLookup: RunLookup;
  sectionsId: string;
  sourceHandle?: string;
  sourceId: string;
  targetHandle?: string;
  yOffset?: number;
  x: number;
  y: number;
}) {
  addNode(nodes, {
    id: pdfId,
    position: { x, y },
    data: {
      title: resource.role === "solution" ? "Solution PDF" : resource.role === "sheet" ? "Sheet PDF" : "PDF Bundle",
      subtitle: resource.name,
      detail: "Raw source document from Moodle. Page and section steps must trace back to this file.",
      evidence: [`Moodle resource ${resource.id}`, resource.reason || "classified resource"],
      inputs: [{ label: "moodle resource", detail: resource.name }],
      outputs: [{ label: "pdf file", detail: resource.fileType || resource.type }],
      outputPreview: resource.name,
      stepKind: "transform",
      tone: "resource",
      status: resource.confidence ? `${resource.confidence} confidence` : "classified",
      meta: [
        { label: "Resource ID", value: resource.id },
        { label: "Bucket", value: resource.bucket },
        { label: "Section", value: resource.sectionName || "unknown" },
      ],
    },
  });
  addEdge(edges, sourceId, pdfId, resource.role === "solution" ? "solution" : resource.role === "sheet" ? "sheet" : "pdf", {
    sourceHandle,
    targetHandle,
  });

  addNode(nodes, {
    id: pagesId,
    position: { x: PIPELINE_X.pages, y: y + yOffset },
    data: materializedStepNode({
      count: extractedDocument?.pages.length,
      detail: extractedDocument
        ? `Stored ${extractedDocument.pages.length} extracted page${extractedDocument.pages.length === 1 ? "" : "s"} for this PDF.`
        : "Splits a PDF file into pages. Real page count and page images should be attached here once the backend exposes them.",
      input: "pdf file",
      output: "pages[]",
      resource,
      status: extractedDocument ? extractedDocument.status : "missing",
      stepKind: "split",
      title: "Pages",
    }),
  });
  addEdge(edges, pdfId, pagesId, "1 -> N", { edgeType: "straight", sourceHandle: "out-2", targetHandle: "in-2" });

  addNode(nodes, {
    id: sectionsId,
    position: { x: PIPELINE_X.sections, y: y + yOffset },
    data: materializedStepNode({
      count: extractedDocument?.pages.reduce((sum, page) => sum + page.blocks.length, 0),
      detail: extractedDocument
        ? `Stored ${extractedDocument.pages.reduce((sum, page) => sum + page.blocks.length, 0)} detected block${extractedDocument.pages.reduce((sum, page) => sum + page.blocks.length, 0) === 1 ? "" : "s"} across ${extractedDocument.pages.length} page${extractedDocument.pages.length === 1 ? "" : "s"}.`
        : "Detects semantic sections such as paragraphs, task statements, formulas, images, tables, and captions.",
      input: "pages[]",
      output: "sections[]",
      resource,
      status: extractedDocument ? extractedDocument.status : "missing",
      stepKind: "split",
      title: "Sections",
    }),
  });
  addEdge(edges, pagesId, sectionsId, "1 -> N", { edgeType: "straight", sourceHandle: "out-2", targetHandle: "in-2" });

  addNode(nodes, {
    id: extractionId,
    position: { x: PIPELINE_X.extraction, y: y + yOffset },
    data: extractionNodeData({
      activeRunIds,
      courseId,
      document: extractedDocument,
      resource,
      run: extractionRun,
      variants: buildExtractionVariants({ activeRunIds, resourceId: resource.id, runLookup }),
    }),
  });
  addEdge(edges, sectionsId, extractionId, "extract", { edgeType: "straight", sourceHandle: "out-2", targetHandle: "in-2" });
}

export function addReviewLane({
  edges,
  inventory,
  nodes,
  runs,
  y,
}: {
  edges: Edge[];
  inventory: CourseInventoryResponse | null;
  nodes: BlueprintGraphNode[];
  runs: PipelineRunsResponse | null;
  y: number;
}) {
  const warnings = buildWarnings(inventory, runs).slice(0, 5);
  if (warnings.length === 0) return;

  addNode(nodes, {
    id: "review-collector",
    position: { x: PIPELINE_X.group, y },
    data: {
      title: "Review Collector",
      subtitle: `${warnings.length} problem${warnings.length === 1 ? "" : "s"}`,
      detail: "Collects items that cannot safely continue without review.",
      evidence: warnings.map((warning) => warning.title),
      inputs: warnings.map((warning) => ({ label: warning.title, state: warning.status })),
      outputs: [{ label: "review queue", detail: `${warnings.length} items` }],
      outputPreview: warnings.map((warning) => `${warning.title}: ${warning.detail}`).join("\n"),
      problems: warnings.map((warning) => ({
        label: warning.title,
        detail: warning.detail,
        severity: warning.status === "failed" ? "error" : "warning",
      })),
      stepKind: "collect",
      tone: "warning",
      status: "needs_review",
      meta: [{ label: "Items", value: String(warnings.length) }],
    },
  });
  addEdge(edges, "resource-set", "review-collector", "review", {
    muted: true,
    sourceHandle: "out-4",
    targetHandle: "in-2",
  });
}

export type RunLookup = {
  byResourceStage: Map<string, PipelineRunRecord[]>;
};

export function buildRunLookup(runs: PipelineRunRecord[]): RunLookup {
  const byResourceStage = new Map<string, PipelineRunRecord[]>();
  for (const run of runs) {
    if (!run.resourceId) continue;
    for (const key of resourceKeys(run.resourceId)) {
      const resourceKey = runKey(key, run.stage);
      const resourceRuns = byResourceStage.get(resourceKey) ?? [];
      resourceRuns.push(run);
      byResourceStage.set(resourceKey, resourceRuns);
    }
  }
  for (const records of byResourceStage.values()) {
    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return { byResourceStage };
}

function findLatestRun(runLookup: RunLookup, resourceId: string, stages: string[]): PipelineRunRecord | null {
  for (const stage of stages) {
    for (const key of resourceKeys(resourceId)) {
      const resourceRun = runLookup.byResourceStage.get(runKey(key, stage))?.[0];
      if (resourceRun) return resourceRun;
    }
  }
  return null;
}

function runKey(resourceId: string, stage: string): string {
  return `${resourceId}:${stage}`;
}

function findExtractedDocument(extractedLookup: ExtractedLookup, resourceId: string) {
  for (const key of resourceKeys(resourceId)) {
    const document = extractedLookup.byResourceId.get(key);
    if (document) return document;
  }
  return null;
}

function findTaskOutputs(outputLookup: OutputLookup, resourceId: string) {
  const seen = new Set<string>();
  const outputs = [];
  for (const key of resourceKeys(resourceId)) {
    for (const output of outputLookup.byResourceId.get(key) ?? []) {
      if (seen.has(output.taskId)) continue;
      seen.add(output.taskId);
      outputs.push(output);
    }
  }
  return outputs;
}

function findScriptOutputs(outputLookup: OutputLookup, resourceId: string) {
  const seen = new Set<string>();
  const outputs = [];
  for (const key of resourceKeys(resourceId)) {
    for (const output of outputLookup.scriptSectionsByResourceId.get(key) ?? []) {
      if (seen.has(output.id)) continue;
      seen.add(output.id);
      outputs.push(output);
    }
  }
  return outputs;
}

export function buildWarnings(
  inventory: CourseInventoryResponse | null,
  runs: PipelineRunsResponse | null,
): Array<BlueprintNodeData & { sourceId: string }> {
  const missingSolutions = inventory?.taskGroups
    .filter((group) => group.pairingStatus !== "paired")
    .map((group) => ({
      sourceId: "resource-set",
      title: group.title,
      subtitle: group.pairingStatus.replaceAll("_", " "),
      detail: group.pairingReason || "This task group needs review before it can be trusted.",
      tone: "warning" as const,
      stepKind: "transform" as const,
      status: group.pairingStatus,
      inputs: [{ label: "task group", detail: group.title }],
      outputs: [{ label: "review item", state: "needs_review" }],
      meta: [
        { label: "Sheet", value: group.sheet.name },
        { label: "Solution", value: group.solution?.name ?? "missing" },
      ],
    })) ?? [];
  const unknownResources = inventory?.unknown.slice(0, 4).map((item) => warningFromInventoryNode(item)) ?? [];
  const failedRuns = runs?.runs
    .filter((run) => run.status === "failed")
    .slice(0, 4)
    .map((run) => ({
      sourceId: `run-${run.stage}`,
      title: `${STAGE_LABELS[run.stage] ?? run.stage} failed`,
      subtitle: run.engine,
      detail: run.error || "The run failed without a recorded error message.",
      tone: "warning" as const,
      stepKind: "transform" as const,
      status: "failed",
      inputs: [{ label: "pipeline run", detail: run.id }],
      outputs: [{ label: "review item", state: "failed" }],
      meta: [
        { label: "Run ID", value: run.id },
        { label: "Created", value: formatDateTime(run.createdAt) },
      ],
    })) ?? [];

  return [...missingSolutions, ...unknownResources, ...failedRuns];
}

function warningFromInventoryNode(item: CourseInventoryNode): BlueprintNodeData & { sourceId: string } {
  return {
    sourceId: "resource-set",
    title: item.name,
    subtitle: "unknown resource",
    detail: item.reason || "No confident bucket matched this resource.",
    inputs: [{ label: "resource", detail: item.name }],
    outputs: [{ label: "review item", state: "needs_review" }],
    stepKind: "transform",
    tone: "warning",
    status: item.confidence ? `${item.confidence} confidence` : "unknown",
    meta: [
      { label: "Resource ID", value: item.id },
      { label: "Section", value: item.sectionName || "unknown section" },
    ],
  };
}

function addNode(nodes: BlueprintGraphNode[], node: BlueprintNodeInput) {
  nodes.push({ ...node, type: "blueprint" });
}

function addEdge(
  edges: Edge[],
  source: string,
  target: string,
  label: string,
  options?: {
    edgeType?: Edge["type"];
    muted?: boolean;
    sourceHandle?: string;
    targetHandle?: string;
  },
) {
  const color = options?.muted ? "#a3a3a3" : label === "failed" ? "#dc2626" : "#525252";
  edges.push({
    id: `${source}->${target}`,
    labelBgPadding: [8, 4],
    labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
    labelStyle: { fill: options?.muted ? "#737373" : "#404040", fontSize: 11, fontWeight: 600 },
    markerEnd: { color, type: MarkerType.ArrowClosed },
    source,
    sourceHandle: options?.sourceHandle,
    style: {
      stroke: color,
      strokeDasharray: options?.muted ? "4 6" : undefined,
      strokeWidth: options?.muted ? 1.5 : 2.25,
    },
    target,
    targetHandle: options?.targetHandle,
    type: options?.edgeType ?? "smoothstep",
  });
}

const PIPELINE_X = {
  group: 820,
  pdf: 1260,
  pages: 1740,
  sections: 2220,
  extraction: 2700,
  collect: 3220,
  codex: 3680,
  output: 4140,
} as const;

const PDF_PAIR_OFFSET = 190;
