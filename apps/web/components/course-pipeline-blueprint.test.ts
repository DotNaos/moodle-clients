import { describe, expect, test } from "bun:test";

import { buildBlueprintGraph, type PipelineRunsResponse } from "@/components/course-pipeline-blueprint";
import { codexNodeData } from "@/components/course-pipeline-blueprint-node-data";
import { buildPipelineNodePreview } from "@/components/course-pipeline-node-preview";
import { buildUpstreamTrace } from "@/components/course-pipeline-trace";
import type { ExtractedDocumentsResponse } from "@/components/extracted-document-inspector";
import type { CourseInventoryResponse, StudyPipelineStatusResponse } from "@/components/study-pipeline-preview";
import type { TaskViewResponse } from "@/components/task-study-panel";

const inventory: CourseInventoryResponse = {
  artifactRoot: "study-pipeline/course-22584",
  courseId: "22584",
  generatedAt: "2026-06-13T07:00:00Z",
  interactions: [],
  lectureMaterial: [
    {
      bucket: "lecture_material",
      confidence: "high",
      id: "947700",
      name: "Teil 01 Skript",
      reason: "Script material",
      role: "script",
      sectionName: "Einführung",
      type: "pdf",
    },
  ],
  references: [],
  summary: {
    ambiguousTaskGroups: 0,
    ignoredAllowed: 0,
    interactions: 0,
    lectureMaterial: 1,
    missingSolutionGroups: 1,
    pairedTaskGroups: 1,
    references: 0,
    taskGroups: 2,
    totalResources: 3,
    unknown: 1,
  },
  taskGroups: [
    {
      id: "sheet-01",
      pairingConfidence: "high",
      pairingReason: "Sheet and solution numbers match.",
      pairingStatus: "paired",
      sheet: {
        bucket: "task_sheet",
        confidence: "high",
        id: "947711",
        name: "Aufgabenblatt 01",
        reason: "Task sheet",
        role: "sheet",
        sectionName: "Einführung",
        type: "pdf",
      },
      solution: {
        bucket: "solution",
        confidence: "high",
        id: "947712",
        name: "Aufgabenblatt 01 Lösung",
        reason: "Solution sheet",
        role: "solution",
        sectionName: "Einführung",
        type: "pdf",
      },
      title: "Aufgabenblatt 01",
    },
    {
      id: "sheet-02",
      pairingConfidence: "low",
      pairingReason: "No matching solution found.",
      pairingStatus: "missing_solution",
      sheet: {
        bucket: "task_sheet",
        confidence: "high",
        id: "947713",
        name: "Aufgabenblatt 02",
        reason: "Task sheet",
        role: "sheet",
        sectionName: "Einführung",
        type: "pdf",
      },
      title: "Aufgabenblatt 02",
    },
  ],
  unknown: [
    {
      bucket: "unknown",
      confidence: "low",
      id: "resource-unknown",
      name: "Unklarer Anhang",
      reason: "No confident bucket matched.",
      role: "unknown",
      sectionName: "Anhang",
      type: "pdf",
    },
  ],
};

const status: StudyPipelineStatusResponse = {
  courseId: "22584",
  createdAt: "2026-06-13T07:01:00Z",
  materials: [],
  missingSolutions: [],
  stage: "extracted",
  status: "running",
  summary: {
    linkedSolutions: 1,
    missingSolutions: 1,
    other: 0,
    scripts: 1,
    slides: 0,
    solutions: 1,
    tasks: 2,
    totalResources: 3,
  },
  taskLinks: [],
};

const runs: PipelineRunsResponse = {
  activeSelections: [
    {
      activeRunId: "run-extracted-ok",
      reason: "selected in course pipeline inspector",
      selectedAt: "2026-06-13T07:05:00Z",
      sourceId: "source:moodle-course:22584",
      stage: "extracted",
    },
  ],
  courseId: "22584",
  runs: [
    {
      artifactRoot: "study-pipeline/course-22584/run-raw",
      configHash: "config:raw:default",
      courseId: "22584",
      createdAt: "2026-06-13T07:02:00Z",
      engine: "moodle_api",
      id: "run-raw-ok",
      ownership: "shared",
      sourceId: "source:moodle-course:22584",
      stage: "raw",
      status: "succeeded",
    },
    {
      artifactRoot: "study-pipeline/course-22584/run-extracted",
      configHash: "config:extracted:default",
      courseId: "22584",
      createdAt: "2026-06-13T07:03:00Z",
      engine: "docling",
      id: "run-extracted-ok",
      ownership: "shared",
      sourceId: "source:moodle-course:22584",
      stage: "extracted",
      status: "succeeded",
    },
    {
      artifactRoot: "study-pipeline/course-22584/run-curated",
      configHash: "config:curated:default",
      courseId: "22584",
      createdAt: "2026-06-13T07:04:00Z",
      engine: "codex",
      error: "curation failed",
      id: "run-curated-failed",
      ownership: "user_owned",
      sourceId: "source:moodle-course:22584",
      stage: "curated",
      status: "failed",
    },
  ],
};

const resourceRuns: PipelineRunsResponse = {
  activeSelections: [
    {
      activeRunId: "run-extracted-sheet-01",
      reason: "selected in course pipeline inspector",
      resourceId: "resource:moodle:947711",
      selectedAt: "2026-06-13T07:05:00Z",
      sourceId: "source:moodle-course:22584",
      stage: "extracted",
    },
  ],
  courseId: "22584",
  runs: [
    {
      artifactRefs: [{ id: "ocr-1", kind: "ocr_text", metadata: { chars: 240, preview: "Extracted task text." } }],
      artifactRoot: "study-pipeline/course-22584/run-extracted-sheet-01",
      configHash: "config:extracted:docling:default",
      courseId: "22584",
      createdAt: "2026-06-13T07:03:00Z",
      engine: "docling",
      id: "run-extracted-sheet-01",
      ownership: "shared",
      resourceId: "resource:moodle:947711",
      sourceId: "source:moodle-course:22584",
      stage: "extracted",
      status: "succeeded",
    },
    {
      artifactRefs: [{ id: "ocr-solution-1", kind: "ocr_text", metadata: { chars: 140, preview: "Extracted solution text." } }],
      artifactRoot: "study-pipeline/course-22584/run-extracted-solution-01",
      configHash: "config:extracted:docling:default",
      courseId: "22584",
      createdAt: "2026-06-13T07:03:30Z",
      engine: "docling",
      id: "run-extracted-solution-01",
      ownership: "shared",
      resourceId: "resource:moodle:947712",
      sourceId: "source:moodle-course:22584",
      stage: "extracted",
      status: "succeeded",
    },
  ],
};

const extractedDocuments: ExtractedDocumentsResponse = {
  courseId: "22584",
  engine: "docling",
  generatedAt: "2026-06-13T07:04:00Z",
  runId: "run-extracted-sheet-01",
  summary: {
    embeddedImageAssets: 1,
    pagePreviewAssets: 1,
    totalBlocks: 2,
    totalDocuments: 1,
    totalPages: 1,
    unknownBlocks: 0,
  },
  documents: [
    {
      assets: [{ id: "img-1", kind: "image", mimeType: "image/png", pageNumber: 1, path: "/assets/img-1.png" }],
      diagnostics: {},
      engine: "docling",
      id: "document-947711",
      pages: [
        {
          blocks: [
            { id: "block-title", pageNumber: 1, text: "Aufgabe 1", type: "heading" },
            { assetId: "img-1", id: "block-image", pageNumber: 1, type: "image" },
          ],
          id: "page-1",
          pageNumber: 1,
          previewAssetId: "img-1",
        },
      ],
      resource: {
        id: "resource:moodle:947711",
        name: "Aufgabenblatt 01",
        type: "pdf",
      },
      runId: "run-extracted-sheet-01",
      status: "succeeded",
    },
    {
      assets: [],
      diagnostics: {},
      engine: "docling",
      id: "document-947712",
      pages: [
        {
          blocks: [
            { id: "solution-block-title", pageNumber: 1, text: "Lösung Aufgabe 1", type: "heading" },
          ],
          id: "solution-page-1",
          pageNumber: 1,
        },
      ],
      resource: {
        id: "resource:moodle:947712",
        name: "Aufgabenblatt 01 Lösung",
        type: "pdf",
      },
      runId: "run-extracted-solution-01",
      status: "succeeded",
    },
  ],
};

const taskView: TaskViewResponse = {
  courseId: "22584",
  generatedAt: "2026-06-13T07:06:00Z",
  progress: {
    checked: 0,
    correct: 0,
    done: 0,
    needsReview: 0,
    open: 1,
    wrong: 0,
  },
  resources: [{ kind: "PDF", resourceId: "947711", title: "Aufgabenblatt 01" }],
  scriptMarkdown: "",
  sheets: [
    {
      kind: "pipeline-task",
      resourceId: "947711",
      solutionResourceId: "947712",
      solutionTitle: "Aufgabenblatt 01 Lösung",
      tasks: [
        {
          parts: [],
          promptMarkdown: "Berechne die parallele Laufzeit mit \\(p\\) Prozessoren.",
          sourceResourceId: "947711",
          status: "open",
          taskId: "task-947711-1",
          title: "Aufgabe 1",
        },
      ],
      title: "Aufgabenblatt 01",
    },
  ],
  source: "moodle-services",
};

describe("course pipeline blueprint graph", () => {
  test("builds a blackbox conveyor graph from trace data", () => {
    const graph = buildBlueprintGraph({ extractedDocuments: null, inventory, runs, status, taskView: null });
    const titles = graph.nodes.map((node) => node.data.title);

    expect(titles).toContain("Course");
    expect(titles).toContain("Resource Set");
    expect(titles).toContain("Aufgabenblatt 01");
    expect(titles).toContain("Aufgabenblatt 02");
    expect(titles).toContain("Collect Pair");
    expect(titles).toContain("Codex Transform");
    expect(titles).toContain("Output 1");
    expect(titles).toContain("Output 2");
    expect(titles).toContain("Script Section 1");
    expect(titles).toContain("Review Collector");

    expect(graph.nodes.find((node) => node.id === "resource-set")?.data.stepKind).toBe("split");
    expect(graph.nodes.find((node) => node.data.title === "Collect Pair")?.data.stepKind).toBe("collect");
    expect(graph.nodes.find((node) => node.data.title === "Codex Transform")?.data.stepKind).toBe("transform");
    expect(graph.nodes.find((node) => node.data.title === "Output 2")?.data.problems?.map((problem) => problem.label)).toContain("Solution missing");
    const nodeTitles = new Map(graph.nodes.map((node) => [node.id, node.data.title]));
    const directTaskGroupToOutput = graph.edges.some((edge) => {
      const sourceTitle = nodeTitles.get(edge.source) ?? "";
      const targetTitle = nodeTitles.get(edge.target) ?? "";
      return sourceTitle.startsWith("Aufgabenblatt") && targetTitle.startsWith("Output");
    });
    expect(directTaskGroupToOutput).toBe(false);
    expect(graph.nodes.some((node) => node.data.tone === "warning")).toBe(true);
  });

  test("adds readable stage columns and keeps conveyor edges moving right", () => {
    const graph = buildBlueprintGraph({ extractedDocuments, inventory, runs: resourceRuns, status, taskView });
    const stageIds = [
      "stage-course",
      "stage-resources",
      "stage-groups",
      "stage-pdfs",
      "stage-pages",
      "stage-sections",
      "stage-extraction",
      "stage-collect",
      "stage-codex",
      "stage-output",
    ];
    const positions = new Map(graph.nodes.map((node) => [node.id, node.position.x]));

    for (const stageId of stageIds) {
      const stage = graph.nodes.find((node) => node.id === stageId);
      expect(stage?.type).toBe("frame");
      expect(stage?.data.frame?.variant).toBe("stage");
    }

    for (let index = 1; index < stageIds.length; index += 1) {
      expect(positions.get(stageIds[index]) ?? 0).toBeGreaterThan(positions.get(stageIds[index - 1]) ?? 0);
    }

    for (const edge of graph.edges) {
      expect(positions.get(edge.target) ?? 0).toBeGreaterThanOrEqual(positions.get(edge.source) ?? 0);
    }
  });

  test("keeps every blueprint node inspectable", () => {
    const graph = buildBlueprintGraph({ extractedDocuments, inventory, runs: resourceRuns, status, taskView });
    const inspectableNodes = graph.nodes.filter((node) => node.type === "blueprint");

    expect(inspectableNodes.length).toBeGreaterThan(0);
    for (const node of inspectableNodes) {
      expect(node.data.title.length).toBeGreaterThan(0);
      expect(node.data.subtitle.length).toBeGreaterThan(0);
      expect(node.data.detail.length).toBeGreaterThan(0);
      expect(node.data.status?.length ?? 0).toBeGreaterThan(0);
      expect(node.data.inputs.length).toBeGreaterThan(0);
      expect(node.data.outputs.length).toBeGreaterThan(0);
      expect(node.data.outputPreview?.length ?? 0).toBeGreaterThan(0);
      expect(Array.isArray(node.data.meta)).toBe(true);
    }
  });

  test("handles empty pipeline data without crashing", () => {
    const graph = buildBlueprintGraph({ extractedDocuments: null, inventory: null, runs: null, status: null, taskView: null });

    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.nodes.find((node) => node.id === "course")?.data.subtitle).toBe("0 resources");
    expect(graph.nodes.find((node) => node.id === "resource-set")?.data.status).toBe("missing");
    expect(graph.nodes.find((node) => node.id === "resource-set")?.data.problems?.[0]?.label).toBe("Inventory missing");
  });

  test("sorts repeated task groups naturally and keeps hidden groups inside the first lane", () => {
    const manyTaskGroups: CourseInventoryResponse = {
      ...inventory,
      summary: { ...inventory.summary, taskGroups: 12, pairedTaskGroups: 12, missingSolutionGroups: 0, totalResources: 24 },
      taskGroups: Array.from({ length: 12 }, (_, index) => {
        const number = index + 1;
        return {
          id: `sheet-${number}`,
          pairingConfidence: "high",
          pairingReason: "Sheet and solution numbers match.",
          pairingStatus: "paired" as const,
          sheet: {
            bucket: "task_sheet" as const,
            confidence: "high" as const,
            id: `sheet-${number}`,
            name: `Aufgabenblatt ${number}`,
            reason: "Task sheet",
            role: "sheet" as const,
            sectionName: "Einführung",
            type: "pdf",
          },
          solution: {
            bucket: "solution" as const,
            confidence: "high" as const,
            id: `solution-${number}`,
            name: `Aufgabenblatt ${number} Lösung`,
            reason: "Solution sheet",
            role: "solution" as const,
            sectionName: "Einführung",
            type: "pdf",
          },
          title: `Aufgabenblatt ${number}`,
        };
      }).reverse(),
    };

    const graph = buildBlueprintGraph({ extractedDocuments: null, inventory: manyTaskGroups, runs: null, status, taskView: null });
    const titles = graph.nodes.map((node) => node.data.title);

    expect(titles).toContain("Aufgabenblatt 1");
    expect(titles).not.toContain("Aufgabenblatt 12");
    expect(titles).not.toContain("Aufgabenblatt 10");
    expect(titles).not.toContain("2 ... 11 collapsed");

    const firstTaskGroup = graph.nodes.find((node) => node.data.title === "Aufgabenblatt 1");
    expect(firstTaskGroup?.data.hiddenItems).toHaveLength(11);
    expect(firstTaskGroup?.data.hiddenItems?.[0]).toBe("Aufgabenblatt 2");
    expect(firstTaskGroup?.data.hiddenItems?.at(-1)).toBe("Aufgabenblatt 12");
  });

  test("does not project global runs onto resource-specific extraction nodes", () => {
    const graph = buildBlueprintGraph({ extractedDocuments: null, inventory, runs, status, taskView: null });
    const sheetExtraction = graph.nodes.find((node) =>
      node.data.title === "Extraction Variants"
      && node.data.meta.some((item) => item.label === "Resource" && item.value === "Aufgabenblatt 01")
    );

    expect(sheetExtraction?.data.status).toBe("missing");
    expect(sheetExtraction?.data.problems?.map((problem) => problem.label)).toContain("No extraction run");
  });

  test("attaches OCR engine variants to resource extraction nodes", () => {
    const graph = buildBlueprintGraph({ extractedDocuments, inventory, runs: resourceRuns, status, taskView });
    const sheetExtraction = graph.nodes.find((node) => node.id === "task-group-sheet-01-sheet-extraction");
    const variants = sheetExtraction?.data.extractionVariants ?? [];

    expect(variants.map((variant) => variant.engine)).toEqual(["pdftotext", "docling", "marker"]);
    expect(variants.find((variant) => variant.engine === "docling")?.status).toBe("active");
    expect(variants.find((variant) => variant.engine === "docling")?.chars).toBe(240);
    expect(variants.find((variant) => variant.engine === "pdftotext")?.status).toBe("missing");
    expect(variants.find((variant) => variant.engine === "marker")?.status).toBe("missing");
  });

  test("auto-discovers markdown fields in structured node body data", () => {
    const preview = buildPipelineNodePreview({
      title: "Generic Markdown Node",
      subtitle: "typed body",
      detail: "No explicit renderedFields are needed when body fields are typed by name.",
      bodyData: {
        output: {
          contentMarkdown: "## Render me\n\nThis must not stay raw JSON.",
        },
      },
      inputs: [],
      outputs: [],
      stepKind: "transform",
      tone: "process",
      meta: [],
    });

    expect(preview.kind).toBe("mixed");
    if (preview.kind !== "mixed") throw new Error("Expected mixed preview");
    expect(preview.fields[0]?.path).toBe("output.contentMarkdown");
    expect(preview.fields[0]?.value).toContain("Render me");
    expect(preview.jsonText).not.toContain("contentMarkdown");
    expect(preview.jsonText).not.toContain("Render me");
  });

  test("renders extracted document markdown and image assets from structured data", () => {
    const extractedDocumentsWithUnusedImage: ExtractedDocumentsResponse = {
      ...extractedDocuments,
      documents: extractedDocuments.documents.map((document) => {
        if (document.id !== "document-947711") return document;
        return {
          ...document,
          assets: [
            ...document.assets,
            { id: "img-unused", kind: "image", mimeType: "image/png", pageNumber: 1, path: "/assets/unused.png" },
          ],
          diagnostics: {
            ...document.diagnostics,
            unusedImageAssets: ["img-unused"],
          },
        };
      }),
    };
    const graph = buildBlueprintGraph({ extractedDocuments: extractedDocumentsWithUnusedImage, inventory, runs: resourceRuns, status, taskView });
    const sheetExtraction = graph.nodes.find((node) => node.id === "task-group-sheet-01-sheet-extraction");
    if (!sheetExtraction || sheetExtraction.type !== "blueprint") throw new Error("Extraction node missing");

    const preview = buildPipelineNodePreview(sheetExtraction.data);

    expect(preview.kind).toBe("mixed");
    if (preview.kind !== "mixed") throw new Error("Expected mixed preview");
    expect(preview.fields.map((field) => field.path)).toContain("document.contentMarkdown");
    const content = preview.fields.find((field) => field.path === "document.contentMarkdown")?.value ?? "";
    expect(content).toContain("Aufgabe 1");
    expect(content).toContain("/api/study-pipeline/courses/22584/study-pipeline/extracted-asset?path=");
    expect(content).toContain("%2Fassets%2Fimg-1.png");
    expect(content).toContain("%2Fassets%2Funused.png");
    expect(preview.jsonText).not.toContain("contentMarkdown");
    expect(sheetExtraction.data.problems?.map((problem) => problem.label) ?? []).not.toContain("Unused images");
  });

  test("shows live running extraction work on the affected resource node", () => {
    const runningRuns: PipelineRunsResponse = {
      ...resourceRuns,
      runs: [
        ...resourceRuns.runs,
        {
          artifactRefs: [],
          artifactRoot: "study-pipeline/course-22584/run-extracted-sheet-01-running",
          configHash: "config:extracted:marker:default",
          courseId: "22584",
          createdAt: "2026-06-13T07:10:00Z",
          engine: "marker",
          id: "run-extracted-sheet-01-running",
          logs: ["rendering page previews"],
          ownership: "shared",
          resourceId: "resource:moodle:947711",
          sourceId: "source:moodle-course:22584",
          stage: "extracted",
          startedAt: "2026-06-13T07:09:30Z",
          status: "running",
        },
      ],
    };
    const graph = buildBlueprintGraph({ extractedDocuments, inventory, runs: runningRuns, status, taskView });
    const sheetExtraction = graph.nodes.find((node) => node.id === "task-group-sheet-01-sheet-extraction");

    expect(sheetExtraction?.data.status).toBe("running");
    expect(sheetExtraction?.data.live?.status).toBe("running");
    expect(sheetExtraction?.data.live?.current).toBe(true);
    expect(sheetExtraction?.data.evidence).toContain("log: rendering page previews");
    expect(sheetExtraction?.data.problems?.map((problem) => problem.label) ?? []).not.toContain("No artifacts");
  });

  test("attaches failed run diagnostics to the affected node", () => {
    const failedRuns: PipelineRunsResponse = {
      ...resourceRuns,
      runs: [
        ...resourceRuns.runs,
        {
          artifactRefs: [],
          artifactRoot: "study-pipeline/course-22584/run-extracted-sheet-01-failed",
          configHash: "config:extracted:docling:default",
          courseId: "22584",
          createdAt: "2026-06-13T07:11:00Z",
          diagnostics: [{ code: "ocr.page_failed", level: "error", message: "Page 2 could not be parsed." }],
          engine: "docling",
          error: "Extraction failed after page parsing.",
          id: "run-extracted-sheet-01-failed",
          ownership: "shared",
          resourceId: "resource:moodle:947711",
          sourceId: "source:moodle-course:22584",
          stage: "extracted",
          startedAt: "2026-06-13T07:10:30Z",
          status: "failed",
        },
      ],
    };
    const graph = buildBlueprintGraph({ extractedDocuments, inventory, runs: failedRuns, status, taskView });
    const sheetExtraction = graph.nodes.find((node) => node.id === "task-group-sheet-01-sheet-extraction");
    const problemLabels = sheetExtraction?.data.problems?.map((problem) => problem.label) ?? [];

    expect(sheetExtraction?.data.status).toBe("failed");
    expect(sheetExtraction?.data.live?.status).toBe("failed");
    expect(problemLabels).toContain("Run failed");
    expect(problemLabels).toContain("Run diagnostic");
    expect(sheetExtraction?.data.evidence).toContain("error: Page 2 could not be parsed.");
  });

  test("uses real extracted documents and task-view outputs when available", () => {
    const graph = buildBlueprintGraph({ extractedDocuments, inventory, runs: resourceRuns, status, taskView });
    const pageNode = graph.nodes.find((node) =>
      node.data.title === "Pages"
      && node.data.meta.some((item) => item.label === "Resource" && item.value === "Aufgabenblatt 01")
    );
    const sectionNode = graph.nodes.find((node) =>
      node.data.title === "Sections"
      && node.data.meta.some((item) => item.label === "Resource" && item.value === "Aufgabenblatt 01")
    );
    const outputNode = graph.nodes.find((node) => node.data.title === "Aufgabe 1");

    expect(pageNode?.data.status).toBe("succeeded");
    expect(pageNode?.data.meta.find((item) => item.label === "Stored count")?.value).toBe("1");
    expect(sectionNode?.data.meta.find((item) => item.label === "Stored count")?.value).toBe("2");
    expect(outputNode?.data.status).toBe("needs_review");
    expect(outputNode?.data.outputPreview).toContain("parallele Laufzeit");
  });

  test("builds mixed previews with rendered fields and raw task data", () => {
    const taskViewWithTraceLines: TaskViewResponse = {
      ...taskView,
      sheets: taskView.sheets.map((sheet) => ({
        ...sheet,
        tasks: sheet.tasks.map((task) => ({
          ...task,
          promptMarkdown: [
            "---",
            "status: codex-improved",
            "ai_used: true",
            "---",
            "Source: [Moodle resource](moodle-resource:947711)",
            "## Aufgabe 1",
            "Berechne die parallele Laufzeit mit \\(p\\) Prozessoren.",
          ].join("\n"),
        })),
      })),
    };
    const graph = buildBlueprintGraph({ extractedDocuments, inventory, runs: resourceRuns, status, taskView: taskViewWithTraceLines });
    const outputNode = graph.nodes.find((node) => node.data.title === "Aufgabe 1");
    if (!outputNode || outputNode.type !== "blueprint") throw new Error("Output node missing");

    const preview = buildPipelineNodePreview(outputNode.data);

    expect(preview.kind).toBe("mixed");
    if (preview.kind !== "mixed") throw new Error("Expected mixed preview");
    expect(preview.fields[0]?.path).toBe("outputs[0].promptMarkdown");
    expect(preview.fields[0]?.value).toContain("Berechne die parallele Laufzeit");
    expect(preview.fields[0]?.value).not.toContain("Source:");
    expect(preview.fields[0]?.value).not.toContain("codex-improved");
    expect(preview.jsonText).toContain('"taskId"');
    expect(preview.jsonText).toContain('"sourceResourceId"');
    expect(preview.jsonText).not.toContain('"promptMarkdown"');
    expect(preview.jsonText).not.toContain("codex-improved");
  });

  test("renders Codex output previews as typed fields when the output is materialized", () => {
    const data = codexNodeData({
      activeRunIds: new Set(),
      hasMaterializedOutput: true,
      inputLabel: "Aufgabenblatt 1",
      outputLabel: "task draft[]",
      outputPreview: [
        "Aufgabenblatt 01",
        "---",
        "status: codex-improved",
        "ai_used: true",
        "---",
        "# Aufgabenblatt 01",
        "Source: [Moodle resource](moodle-resource:947711)",
        "## Aufgabe 1",
        "Die Schönauer-Vektortriade",
        "x".repeat(420),
        "FULL_CONTENT_MARKER_AFTER_400_CHARS",
      ].join("\n"),
      run: null,
      subtitle: "task transform",
    });

    const preview = buildPipelineNodePreview(data);

    expect(preview.kind).toBe("mixed");
    if (preview.kind !== "mixed") throw new Error("Expected mixed preview");
    expect(preview.fields[0]?.path).toBe("output.contentMarkdown");
    expect(preview.fields[0]?.value).toContain("Die Schönauer-Vektortriade");
    expect(preview.fields[0]?.value).toContain("FULL_CONTENT_MARKER_AFTER_400_CHARS");
    expect(preview.fields[0]?.value).not.toContain("Source:");
    expect(preview.fields[0]?.value).not.toContain("codex-improved");
    expect(preview.jsonText).toContain('"type": "codex_transform"');
    expect(preview.jsonText).toContain('"hasMaterializedOutput"');
    expect(preview.jsonText).not.toContain('"contentMarkdown"');
    expect(preview.jsonText).not.toContain("codex-improved");
    expect(preview.jsonText).not.toContain("FULL_CONTENT_MARKER_AFTER_400_CHARS");
  });

  test("treats extracted documents as usable pipeline input even when run records are missing", () => {
    const extractedDocumentsWithScript: ExtractedDocumentsResponse = {
      ...extractedDocuments,
      documents: [
        ...extractedDocuments.documents,
        {
          assets: [],
          diagnostics: {},
          engine: "docling",
          id: "document-947700",
          pages: [
            {
              blocks: [{ id: "script-heading", pageNumber: 1, text: "Einführung", type: "heading" }],
              id: "script-page-1",
              pageNumber: 1,
            },
          ],
          resource: {
            id: "resource:moodle:947700",
            name: "Teil 01 Skript",
            type: "pdf",
          },
          runId: "run-extracted-script-01",
          status: "succeeded",
        },
      ],
      summary: {
        ...extractedDocuments.summary,
        totalBlocks: extractedDocuments.summary.totalBlocks + 1,
        totalDocuments: extractedDocuments.summary.totalDocuments + 1,
        totalPages: extractedDocuments.summary.totalPages + 1,
      },
    };
    const graph = buildBlueprintGraph({ extractedDocuments: extractedDocumentsWithScript, inventory, runs: null, status, taskView });
    const collectNode = graph.nodes.find((node) => node.id === "task-group-sheet-01-collect");
    const codexNode = graph.nodes.find((node) => node.id === "task-group-sheet-01-codex");
    const selectedScriptNode = graph.nodes.find((node) => node.id === "script-947700-selected");

    expect(collectNode?.data.status).toBe("ready");
    expect(collectNode?.data.problems?.map((problem) => problem.label) ?? []).not.toContain("Sheet extraction missing");
    expect(collectNode?.data.problems?.map((problem) => problem.label) ?? []).not.toContain("Solution extraction missing");
    expect(codexNode?.data.status).toBe("ready");
    expect(codexNode?.data.tone).toBe("output");
    expect(selectedScriptNode?.data.status).not.toBe("missing");
  });

  test("marks extracted images that disappeared from final task output", () => {
    const graph = buildBlueprintGraph({ extractedDocuments, inventory, runs: resourceRuns, status, taskView });
    const outputNode = graph.nodes.find((node) => node.data.title === "Aufgabe 1");
    const problem = outputNode?.data.problems?.find((item) => item.label === "Extracted image missing from output");

    expect(outputNode?.data.status).toBe("needs_review");
    expect(problem?.detail).toContain("img-1");
    expect(problem?.detail).toContain("page 1");
    expect(problem?.detail).toContain("Aufgabenblatt 01");
    expect(outputNode?.data.evidence).toContain("1 extracted source image block checked");
    expect(outputNode?.data.evidence).toContain("0 final output image references found");
    expect(outputNode?.data.meta.find((item) => item.label === "Missing source images")?.value).toBe("1");
  });

  test("does not mark extracted images as lost when the final task references the asset", () => {
    const taskViewWithImage: TaskViewResponse = {
      ...taskView,
      sheets: taskView.sheets.map((sheet) => ({
        ...sheet,
        tasks: sheet.tasks.map((task) => ({
          ...task,
          promptMarkdown: `${task.promptMarkdown}\n\n![Diagramm](/assets/img-1.png)`,
        })),
      })),
    };
    const graph = buildBlueprintGraph({ extractedDocuments, inventory, runs: resourceRuns, status, taskView: taskViewWithImage });
    const outputNode = graph.nodes.find((node) => node.data.title === "Aufgabe 1");
    const problemLabels = outputNode?.data.problems?.map((problem) => problem.label) ?? [];

    expect(problemLabels).not.toContain("Extracted image missing from output");
    expect(outputNode?.data.evidence).toContain("1 final output image reference found");
    expect(outputNode?.data.meta.find((item) => item.label === "Missing source images")?.value).toBe("0");
  });

  test("traces a final task output back to its source documents", () => {
    const graph = buildBlueprintGraph({ extractedDocuments, inventory, runs: resourceRuns, status, taskView });
    const outputNode = graph.nodes.find((node) => node.data.title === "Aufgabe 1");
    const trace = buildUpstreamTrace({ edges: graph.edges, nodes: graph.nodes, selectedNodeId: outputNode?.id });
    const titles = trace.map((step) => step.title);

    expect(trace[0]?.title).toBe("Aufgabe 1");
    expect(new Set(trace.map((step) => step.id)).size).toBe(trace.length);
    for (const title of [
      "Aufgabe 1",
      "Codex Transform",
      "Collect Pair",
      "Extraction Variants",
      "Sections",
      "Pages",
      "Sheet PDF",
      "Solution PDF",
      "Aufgabenblatt 01",
      "Resource Set",
      "Course",
    ]) {
      expect(titles).toContain(title);
    }
    expect(trace.filter((step) => step.title === "Extraction Variants")).toHaveLength(2);
    expect(trace.at(-1)?.title).toBe("Course");
  });

  test("marks final outputs with website rendering problems as needs review", () => {
    const brokenTaskView: TaskViewResponse = {
      ...taskView,
      sheets: taskView.sheets.map((sheet) => ({
        ...sheet,
        tasks: sheet.tasks.map((task) => ({
          ...task,
          promptMarkdown: [
            "Source task: [extracted task](../.extracted/tasks/01.md)",
            "## Aufgabe 1",
            "Berechne \\(p Prozessoren.",
            "![diagram](../.extracted/images/missing.png)",
            "Kaputte Zeichen: Ã¼",
          ].join("\n"),
          status: "open",
        })),
      })),
    };
    const graph = buildBlueprintGraph({ extractedDocuments, inventory, runs: resourceRuns, status, taskView: brokenTaskView });
    const outputNode = graph.nodes.find((node) => node.data.title === "Aufgabe 1");
    const problemLabels = outputNode?.data.problems?.map((problem) => problem.label) ?? [];

    expect(outputNode?.data.status).toBe("needs_review");
    expect(outputNode?.data.tone).toBe("warning");
    expect(problemLabels).toContain("Pipeline artifact visible");
    expect(problemLabels).toContain("Internal image path");
    expect(problemLabels).toContain("Encoding problem");
    expect(problemLabels).toContain("LaTeX delimiter problem");
    expect(outputNode?.data.meta.find((item) => item.label === "Website validation")?.value).toBe("4 problems");
  });
});
