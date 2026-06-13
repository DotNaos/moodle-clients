import { MarkerType, type Edge, type Node } from "@xyflow/react";

import type {
  CourseInventoryNode,
  CourseInventoryResponse,
  StudyPipelineStatusResponse,
} from "@/components/study-pipeline-preview";
import type { ExtractedDocumentsResponse } from "@/components/extracted-document-inspector";
import type { TaskViewResponse } from "@/components/task-study-panel";
import {
  addReviewLane,
  addScriptLane,
  addTaskGroupLane,
  buildRunLookup,
  buildWarnings,
} from "@/components/course-pipeline-blueprint-lanes";
import { courseLiveState } from "@/components/course-pipeline-live-state";

export type PipelineRunRecord = {
  id: string;
  sourceId: string;
  courseId: string;
  resourceId?: string;
  fileHash?: string;
  stage: string;
  engine: string;
  configHash: string;
  ownership: "shared" | "user_owned" | string;
  createdBy?: string;
  status: string;
  artifactRoot: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  diagnostics?: Array<{
    code?: string;
    createdAt?: string;
    level: "error" | "info" | "warning" | string;
    message: string;
    stage?: string;
  }>;
  logs?: string[];
  artifactRefs?: Array<{
    id: string;
    kind: string;
    uri?: string;
    storageKey?: string;
    checksum?: string;
    pageNumber?: number;
    blockId?: string;
    metadata?: Record<string, unknown>;
  }>;
};

export type ActiveRunSelectionRecord = {
  sourceId: string;
  resourceId?: string;
  stage: string;
  activeRunId: string;
  selectedBy?: string;
  selectedAt: string;
  reason: string;
};

export type PipelineRunsResponse = {
  courseId: string;
  runs: PipelineRunRecord[];
  activeSelections: ActiveRunSelectionRecord[];
};

export type BlueprintNodeTone = "source" | "process" | "resource" | "run" | "output" | "warning";
export type BlueprintStepKind = "transform" | "split" | "collect";
export type BlueprintProblemSeverity = "warning" | "error";

export type BlueprintProblem = {
  label: string;
  detail: string;
  severity: BlueprintProblemSeverity;
};

export type BlueprintPort = {
  label: string;
  detail?: string;
  state?: string;
};

export type BlueprintExtractionVariant = {
  active: boolean;
  artifactCount: number;
  chars: number | null;
  configHash: string;
  engine: string;
  preview: string;
  runId?: string;
  status: "active" | "failed" | "missing" | "ok" | "stale" | "weak";
};

export type BlueprintLiveState = {
  status: "failed" | "queued" | "running" | "stale" | "succeeded" | "warning" | "needs_review";
  label: string;
  detail?: string;
  runId?: string;
  startedAt?: string;
  finishedAt?: string;
  current?: boolean;
};

export type BlueprintNodeData = {
  title: string;
  subtitle: string;
  detail: string;
  tone: BlueprintNodeTone;
  stepKind: BlueprintStepKind;
  status?: string;
  active?: boolean;
  artifacts?: string[];
  config?: Array<{ label: string; value: string }>;
  evidence?: string[];
  inputs: BlueprintPort[];
  meta: Array<{ label: string; value: string }>;
  live?: BlueprintLiveState;
  onSelect?: (nodeId: string) => void;
  outputPreview?: string;
  outputs: BlueprintPort[];
  problems?: BlueprintProblem[];
  extractionVariants?: BlueprintExtractionVariant[];
  frame?: {
    height: number;
    variant?: "group" | "stage";
    width: number;
  };
};

export type BlueprintNode = Node<BlueprintNodeData, "blueprint">;
export type BlueprintFrameNode = Node<BlueprintNodeData, "frame">;
export type BlueprintGraphNode = BlueprintNode | BlueprintFrameNode;
type BlueprintNodeInput = Omit<BlueprintNode, "type"> & { type?: "blueprint" };
type BlueprintFrameInput = Omit<BlueprintFrameNode, "type"> & { type?: "frame" };

export type ExtractedLookup = {
  byResourceId: Map<string, ExtractedDocumentsResponse["documents"][number]>;
  response: ExtractedDocumentsResponse | null;
};

export type TaskOutputRecord = TaskViewResponse["sheets"][number]["tasks"][number] & {
  sheetTitle: string;
  solutionResourceId?: string;
  solutionTitle?: string;
};

export type ScriptOutputRecord = NonNullable<TaskViewResponse["scriptSections"]>[number];

export type OutputLookup = {
  byResourceId: Map<string, TaskOutputRecord[]>;
  scriptSectionsByResourceId: Map<string, ScriptOutputRecord[]>;
  taskView: TaskViewResponse | null;
  totalOutputs: number;
  totalScriptSections: number;
  totalTasks: number;
};

type CoursePipelineBlueprintModelInput = {
  extractedDocuments: ExtractedDocumentsResponse | null;
  inventory: CourseInventoryResponse | null;
  runs: PipelineRunsResponse | null;
  status: StudyPipelineStatusResponse | null;
  taskView: TaskViewResponse | null;
  unavailable?: {
    extractedDocuments?: string;
    inventory?: string;
    runs?: string;
    taskView?: string;
  };
};

const MAX_TASK_GROUPS = 4;
const MAX_SCRIPT_GROUPS = 3;

const STAGE_LABELS: Record<string, string> = {
  inventory: "Inventory",
  raw: "Raw import",
  extracted: "Extracted",
  curated: "Codex curated",
  extract_text: "Text extraction",
  codex_curate: "Codex transform",
};

export function buildBlueprintGraph({
  extractedDocuments,
  inventory,
  runs,
  status,
  taskView,
  unavailable,
}: CoursePipelineBlueprintModelInput): { nodes: BlueprintGraphNode[]; edges: Edge[] } {
  const nodes: BlueprintGraphNode[] = [];
  const edges: Edge[] = [];
  const activeRunIds = new Set((runs?.activeSelections ?? []).map((selection) => selection.activeRunId));
  const runLookup = buildRunLookup(runs?.runs ?? []);
  const extractedLookup = buildExtractedLookup(extractedDocuments);
  const outputLookup = buildOutputLookup(taskView);
  const derivedInventory = inventory ?? inventoryFromStatus(status);
  const usingDerivedInventory = !inventory && Boolean(derivedInventory);
  const taskGroups = sortTaskGroups(derivedInventory?.taskGroups ?? []);
  const scriptResources = sortInventoryNodes(derivedInventory?.lectureMaterial ?? []);
  const visibleTaskGroups = visibleBoundaryItems(taskGroups, MAX_TASK_GROUPS);
  const visibleScriptResources = scriptResources.slice(0, MAX_SCRIPT_GROUPS);
  const totalResources = status?.summary.totalResources ?? derivedInventory?.summary.totalResources ?? 0;
  const centerY = 760;
  const taskLaneGap = 720;
  const taskLaneStartY = centerY - ((Math.max(visibleTaskGroups.length, 1) - 1) * taskLaneGap) / 2;
  const scriptLaneY = taskLaneStartY + Math.max(visibleTaskGroups.length, 1) * taskLaneGap + 200;
  const stageTopY = taskLaneStartY - 120;
  const stageHeight = Math.max(visibleTaskGroups.length, 1) * taskLaneGap
    + Math.max(visibleScriptResources.length, 1) * 420
    + 520;

  addStageFrames(nodes, { height: stageHeight, y: stageTopY });

  addNode(nodes, {
    id: "course",
    position: { x: 0, y: centerY },
    data: {
      title: "Course",
      subtitle: `${totalResources} resources`,
      detail: "The Moodle course is the only initial input. Every generated task or script section must trace back to this source.",
      evidence: [
        "Initial input: Moodle course id",
        `${totalResources} Moodle resources reported`,
        runs ? `${runs.runs.length} immutable runs loaded` : `Run history missing${unavailable?.runs ? `: ${unavailable.runs}` : ""}`,
        extractedDocuments ? `${extractedDocuments.summary.totalDocuments} extracted documents loaded` : `Extracted documents missing${unavailable?.extractedDocuments ? `: ${unavailable.extractedDocuments}` : ""}`,
        taskView ? `${outputLookup.totalTasks} task outputs and ${outputLookup.totalScriptSections} script sections loaded` : `Task view missing${unavailable?.taskView ? `: ${unavailable.taskView}` : ""}`,
      ],
      inputs: [{ label: "course_id", detail: status?.courseId ?? inventory?.courseId ?? "unknown" }],
      outputPreview: `${outputLookup.totalTasks} task output(s) loaded\n${outputLookup.totalScriptSections} script section output(s) loaded\n${totalResources} Moodle resource(s) traced from the course input`,
      outputs: [{ label: "course source", detail: `${totalResources} resources` }],
      stepKind: "transform",
      tone: "source",
      status: status?.status ?? "not_started",
      live: courseLiveState(status),
      meta: [
        { label: "Course ID", value: status?.courseId ?? derivedInventory?.courseId ?? "unknown" },
        { label: "Current stage", value: status?.stage || "not started" },
        { label: "Runs", value: runs ? String(runs.runs.length) : "missing" },
        { label: "Extracted docs", value: extractedDocuments ? String(extractedDocuments.summary.totalDocuments) : "missing" },
        { label: "Outputs", value: taskView ? String(outputLookup.totalOutputs) : "missing" },
      ],
      problems: buildRootProblems({ extractedDocuments, runs, taskView, unavailable }),
    },
  });

  addNode(nodes, {
    id: "resource-set",
    position: { x: 420, y: centerY },
    data: {
      title: "Resource Set",
      subtitle: `${totalResources} resources`,
      detail: "Loads and normalizes the Moodle resource list before any task or script content is generated.",
      evidence: derivedInventory
        ? [
            `${derivedInventory.summary.taskGroups} task groups`,
            `${derivedInventory.summary.lectureMaterial} lecture resources`,
            `${derivedInventory.summary.unknown} unknown resources`,
            usingDerivedInventory
              ? `Inventory endpoint unavailable; graph derived from pipeline status materials${unavailable?.inventory ? ` (${unavailable.inventory})` : ""}.`
              : "Inventory endpoint available.",
          ]
        : [`Inventory response is missing${unavailable?.inventory ? `: ${unavailable.inventory}` : ""}`],
      inputs: [{ label: "course source", detail: "Moodle course resources" }],
      outputPreview: inventory
        ? `Task groups: ${inventory.summary.taskGroups}\nLecture resources: ${inventory.summary.lectureMaterial}\nUnknown: ${inventory.summary.unknown}`
        : derivedInventory
          ? `Task groups: ${derivedInventory.summary.taskGroups}\nLecture resources: ${derivedInventory.summary.lectureMaterial}\nUnknown: ${derivedInventory.summary.unknown}\nSource: derived from status`
          : "No inventory response loaded yet.",
      outputs: [
        { label: "task groups[]", detail: String(derivedInventory?.summary.taskGroups ?? 0) },
        { label: "script groups[]", detail: String(derivedInventory?.summary.lectureMaterial ?? 0) },
        { label: "review items[]", detail: String(buildWarnings(derivedInventory, runs).length) },
      ],
      problems: inventory || derivedInventory
        ? usingDerivedInventory
          ? [{
              label: "Inventory endpoint missing",
              detail: unavailable?.inventory ?? "The graph is using pipeline status materials as a fallback.",
              severity: "warning",
            }]
          : undefined
        : [{
            label: "Inventory missing",
            detail: unavailable?.inventory ?? "The resource classification response is not available.",
            severity: "warning",
          }],
      stepKind: "split",
      tone: "process",
      status: inventory ? "loaded" : derivedInventory ? "derived" : "missing",
      meta: derivedInventory
        ? [
            { label: "Task groups", value: String(derivedInventory.summary.taskGroups) },
            { label: "Lecture material", value: String(derivedInventory.summary.lectureMaterial) },
            { label: "Unknown", value: String(derivedInventory.summary.unknown) },
            { label: "Source", value: usingDerivedInventory ? "status fallback" : "inventory" },
          ]
        : [{ label: "State", value: "No inventory response loaded yet." }],
    },
  });
  addEdge(edges, "course", "resource-set", "1 -> 1", { edgeType: "straight" });

  addFrame(nodes, {
    id: "task-groups-frame",
    position: { x: 780, y: taskLaneStartY - 64 },
    data: frameData({
      height: Math.max(visibleTaskGroups.length, 1) * taskLaneGap - 120,
      subtitle: `${taskGroups.length} task groups`,
      title: "Task groups[]",
      variant: "group",
      width: 3720,
    }),
  });

  visibleTaskGroups.forEach((group, index) => {
    addTaskGroupLane({
      activeRunIds,
      edges,
      extractedLookup,
      group,
      index,
      nodes,
      outputLookup,
      runLookup,
      y: taskLaneStartY + index * taskLaneGap,
    });
  });

  if (taskGroups.length > visibleTaskGroups.length) {
    const hiddenGroups = hiddenBoundaryItems(taskGroups, MAX_TASK_GROUPS);
    const hiddenCount = hiddenGroups.length;
    const firstHidden = hiddenGroups[0];
    const lastHidden = hiddenGroups.at(-1);
    addNode(nodes, {
      id: "task-groups-more",
      position: { x: 860, y: centerY },
      data: {
        title: hiddenCount > 1 ? `${titleRange(firstHidden?.title, lastHidden?.title)} collapsed` : `${firstHidden?.title ?? hiddenCount} collapsed`,
        subtitle: `${hiddenCount} hidden task group${hiddenCount === 1 ? "" : "s"}`,
        detail: "The graph caps repeated lanes for readability. The Resources tab still contains every Moodle resource.",
        evidence: ["Visible graph is intentionally capped"],
        inputs: [{ label: "task groups[]" }],
        outputs: [{ label: "collapsed lanes", detail: String(hiddenCount) }],
        outputPreview: hiddenGroups.map((group) => group.title).join("\n"),
        stepKind: "split",
        tone: "resource",
        status: "collapsed",
        meta: [{ label: "Hidden groups", value: String(hiddenCount) }],
      },
    });
    addEdge(edges, "resource-set", "task-groups-more", "more", { muted: true });
  }

  if (visibleScriptResources.length > 0) {
    addFrame(nodes, {
      id: "script-groups-frame",
      position: { x: 780, y: scriptLaneY - 64 },
      data: frameData({
        height: Math.max(visibleScriptResources.length, 1) * 420 - 16,
        subtitle: `${scriptResources.length} script resources`,
        title: "Script groups[]",
        variant: "group",
        width: 3720,
      }),
    });
  }

  visibleScriptResources.forEach((resource, index) => {
    addScriptLane({
      activeRunIds,
      edges,
      index,
      nodes,
      resource,
      runLookup,
      extractedLookup,
      outputLookup,
      y: scriptLaneY + index * 420,
    });
  });

  addReviewLane({ edges, inventory: derivedInventory, nodes, runs, y: scriptLaneY + visibleScriptResources.length * 420 + 120 });

  return { nodes, edges };
}

function addNode(nodes: BlueprintGraphNode[], node: BlueprintNodeInput) {
  nodes.push({ ...node, type: "blueprint" });
}

function addFrame(nodes: BlueprintGraphNode[], node: BlueprintFrameInput) {
  nodes.push({ ...node, selectable: false, type: "frame", zIndex: -1 });
}

function addStageFrames(nodes: BlueprintGraphNode[], { height, y }: { height: number; y: number }) {
  const stages = [
    { id: "stage-course", title: "Course", subtitle: "source", width: 360, x: -20 },
    { id: "stage-resources", title: "Resources", subtitle: "inventory", width: 360, x: 380 },
    { id: "stage-groups", title: "Groups", subtitle: "task/script arrays", width: 360, x: 780 },
    { id: "stage-pdfs", title: "PDFs", subtitle: "sheet + solution", width: 380, x: 1220 },
    { id: "stage-pages", title: "Pages", subtitle: "1 -> N", width: 380, x: 1700 },
    { id: "stage-sections", title: "Sections", subtitle: "blocks", width: 380, x: 2180 },
    { id: "stage-extraction", title: "Extraction", subtitle: "OCR variants", width: 400, x: 2660 },
    { id: "stage-collect", title: "Collect", subtitle: "N -> 1", width: 380, x: 3180 },
    { id: "stage-codex", title: "Codex", subtitle: "curation", width: 380, x: 3640 },
    { id: "stage-output", title: "Outputs", subtitle: "website-ready", width: 400, x: 4100 },
  ];
  for (const stage of stages) {
    nodes.push({
      id: stage.id,
      position: { x: stage.x, y },
      selectable: false,
      type: "frame",
      zIndex: -3,
      data: frameData({
        height,
        subtitle: stage.subtitle,
        title: stage.title,
        variant: "stage",
        width: stage.width,
      }),
    });
  }
}

function addEdge(
  edges: Edge[],
  source: string,
  target: string,
  label: string,
  options?: { edgeType?: Edge["type"]; muted?: boolean },
) {
  const color = options?.muted ? "#a3a3a3" : label === "failed" ? "#dc2626" : "#525252";
  edges.push({
    id: `${source}->${target}`,
    labelBgPadding: [8, 4],
    labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
    labelStyle: { fill: options?.muted ? "#737373" : "#404040", fontSize: 11, fontWeight: 600 },
    markerEnd: { color, type: MarkerType.ArrowClosed },
    source,
    style: {
      stroke: color,
      strokeDasharray: options?.muted ? "4 6" : undefined,
      strokeWidth: options?.muted ? 1.5 : 2.25,
    },
    target,
    type: options?.edgeType ?? "smoothstep",
  });
}

function inventoryFromStatus(status: StudyPipelineStatusResponse | null): CourseInventoryResponse | null {
  if (!status) return null;

  const nodes = status.materials.map(materialToInventoryNode);
  const taskNodes = nodes.filter((node) => node.role === "sheet");
  const solutionNodes = nodes.filter((node) => node.role === "solution");
  const lectureMaterial = nodes.filter((node) => node.bucket === "lecture_material");
  const unknown = nodes.filter((node) => node.bucket === "unknown");
  const solutionsByKey = new Map(solutionNodes.map((node) => [pairingKey(node.name), node] as const));
  const taskGroups = taskNodes.map((sheet) => {
    const solution = solutionsByKey.get(pairingKey(sheet.name));
    return {
      id: `derived:${sheet.id}`,
      pairingConfidence: solution ? "medium" : "low",
      pairingReason: solution
        ? "Derived from pipeline status material names because inventory was unavailable."
        : "No matching solution material was visible in pipeline status.",
      pairingStatus: solution ? "paired" as const : "missing_solution" as const,
      sheet,
      solution,
      title: sheet.name,
    };
  });

  return {
    artifactRoot: undefined,
    courseId: status.courseId,
    generatedAt: status.createdAt,
    interactions: [],
    lectureMaterial,
    references: [],
    summary: {
      ambiguousTaskGroups: 0,
      ignoredAllowed: 0,
      interactions: 0,
      lectureMaterial: lectureMaterial.length,
      missingSolutionGroups: taskGroups.filter((group) => !group.solution).length,
      pairedTaskGroups: taskGroups.filter((group) => Boolean(group.solution)).length,
      references: 0,
      taskGroups: taskGroups.length,
      totalResources: status.summary.totalResources,
      unknown: unknown.length,
    },
    taskGroups,
    unknown,
  };
}

function materialToInventoryNode(material: StudyPipelineStatusResponse["materials"][number]): CourseInventoryNode {
  const text = normalizedText(`${material.name} ${material.type} ${material.resourceType ?? ""} ${material.fileType ?? ""}`);
  const solution = text.includes("solution") || text.includes("losung");
  const task = !solution && (text.includes("task") || text.includes("aufgabenblatt"));
  const lecture = text.includes("slide") || text.includes("script") || /^teil\s+\d+/.test(text);
  const bucket = task ? "task_sheet" : solution ? "solution" : lecture ? "lecture_material" : "unknown";
  const role = task ? "sheet" : solution ? "solution" : lecture ? "script" : "unknown";

  return {
    bucket,
    confidence: bucket === "unknown" ? "low" : "medium",
    fileType: material.fileType,
    id: material.id,
    name: material.name,
    reason: "Derived from pipeline status because inventory was unavailable.",
    resourceType: material.resourceType,
    role,
    sectionId: material.sectionId,
    sectionName: material.sectionName,
    type: material.type,
  };
}

function pairingKey(name: string): string {
  return normalizedText(name)
    .replace(/\b(solution|losung)\b/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildExtractedLookup(extractedDocuments: ExtractedDocumentsResponse | null): ExtractedLookup {
  const byResourceId = new Map<string, ExtractedDocumentsResponse["documents"][number]>();
  for (const document of extractedDocuments?.documents ?? []) {
    for (const key of resourceKeys(document.resource.id)) {
      byResourceId.set(key, document);
    }
  }
  return { byResourceId, response: extractedDocuments };
}

function buildOutputLookup(taskView: TaskViewResponse | null): OutputLookup {
  const byResourceId = new Map<string, TaskOutputRecord[]>();
  const scriptSectionsByResourceId = new Map<string, ScriptOutputRecord[]>();
  for (const sheet of taskView?.sheets ?? []) {
    for (const task of sheet.tasks) {
      const output = {
        ...task,
        sheetTitle: sheet.title,
        solutionResourceId: sheet.solutionResourceId,
        solutionTitle: sheet.solutionTitle,
      };
      for (const key of resourceKeys(task.sourceResourceId || sheet.resourceId)) {
        byResourceId.set(key, [...(byResourceId.get(key) ?? []), output]);
      }
      for (const key of resourceKeys(sheet.resourceId)) {
        byResourceId.set(key, [...(byResourceId.get(key) ?? []), output]);
      }
    }
  }
  for (const section of taskView?.scriptSections ?? []) {
    if (!section.sourcePath) continue;
    for (const resource of taskView?.resources ?? []) {
      if (!section.sourcePath.includes(resource.resourceId) && !section.sourcePath.includes(resource.title)) continue;
      for (const key of resourceKeys(resource.resourceId)) {
        scriptSectionsByResourceId.set(key, [...(scriptSectionsByResourceId.get(key) ?? []), section]);
      }
    }
  }
  const totalTasks = (taskView?.sheets ?? []).reduce((sum, sheet) => sum + sheet.tasks.length, 0);
  const totalScriptSections = taskView?.scriptSections?.length ?? 0;
  return {
    byResourceId,
    scriptSectionsByResourceId,
    taskView,
    totalOutputs: totalTasks + totalScriptSections,
    totalScriptSections,
    totalTasks,
  };
}

function buildRootProblems({
  extractedDocuments,
  runs,
  taskView,
  unavailable,
}: {
  extractedDocuments: ExtractedDocumentsResponse | null;
  runs: PipelineRunsResponse | null;
  taskView: TaskViewResponse | null;
  unavailable?: CoursePipelineBlueprintModelInput["unavailable"];
}): BlueprintProblem[] | undefined {
  const problems: BlueprintProblem[] = [];
  if (!runs) {
    problems.push({
      detail: unavailable?.runs ?? "Run history is not available, so active extraction choices cannot be compared.",
      label: "Run history missing",
      severity: "warning",
    });
  }
  if (!extractedDocuments) {
    problems.push({
      detail: unavailable?.extractedDocuments ?? "Extracted document structure is not available for inspection.",
      label: "Extraction output missing",
      severity: "warning",
    });
  }
  if (!taskView) {
    problems.push({
      detail: unavailable?.taskView ?? "Final task and script outputs are not available for website preview.",
      label: "Website output missing",
      severity: "warning",
    });
  }
  return problems.length > 0 ? problems : undefined;
}
export function resourceKeys(resourceId: string | undefined): string[] {
  if (!resourceId) return [];
  const trimmed = resourceId.trim();
  const numeric = trimmed.match(/(\d+)(?!.*\d)/)?.[1];
  return [...new Set([
    trimmed,
    trimmed.replace(/^resource:moodle:/, ""),
    numeric ?? "",
    numeric ? `resource:moodle:${numeric}` : "",
  ].filter(Boolean))];
}

function sortTaskGroups(groups: CourseInventoryResponse["taskGroups"]): CourseInventoryResponse["taskGroups"] {
  return [...groups].sort((a, b) => naturalCompare(a.title, b.title));
}

function sortInventoryNodes(nodes: CourseInventoryNode[]): CourseInventoryNode[] {
  return [...nodes].sort((a, b) => naturalCompare(a.name, b.name));
}

function visibleBoundaryItems<T>(items: T[], maxItems: number): T[] {
  if (items.length <= maxItems) return items;
  const first = items[0];
  const last = items.at(-1);
  return first && last && first !== last ? [first, last] : items.slice(0, 1);
}

function hiddenBoundaryItems<T>(items: T[], maxItems: number): T[] {
  if (items.length <= maxItems) return [];
  return items.slice(1, -1);
}

function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function titleRange(first?: string, last?: string): string {
  const firstNumber = extractTrailingNumber(first);
  const lastNumber = extractTrailingNumber(last);
  if (firstNumber && lastNumber) return `${firstNumber} ... ${lastNumber}`;
  if (first && last) return `${first} ... ${last}`;
  return first ?? last ?? "Middle items";
}

function extractTrailingNumber(value?: string): string | null {
  return value?.match(/(\d+)(?!.*\d)/)?.[1] ?? null;
}

function frameData({
  height,
  subtitle,
  title,
  variant = "group",
  width,
}: {
  height: number;
  subtitle: string;
  title: string;
  variant?: "group" | "stage";
  width: number;
}): BlueprintNodeData {
  return {
    detail: "Visual group for repeated pipeline items.",
    frame: { height, variant, width },
    inputs: [],
    meta: [],
    outputs: [],
    stepKind: "split",
    subtitle,
    title,
    tone: "process",
  };
}
