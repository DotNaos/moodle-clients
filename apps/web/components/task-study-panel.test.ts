// @ts-nocheck
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ExtractedDetailsPanel } from "@/components/extracted-document-details";
import { buildExtractedFormulaCollection, buildFormulaSourceExcerpt } from "@/components/formula-collection-panel";
import { groupScriptSections, groupStudyTasksBySection, groupStudyTasksBySheet, TaskOutline } from "@/components/course-study-outline";
import { buildBlockTypeSummary, documentDiagnosticCounts } from "@/components/extracted-document-inspector";
import { buildInventorySections, buildStudyPipelinePreviewSections, StudyPipelinePreview } from "@/components/study-pipeline-preview";
import { ScriptReader, buildScriptPDFMapping, extractScriptSections, normalizeTaskViewForDisplay, renderScriptMarkdownHTML, splitScriptChapters } from "@/components/task-study-panel";
import {
  buildDashboardRouteURL,
  dashboardRouteFromInput,
  dashboardRoutesEqual,
  parseDashboardRoute,
  parseDashboardRouteSearch,
} from "@/lib/dashboard-route";
import { renderFormulaMarkdownHTML } from "@/lib/formula-renderer";
import { buildStudyOutlineFromTaskView } from "@/lib/study-outline";

const scriptMarkdown = [
  "# Course Script",
  "",
  "# 1. General Remarks and Motivation",
  "",
  "Source: [Teil 01](moodle-resource:teil-01)",
  "",
  "## 1.1 Organisation and Examination",
  "",
  "Source: [Teil 01](moodle-resource:teil-01)",
  "",
  "## 1.2 Course Content",
  "",
  "Source: [Teil 01](moodle-resource:teil-01)",
  "",
  "# 2. From Bits and Bytes to Cache and Cores",
  "",
  "Source: [Teil 02](moodle-resource:teil-02)",
  "",
  "## 2.1 Arithmetic-Logical Unit (ALU)",
  "",
  "Source: [Teil 02](moodle-resource:teil-02)",
].join("\n");

describe("script outline", () => {
  test("groups numbered child sections under their main section", () => {
    const sections = extractScriptSections(scriptMarkdown);
    const groups = groupScriptSections(sections);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.parent.title).toBe("1. General Remarks and Motivation");
    expect(groups[0]?.children.map((section) => section.title)).toEqual([
      "1.1 Organisation and Examination",
      "1.2 Course Content",
    ]);
    expect(groups[1]?.parent.title).toBe("2. From Bits and Bytes to Cache and Cores");
    expect(groups[1]?.children.map((section) => section.title)).toEqual([
      "2.1 Arithmetic-Logical Unit (ALU)",
    ]);
  });
});

describe("task outline", () => {
  test("keeps desktop task navigation grouped by worksheet", () => {
    const groups = groupStudyTasksBySheet([
      { id: "sheet-01-task-1", sheetTitle: "Aufgabenblatt 01", status: "open", title: "Aufgabe 1" },
      { id: "sheet-01-task-2", sheetTitle: "Aufgabenblatt 01", status: "open", title: "Aufgabe 2" },
      { id: "sheet-02-task-1", sheetTitle: "Aufgabenblatt 02", status: "open", title: "Aufgabe 1" },
    ]);

    expect(groups).toEqual([
      {
        sheetTitle: "Aufgabenblatt 01",
        tasks: [
          { id: "sheet-01-task-1", sheetTitle: "Aufgabenblatt 01", status: "open", title: "Aufgabe 1" },
          { id: "sheet-01-task-2", sheetTitle: "Aufgabenblatt 01", status: "open", title: "Aufgabe 2" },
        ],
      },
      {
        sheetTitle: "Aufgabenblatt 02",
        tasks: [
          { id: "sheet-02-task-1", sheetTitle: "Aufgabenblatt 02", status: "open", title: "Aufgabe 1" },
        ],
      },
    ]);
  });

  test("sorts worksheets naturally and groups them by Moodle section when available", () => {
    const groups = groupStudyTasksBySheet([
      { id: "sheet-12", sectionTitle: "Ausblick", sheetTitle: "Aufgabenblatt 12", status: "open", title: "Aufgabenblatt 12" },
      { id: "sheet-01", sectionTitle: "Einführung", sheetTitle: "Aufgabenblatt 01", status: "open", title: "Aufgabenblatt 01" },
      { id: "sheet-03", sectionTitle: "Netztopologien", sheetTitle: "Aufgabenblatt 03", status: "open", title: "Aufgabenblatt 03" },
      { id: "sheet-02", sectionTitle: "Einführung", sheetTitle: "Aufgabenblatt 02", status: "open", title: "Aufgabenblatt 02" },
    ]);

    expect(groups.map((group) => [group.sheetTitle, group.tasks.map((task) => task.sheetTitle)])).toEqual([
      ["Einführung", ["Aufgabenblatt 01", "Aufgabenblatt 02"]],
      ["Netztopologien", ["Aufgabenblatt 03"]],
      ["Ausblick", ["Aufgabenblatt 12"]],
    ]);
  });

  test("builds section groups with worksheets and their child tasks", () => {
    const groups = groupStudyTasksBySection([
      { id: "sheet-02-task-2", sectionTitle: "Einführung", sheetTitle: "Aufgabenblatt 02", status: "open", title: "Aufgabe 2" },
      { id: "sheet-01-task-1", sectionTitle: "Einführung", sheetTitle: "Aufgabenblatt 01", status: "done", title: "Aufgabe 1" },
      { id: "sheet-02-task-1", sectionTitle: "Einführung", sheetTitle: "Aufgabenblatt 02", status: "open", title: "Aufgabe 1" },
    ]);

    expect(groups).toEqual([
      {
        title: "Einführung",
        sheets: [
          {
            title: "Aufgabenblatt 01",
            tasks: [
              { id: "sheet-01-task-1", sectionTitle: "Einführung", sheetTitle: "Aufgabenblatt 01", status: "done", title: "Aufgabe 1" },
            ],
          },
          {
            title: "Aufgabenblatt 02",
            tasks: [
              { id: "sheet-02-task-1", sectionTitle: "Einführung", sheetTitle: "Aufgabenblatt 02", status: "open", title: "Aufgabe 1" },
              { id: "sheet-02-task-2", sectionTitle: "Einführung", sheetTitle: "Aufgabenblatt 02", status: "open", title: "Aufgabe 2" },
            ],
          },
        ],
      },
    ]);
  });

  test("builds the overview outline with Moodle chapter names from task-view", () => {
    const outline = buildStudyOutlineFromTaskView({
      sheets: [
        {
          sectionName: "Einführung",
          title: "Aufgabenblatt 01",
          tasks: [{ status: "open", taskId: "task-01", title: "Aufgabenblatt 01" }],
        },
        {
          sectionName: "Netztopologien",
          title: "Aufgabenblatt 03",
          tasks: [{ sectionName: "Netztopologien", status: "open", taskId: "task-03-1", title: "Aufgabe 1" }],
        },
      ],
    });

    expect(groupStudyTasksBySection(outline.tasks).map((group) => group.title)).toEqual([
      "Einführung",
      "Netztopologien",
    ]);
  });
});

describe("study pipeline preview", () => {
  test("renders the normal request state without pipeline internals", () => {
    const html = renderToStaticMarkup(React.createElement(StudyPipelinePreview, {
      course: { id: 22584, fullname: "High Performance Computing" },
      extractedDocuments: null,
      extractedError: null,
      extractedLoading: false,
      inventory: null,
      inventoryError: null,
      inventoryLoading: false,
      loading: false,
      mode: "tasks",
      onLoadExtractedDocuments: () => undefined,
      onRefreshInventory: () => undefined,
      onRunStage: () => undefined,
      runningStage: null,
      status: null,
    }));

    expect(html).toContain("Aufgaben anfordern");
    expect(html).toContain("Problem melden");
    expect(html).toContain("Status anschauen");
    expect(html).toContain("Noch nicht gestartet");
    expect(html).not.toContain("Kurs-Mapping");
    expect(html).not.toContain("Erweiterte Schritte");
    expect(html).not.toContain("PDF-/Block-Inspector");
  });

  test("groups resources by section and highlights task solution links", () => {
    const sections = buildStudyPipelinePreviewSections({
      courseId: "22584",
      createdAt: "2026-06-11T08:00:00.000Z",
      missingSolutions: [],
      stage: "",
      status: "planned",
      summary: {
        linkedSolutions: 1,
        missingSolutions: 0,
        other: 0,
        scripts: 1,
        slides: 1,
        solutions: 1,
        tasks: 1,
        totalResources: 3,
      },
      materials: [
        { id: "teil-01", name: "Teil 01", sectionId: "s1", sectionName: "Teil 01", type: "slide" },
        { id: "task-01", name: "Aufgabenblatt 01", sectionId: "s1", sectionName: "Teil 01", type: "task" },
        { id: "solution-01", name: "Aufgabenblatt 01 Lösung", sectionId: "s1", sectionName: "Teil 01", type: "solution" },
      ],
      taskLinks: [
        {
          status: "linked",
          task: { id: "task-01", name: "Aufgabenblatt 01", type: "task" },
          solution: { id: "solution-01", name: "Aufgabenblatt 01 Lösung", type: "solution" },
        },
      ],
    });

    expect(sections).toHaveLength(1);
    expect(sections[0]?.name).toBe("Teil 01");
    expect(sections[0]?.items.map((item) => [item.name, item.kind])).toEqual([
      ["Teil 01", "slide"],
      ["Aufgabenblatt 01", "task"],
      ["Aufgabenblatt 01 Lösung", "solution"],
    ]);
  });

  test("builds inventory bucket sections with task groups and classification buckets", () => {
    const sections = buildInventorySections({
      courseId: "22584",
      generatedAt: "2026-06-12T08:00:00.000Z",
      summary: {
        ambiguousTaskGroups: 0,
        interactions: 1,
        lectureMaterial: 1,
        missingSolutionGroups: 1,
        pairedTaskGroups: 1,
        references: 1,
        taskGroups: 2,
        totalResources: 5,
        ignoredAllowed: 1,
        unknown: 1,
      },
      lectureMaterial: [{ id: "teil-01", name: "Teil 01", bucket: "lecture_material", confidence: "high", reason: "", role: "lecture_source", type: "slide" }],
      taskGroups: [
        {
          id: "sheet-01",
          title: "Aufgabenblatt 01",
          pairingConfidence: "high",
          pairingReason: "same normalized sheet number",
          pairingStatus: "paired",
          sheet: { id: "task-01", name: "Aufgabenblatt 01", bucket: "assignment_sheet", confidence: "high", reason: "title contains Aufgabenblatt 01", role: "assignment_sheet", type: "pdf" },
          solution: { id: "solution-01", name: "Aufgabenblatt 01 Lösung", bucket: "solution_pdf", confidence: "high", reason: "title contains Lösung", role: "solution_pdf", type: "pdf" },
        },
        {
          id: "sheet-09",
          title: "Aufgabenblatt 09",
          pairingConfidence: "high",
          pairingReason: "no matching solution PDF found",
          pairingStatus: "missing_solution",
          sheet: { id: "task-09", name: "Aufgabenblatt 09", bucket: "assignment_sheet", confidence: "high", reason: "title contains Aufgabenblatt 09", role: "assignment_sheet", type: "pdf" },
        },
      ],
      references: [{ id: "modul", name: "Modulbeschreibung", bucket: "reference", confidence: "medium", reason: "", role: "course_reference", type: "other" }],
      interactions: [{ id: "forum", name: "Forum", bucket: "interaction", confidence: "medium", reason: "", role: "course_interaction", type: "other" }],
      ignoredAllowed: [{ id: "zoom", name: "Zoom Link", bucket: "ignored_allowed", confidence: "medium", reason: "external meeting tool", role: "interaction", type: "external_tool" }],
      unknown: [{ id: "unknown", name: "Extern", bucket: "unknown", confidence: "low", reason: "", role: "unknown", type: "other" }],
    });

    expect(sections.map((section) => [section.id, section.items.map((item) => item.name)])).toEqual([
      ["lecture", ["Teil 01"]],
      ["assignments", ["Aufgabenblatt 01", "Aufgabenblatt 09"]],
      ["solutions", ["Aufgabenblatt 01 Lösung"]],
      ["references", ["Modulbeschreibung"]],
      ["interactions", ["Forum"]],
      ["ignored", ["Zoom Link"]],
      ["unknown", ["Extern"]],
    ]);
  });
});

describe("extracted document inspector", () => {
  test("summarizes recognized block types and diagnostic counts", () => {
    const document = {
      id: "doc-task-01",
      engine: "docling",
      runId: "run-01",
      status: "extracted",
      resource: { id: "task-01", name: "Aufgabenblatt 01", type: "task" },
      assets: [
        { id: "img-1", kind: "image", pageNumber: 1, path: "/artifacts/img-1.png" },
        { id: "img-2", kind: "image", pageNumber: 2, path: "/artifacts/img-2.png" },
      ],
      diagnostics: {
        extractedImageAssets: ["img-1", "img-2"],
        pagesMissingText: [2],
        unknownBlocks: ["b-4"],
        unusedImageAssets: ["img-2"],
        visualOnlyPages: [2],
        warnings: ["Page 2 only has visual content."],
      },
      pages: [
        {
          id: "page-1",
          pageNumber: 1,
          blocks: [
            { id: "b-1", pageNumber: 1, text: "Aufgabe 1", type: "heading" },
            { id: "b-2", pageNumber: 1, text: "Berechnen Sie ...", type: "paragraph" },
            { id: "b-3", assetId: "img-1", pageNumber: 1, type: "image" },
          ],
        },
        {
          id: "page-2",
          pageNumber: 2,
          blocks: [
            { id: "b-4", pageNumber: 2, text: "???", type: "unknown" },
            { id: "b-5", pageNumber: 2, text: "Hinweis", type: "paragraph" },
          ],
        },
      ],
    };

    expect(buildBlockTypeSummary([document])).toEqual([
      { type: "paragraph", count: 2 },
      { type: "heading", count: 1 },
      { type: "image", count: 1 },
      { type: "unknown", count: 1 },
    ]);
    expect(documentDiagnosticCounts(document)).toEqual({
      extractedImages: 2,
      missingPages: 1,
      unknownBlocks: 1,
      unusedImages: 1,
      visualOnlyPages: 1,
      warnings: 1,
    });
  });

  test("renders selected block details with image asset references", () => {
    const asset = {
      id: "img-1",
      kind: "embedded_image",
      mimeType: "image/png",
      pageNumber: 1,
      path: "/srv/moodle-study/courses/22584/extracted/runs/run-1/assets/image.png",
      role: "diagram",
    };
    const block = {
      assetId: "img-1",
      id: "block-image-1",
      label: "diagram",
      pageNumber: 1,
      source: "extracted_image",
      type: "image",
    };
    const html = renderToStaticMarkup(React.createElement(ExtractedDetailsPanel, {
      assetsById: new Map([[asset.id, asset]]),
      courseId: "22584",
      document: {
        assets: [asset],
        diagnostics: { unusedImageAssets: [] },
        engine: "docling",
        id: "doc-1",
        pages: [{ blocks: [block], id: "page-1", pageNumber: 1, previewAssetId: "img-1" }],
        resource: { id: "947711", name: "Aufgabenblatt 01", type: "task" },
        runId: "run-1",
        status: "machine-extracted",
      },
      page: { blocks: [block], id: "page-1", pageNumber: 1, previewAssetId: "img-1" },
      selectedBlock: block,
    }));

    expect(html).toContain("Block details");
    expect(html).toContain("block-image-1");
    expect(html).toContain("Selected asset");
    expect(html).toContain("/api/study-pipeline/courses/22584/study-pipeline/extracted-asset?path=");
    expect(html).toContain("image.png");
  });
});

describe("script PDF mapping", () => {
  test("keeps each PDF once in script order and records covered areas", () => {
    const mapping = buildScriptPDFMapping(scriptMarkdown, [
      { resourceId: "teil-01", title: "Teil 01", kind: "PDF" },
      { resourceId: "teil-02", title: "Teil 02", kind: "PDF" },
    ]);

    expect(mapping.map((item) => item.title)).toEqual(["Teil 01", "Teil 02"]);
    expect(mapping[0]?.areas).toEqual([
      "1. General Remarks and Motivation",
      "1.1 Organisation and Examination",
      "1.2 Course Content",
    ]);
    expect(mapping[1]?.areas).toEqual([
      "2. From Bits and Bytes to Cache and Cores",
      "2.1 Arithmetic-Logical Unit (ALU)",
    ]);
  });

  test("does not duplicate an area when the same PDF is cited repeatedly in one section", () => {
    const mapping = buildScriptPDFMapping([
      "# 1. General Remarks and Motivation",
      "",
      "Source: [Teil 01](moodle-resource:teil-01)",
      "",
      "Source: [Teil 01](moodle-resource:teil-01)",
    ].join("\n"), [
      { resourceId: "teil-01", title: "Teil 01", kind: "PDF" },
    ]);

    expect(mapping).toHaveLength(1);
    expect(mapping[0]?.areas).toEqual(["1. General Remarks and Motivation"]);
  });

  test("normalizes slash-prefixed Moodle resource ids before adding uncited PDF fallbacks", () => {
    const mapping = buildScriptPDFMapping([
      "# 1. General Remarks and Motivation",
      "",
      "Source: [Teil 01](moodle-resource://teil-01)",
    ].join("\n"), [
      { resourceId: "teil-01", title: "Teil 01", kind: "PDF" },
    ]);

    expect(mapping).toHaveLength(1);
    expect(mapping[0]?.resourceId).toBe("teil-01");
    expect(mapping[0]?.areas).toEqual(["1. General Remarks and Motivation"]);
  });
});

describe("script markdown renderer", () => {
  test("hides generated frontmatter from rendered script text", () => {
    const html = renderScriptMarkdownHTML([
      "---",
      "status: server-curated-from-extracted",
      "ai_used: false",
      "---",
      "",
      "## Keras",
      "",
      "Dense layers.",
    ].join("\n"));

    expect(html).toContain("Keras");
    expect(html).toContain("Dense layers");
    expect(html).not.toContain("server-curated-from-extracted");
    expect(html).not.toContain("ai_used");
  });

  test("renders display math even when Codex leaves blank lines inside fences", () => {
    const html = renderScriptMarkdownHTML([
      "$$",
      "",
      "(\\text{window height},\\ \\text{window width},\\ \\text{input depth})",
      "",
      "$$",
      "",
      "Jedes 3D-Patch wird in einen 1D-Vektor transformiert.",
      "",
      "$$",
      "",
      "(\\text{output depth})",
      "",
      "$$",
    ].join("\n"));

    expect(html).toContain("katex-display");
    expect(html).toContain("window height");
    expect(html).toContain("output depth");
    expect(html).not.toContain("<p>$$</p>");
  });

  test("renders indented display math inside list items", () => {
    const html = renderScriptMarkdownHTML([
      "- Jedes Fenster extrahiert ein 3D-Patch mit Form:",
      "  $$",
      "  (\\text{window height},\\ \\text{window width},\\ \\text{input depth})",
      "  $$",
      "- Jedes 3D-Patch wird in einen 1D-Vektor der Form:",
      "  $$",
      "  (\\text{output depth})",
      "  $$",
    ].join("\n"));

    expect(html).toContain("<ul");
    expect(html).toContain("katex-display");
    expect(html).toContain("window height");
    expect(html).toContain("output depth");
    expect(html).not.toContain("<p>$$</p>");
  });

  test("renders markdown tables with inline formatting", () => {
    const html = renderScriptMarkdownHTML([
      "| Theme | Keras | PyTorch |",
      "|---|---|---|",
      "| Data Handling | Use of NumPy structure | Explicit use of tensors and CPU or GPU allocation |",
      "| Data Preparing | NumPy or scikit-learn framework | Explicit transformation functions; `DataLoader` for structuring data in batches |",
      "| Model | Easy-to-call functions | Model function with two parts: `__init__` and `forward` |",
    ].join("\n"));

    expect(html).toContain("<table");
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
    expect(html).toContain("Data Handling");
    expect(html).toContain("<code");
    expect(html).toContain("__init__");
    expect(html).not.toContain("|---|---|---|");
  });

  test("splits scripts into state-backed chapters without exposing wrapper headings", () => {
    const chapters = splitScriptChapters([
      "# Course Script",
      "",
      "Intro text.",
      "",
      "## Keras Coding Formats",
      "",
      "Source: [Keras](moodle-resource:keras)",
      "",
      "Use the sequential API.",
      "",
      "## Pytorch Coding",
      "",
      "Source: [Torch](moodle-resource:torch)",
      "",
      "Use modules.",
    ].join("\n"), [
      {
        id: "keras",
        kind: "script-section",
        status: "codex-improved",
        statusLabel: "Codex improved",
        title: "Keras Coding Formats",
      },
      {
        id: "torch",
        kind: "script-section",
        status: "machine-extracted",
        statusLabel: "Machine extracted",
        title: "Pytorch Coding",
      },
    ]);

    expect(chapters.map((chapter) => chapter.title)).toEqual(["Introduction", "Keras Coding Formats", "Pytorch Coding"]);
    expect(chapters[1]?.state?.status).toBe("codex-improved");
    expect(chapters[1]?.bodyMarkdown).toContain("Use the sequential API");
    expect(chapters[1]?.bodyMarkdown).not.toContain("Keras Coding Formats");
  });

  test("keeps script improvement as a simple review request in the user UI", () => {
    const html = renderToStaticMarkup(React.createElement(ScriptReader, {
      courseTitleText: "High Performance Computing",
      onCitationClick: () => undefined,
      onRequestImprovement: () => undefined,
      onSelectSection: () => undefined,
      selectedSectionId: null,
      view: {
        courseId: "22584",
        generatedAt: "2026-06-13T08:00:00Z",
        progress: { checked: 0, correct: 0, done: 0, needsReview: 0, open: 0, wrong: 0 },
        resources: [],
        scriptMarkdown: ["# Course Script", "", "## Cache Coherence", "", "Read the source section."].join("\n"),
        scriptSections: [{
          id: "script-cache",
          kind: "script-section",
          status: "machine-extracted",
          statusLabel: "Machine extracted",
          title: "Cache Coherence",
        }],
        sheets: [],
        source: "moodle-services",
      },
    }));

    expect(html).toContain("Verbesserung anfragen");
    expect(html).not.toContain("Mit Codex verbessern");
  });

  test("renders study bundle figures as images instead of escaped HTML", () => {
    const html = renderScriptMarkdownHTML([
      "<figure>",
      '  <img src="/api/study-bundles/courses/22584/asset?path=.extracted%2Fscript%2Fimage.jpg" alt="Cache diagram" />',
      "</figure>",
    ].join("\n"));

    expect(html).toContain("<figure");
    expect(html).toContain("<img");
    expect(html).toContain("Cache diagram");
    expect(html).not.toContain("&lt;figure&gt;");
  });

  test("renders study pipeline extracted asset figures as images", () => {
    const html = renderScriptMarkdownHTML([
      "<figure>",
      '  <img src="/api/study-pipeline/courses/22584/study-pipeline/extracted-asset?path=%2Fdata%2Fstudy%2Fcourses%2F22584%2Fextracted%2Fruns%2Frun-1%2Fassets%2F947711%2Fimages%2Fimage-000.png" alt="PDF element embedded-image-001" />',
      "</figure>",
    ].join("\n"));

    expect(html).toContain("<figure");
    expect(html).toContain("<img");
    expect(html).toContain("PDF element embedded-image-001");
    expect(html).not.toContain("&lt;figure&gt;");
  });

  test("separates headings and fenced code even without extra PDF extraction spacing", () => {
    const html = renderScriptMarkdownHTML([
      "## High Performance Computing (CDS-110)",
      "Aufgabenblatt 1: Speicherzugriffe",
      "",
      "Die Schönauer-Vektortriade",
      "```pseudo",
      "for i <- 1 to N do",
      "a(i) <- b(i) + c(i)*d(i)",
      "od",
      "```",
      "soll ausgeführt werden.",
    ].join("\n"));

    expect(html).toContain("<h4");
    expect(html).toContain("High Performance Computing");
    expect(html).toContain("<pre");
    expect(html).toContain("for i &lt;- 1 to N do");
    expect(html).not.toContain("## High Performance");
    expect(html).not.toContain("``pseudo");
  });

  test("drops empty closing fence artifacts from extracted markdown", () => {
    const html = renderScriptMarkdownHTML([
      "```pseudo",
      "for i <- 1 to N do",
      "od",
      "```",
      "",
      "```",
    ].join("\n"));

    expect(html.match(/<pre/g)).toHaveLength(1);
    expect(html).toContain("for i &lt;- 1 to N do");
  });

  test("renders slide bullet markers as clean script lines", () => {
    const html = renderScriptMarkdownHTML([
      "## 1.6 Objectives of Parallelisation",
      "",
      "Assume you have \\(p\\)-times more resources.",
      "- Goal: compute \\(p\\) independent problems simultaneously.",
      "  - Strategy: run \\(p\\) instances of the same sequential program.",
      "• - Goal: compute one problem in a fraction \\(1/p\\) of the time.",
    ].join("\n"));

    expect(html).toContain("<p>Assume you have");
    expect(html).toContain("<p>Goal: compute");
    expect(html).toContain("<p>Strategy: run");
    expect(html).toContain("<p>Goal: compute one problem");
    expect(html).not.toContain("<ul");
    expect(html).not.toContain("- Goal");
    expect(html).not.toContain("•");
  });

  test("renders non-Moodle markdown links without leaking unresolved relative paths", () => {
    const html = renderScriptMarkdownHTML("Source task: [extracted task](../.extracted/tasks/foo.mdx)");

    expect(html).toContain("extracted task");
    expect(html).not.toContain("](../.extracted");
    expect(html).not.toContain("href=\"../.extracted");
  });
});

describe("task view display normalization", () => {
  test("sorts worksheets by their natural Aufgabenblatt number", () => {
    const view = normalizeTaskViewForDisplay({
      courseId: "22584",
      generatedAt: "2026-06-08T00:00:00.000Z",
      progress: { checked: 0, correct: 0, done: 0, needsReview: 0, open: 3, wrong: 0 },
      resources: [],
      scriptMarkdown: "",
      sheets: [
        {
          kind: "PDF",
          resourceId: "sheet-12",
          tasks: [{ parts: [], promptMarkdown: "Zwoelf.", sourceResourceId: "sheet-12", status: "open", taskId: "12", title: "Aufgabenblatt 12" }],
          title: "Aufgabenblatt 12",
        },
        {
          kind: "PDF",
          resourceId: "sheet-01",
          tasks: [{ parts: [], promptMarkdown: "Eins.", sourceResourceId: "sheet-01", status: "open", taskId: "01", title: "Aufgabenblatt 01" }],
          title: "Aufgabenblatt 01",
        },
        {
          kind: "PDF",
          resourceId: "sheet-02",
          tasks: [{ parts: [], promptMarkdown: "Zwei.", sourceResourceId: "sheet-02", status: "open", taskId: "02", title: "Aufgabenblatt 02" }],
          title: "Aufgabenblatt 02",
        },
      ],
    });

    expect(view.sheets.map((sheet) => sheet.title)).toEqual([
      "Aufgabenblatt 01",
      "Aufgabenblatt 02",
      "Aufgabenblatt 12",
    ]);
  });

  test("splits a study bundle worksheet into selectable Aufgabe sections", () => {
    const view = normalizeTaskViewForDisplay({
      courseId: "22584",
      generatedAt: "2026-06-08T00:00:00.000Z",
      progress: { checked: 0, correct: 0, done: 0, needsReview: 0, open: 1, wrong: 0 },
      resources: [],
      scriptMarkdown: "",
      sheets: [{
        kind: "PDF",
        resourceId: "sheet-01",
        solutionMarkdown: "# Aufgabenblatt 01 -- Lösung\n\nThis is the versioned working copy of the Moodle solution.\n\n## Original Sources\n\n- raw.pdf",
        tasks: [{
          parts: [],
          promptMarkdown: [
            "# Aufgabenblatt 01",
            "",
            "Source task: [extracted task](../.extracted/tasks/01-aufgabenblatt-01.mdx)",
            "",
            "Solution status: **moodle-solution-available**",
            "",
            "## Task Text",
            "",
            "## Aufgabe 1",
            "Erste Frage.",
            "",
            "## Aufgabe 2",
            "Zweite Frage.",
          ].join("\n"),
          sourceResourceId: "sheet-01",
          status: "open",
          taskId: "01-aufgabenblatt-01",
          title: "Aufgabenblatt 01",
        }],
        title: "Aufgabenblatt 01",
      }],
    });

    expect(view.sheets[0]?.tasks.map((task) => task.title)).toEqual(["Aufgabe 1", "Aufgabe 2"]);
    expect(view.sheets[0]?.tasks[0]?.promptMarkdown).toBe("Erste Frage.");
    expect(view.sheets[0]?.tasks[0]?.promptMarkdown).not.toContain("Source task");
    expect(view.sheets[0]?.solutionMarkdown).not.toContain("Original Sources");
  });

  test("marks machine-extracted worksheets read-only until Codex curation is available", () => {
    const view = normalizeTaskViewForDisplay({
      courseId: "22584",
      generatedAt: "2026-06-22T00:00:00.000Z",
      progress: { checked: 0, correct: 0, done: 0, needsReview: 0, open: 2, wrong: 0 },
      resources: [],
      scriptMarkdown: "",
      sheets: [
        {
          contentState: {
            id: "sheet-01",
            kind: "task",
            status: "codex-improved",
            statusLabel: "Codex improved",
            title: "Aufgabenblatt 01",
          },
          kind: "PDF",
          resourceId: "sheet-01",
          tasks: [{ parts: [], promptMarkdown: "Ready.", sourceResourceId: "sheet-01", status: "open", taskId: "01", title: "Aufgabenblatt 01" }],
          title: "Aufgabenblatt 01",
        },
        {
          contentState: {
            id: "sheet-02",
            kind: "task",
            status: "machine-extracted",
            statusLabel: "Machine extracted",
            title: "Aufgabenblatt 02",
          },
          kind: "PDF",
          resourceId: "sheet-02",
          tasks: [{ parts: [], promptMarkdown: "Raw.", sourceResourceId: "sheet-02", status: "open", taskId: "02", title: "Aufgabenblatt 02" }],
          title: "Aufgabenblatt 02",
        },
      ],
    });

    expect(view.sheets.map((sheet) => [sheet.title, sheet.readiness, sheet.readOnly])).toEqual([
      ["Aufgabenblatt 01", "ready", false],
      ["Aufgabenblatt 02", "unprocessed", true],
    ]);
  });

  test("removes study metadata frontmatter after leading source links", () => {
    const view = normalizeTaskViewForDisplay({
      courseId: "22584",
      generatedAt: "2026-06-23T00:00:00.000Z",
      progress: { checked: 0, correct: 0, done: 0, needsReview: 0, open: 1, wrong: 0 },
      resources: [],
      scriptMarkdown: "",
      sheets: [
        {
          contentState: {
            id: "sheet-01",
            kind: "task",
            status: "codex-improved",
            statusLabel: "Codex improved",
            title: "Aufgabenblatt 01",
          },
          kind: "PDF",
          resourceId: "sheet-01",
          tasks: [{
            parts: [],
            promptMarkdown: [
              "Source: [Moodle resource](moodle-resource:sheet-01)",
              "",
              "---",
              "status: codex-improved",
              "ai_used: true",
              "course_id: \"22584\"",
              "source_task: \"sheet-01\"",
              "---",
              "",
              "## Aufgabe 1",
              "",
              "Real task text.",
            ].join("\n"),
            sourceResourceId: "sheet-01",
            status: "open",
            taskId: "01",
            title: "Aufgabenblatt 01",
          }],
          title: "Aufgabenblatt 01",
        },
      ],
    });

    const prompt = view.sheets[0]?.tasks[0]?.promptMarkdown ?? "";
    expect(prompt).toContain("Real task text.");
    expect(prompt).not.toContain("status: codex-improved");
    expect(prompt).not.toContain("course_id");
  });

  test("keeps unprocessed worksheets visible but out of the next-practice flow", () => {
    const html = renderToStaticMarkup(React.createElement(TaskOutline, {
      onSelectTask: () => undefined,
      onTaskStatusChange: () => undefined,
      selectedTaskId: null,
      tasks: [
        {
          id: "sheet-01",
          readOnly: true,
          readiness: "unprocessed",
          readinessLabel: "Nicht aufbereitet",
          sheetTitle: "Aufgabenblatt 01",
          status: "open",
          title: "Aufgabenblatt 01",
        },
        {
          id: "sheet-02",
          readOnly: false,
          readiness: "ready",
          readinessLabel: "Aufbereitet",
          sheetTitle: "Aufgabenblatt 02",
          status: "open",
          title: "Aufgabenblatt 02",
        },
      ],
    }));

    expect(html).toContain("Als Nächstes: Aufgabenblatt 02");
    expect(html).toContain("1 Aufgabenblatt noch nicht aufbereitet.");
    expect(html).toContain("Nicht aufbereitet");
  });
});

describe("formula renderer", () => {
  test("renders headings, lists, and inline math for the preview and PDF export", () => {
    const html = renderFormulaMarkdownHTML([
      "# Vorgaben",
      "",
      "- Laufzeit: \\(T(n)\\)",
      "- Speedup: \\(S = T_s / T_p\\)",
    ].join("\n"));

    expect(html).toContain("<h1>Vorgaben</h1>");
    expect(html).toContain("<ul>");
    expect(html).toContain("katex");
  });

  test("renders mixed markdown sections instead of falling back to raw paragraphs", () => {
    const html = renderFormulaMarkdownHTML([
      "Vorgaben und Annahmen",
      "- Written exam, 120 minutes.",
      "- Speedup: \\(S_p = T_1 / T_p\\).",
      "PDF-Zuordnung",
      "Teil 01: General Remarks",
    ].join("\n"));

    expect(html).toContain("<h2>Vorgaben und Annahmen</h2>");
    expect(html).toContain("<li>Written exam");
    expect(html).toContain("katex");
    expect(html).toContain("<h2>PDF-Zuordnung</h2>");
    expect(html).not.toContain("- Written exam");
  });
});

describe("formula source excerpt", () => {
  test("keeps formula-relevant content while bounding large scripts", () => {
    const largeScript = [
      "# Course Script",
      "",
      "# 1. Organisation and Examination",
      "",
      "Open book exam. Closed internet.",
      "",
      ...Array.from({ length: 220 }, (_, index) => [
        `# ${index + 2}. Topic ${index + 2}`,
        "",
        "Background explanation without formulas ".repeat(80),
        "",
        index === 180 ? "Speedup is defined as \\(S = T_s / T_p\\)." : "",
      ].join("\n")),
    ].join("\n");

    const excerpt = buildFormulaSourceExcerpt(largeScript);

    expect(excerpt.length).toBeLessThanOrEqual(52_000);
    expect(excerpt).toContain("Open book exam");
    expect(excerpt).toContain("Speedup");
  });

  test("builds a fallback formula collection from script content", () => {
    const markdown = buildExtractedFormulaCollection({
      course: { id: "hpc", fullname: "High Performance Computing" },
      pdfMapping: [
        { areas: ["1. Organisation and Examination"], order: 1, resourceId: "teil-01", title: "Teil 01" },
      ],
      view: {
        courseId: "hpc",
        generatedAt: new Date().toISOString(),
        progress: { open: 0, started: 0, done: 0, checked: 0, correct: 0, wrong: 0, needsReview: 0 },
        resources: [],
        scriptMarkdown: [
          "# 1. Organisation and Examination",
          "",
          "Examination:\n- Written exam, 120 minutes.\n- Open book exam.\n- Closed internet.\nExamples of parallel algorithms.",
          "",
          "# 2. Parallel Performance",
          "",
          "Speedup is defined as \\(S = T_s / T_p\\). Efficiency is \\(E = S / p\\).",
        ].join("\n"),
        sheets: [],
      },
    });

    expect(markdown).toContain("High Performance Computing Formelsammlung");
    expect(markdown).toContain("Open book exam");
    expect(markdown).not.toContain("Examples of parallel algorithms");
    expect(markdown).toContain("Speedup");
  });
});

describe("dashboard URL routing", () => {
  test("parses legacy query URLs for backward compatibility", () => {
    const route = parseDashboardRouteSearch("?course=42&mode=formula");

    expect(route.courseId).toBe("42");
    expect(route.mode).toBe("formula");
  });

  test("parses path-based course mode URLs", () => {
    const route = parseDashboardRoute("/courses/42/tasks", "");

    expect(route.courseId).toBe("42");
    expect(route.mode).toBe("tasks");
    expect(route.courseHubOpen).toBe(false);

    const pipelineRoute = parseDashboardRoute("/courses/42/pipeline", "");
    expect(pipelineRoute.courseId).toBe("42");
    expect(pipelineRoute.mode).toBe("pipeline");
    expect(pipelineRoute.courseHubOpen).toBe(false);
  });

  test("keeps modern chat URLs from being parsed as legacy course routes", () => {
    const route = parseDashboardRoute("/chat", "?course=42");

    expect(route.homeView).toBe("chat");
    expect(route.courseId).toBe("42");
    expect(route.mode).toBe("materials");
  });

  test("builds URLs for selected course modes and nested targets", () => {
    expect(buildDashboardRouteURL({
      courseHubOpen: false,
      homeView: "courses",
      navigationMode: "materials",
      recordingId: null,
      selectedCourseId: "42",
      selectedMaterialId: null,
      selectedScriptSectionId: "section-cache",
      selectedTaskId: null,
      studyMode: "script",
    })).toBe("/courses/42/script/section-cache");

    expect(buildDashboardRouteURL({
      courseHubOpen: false,
      homeView: "courses",
      navigationMode: "materials",
      recordingId: null,
      selectedCourseId: "42",
      selectedMaterialId: null,
      selectedScriptSectionId: null,
      selectedTaskId: "sheet-01-task-1",
      studyMode: "tasks",
    })).toBe("/courses/42/tasks/sheet-01-task-1");

    expect(buildDashboardRouteURL({
      courseHubOpen: true,
      homeView: "courses",
      navigationMode: "materials",
      recordingId: null,
      selectedCourseId: "42",
      selectedMaterialId: null,
      selectedScriptSectionId: null,
      selectedTaskId: null,
      studyMode: "formula",
    })).toBe("/courses/42");

    expect(buildDashboardRouteURL({
      courseHubOpen: true,
      homeView: "calendar",
      navigationMode: "courses",
      recordingId: null,
      selectedCourseId: null,
      selectedMaterialId: null,
      selectedScriptSectionId: null,
      selectedTaskId: null,
      studyMode: "materials",
    })).toBe("/calendar");

    expect(buildDashboardRouteURL({
      courseHubOpen: false,
      homeView: "courses",
      navigationMode: "materials",
      recordingId: null,
      selectedCourseId: "42",
      selectedMaterialId: null,
      selectedScriptSectionId: null,
      selectedTaskId: null,
      studyMode: "pipeline",
    })).toBe("/courses/42/pipeline");
  });

  test("treats courses navigation as home even when a course id is still in memory", () => {
    const route = dashboardRouteFromInput({
      courseHubOpen: true,
      homeView: "courses",
      navigationMode: "courses",
      recordingId: null,
      selectedCourseId: "42",
      selectedMaterialId: "material-1",
      selectedScriptSectionId: null,
      selectedTaskId: null,
      studyMode: "materials",
    });

    expect(route.courseId).toBeNull();
    expect(dashboardRoutesEqual(route, parseDashboardRoute("/courses"))).toBe(true);
  });
});
