// @ts-nocheck
import { describe, expect, test } from "bun:test";

import { buildExtractedFormulaCollection, buildFormulaSourceExcerpt } from "@/components/formula-collection-panel";
import { groupScriptSections } from "@/components/moodle-sidebar";
import { buildScriptPDFMapping, extractScriptSections, renderScriptMarkdownHTML } from "@/components/task-study-panel";
import { buildDashboardRouteURL, parseDashboardRouteSearch } from "@/lib/dashboard-route";
import { renderFormulaMarkdownHTML } from "@/lib/formula-renderer";

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
  test("parses a formula collection deep link", () => {
    const route = parseDashboardRouteSearch("?course=42&mode=formula&codex=1");

    expect(route.courseId).toBe("42");
    expect(route.mode).toBe("formula");
    expect(route.codexOpen).toBe(true);
  });

  test("builds URLs for selected course modes and nested targets", () => {
    expect(buildDashboardRouteURL({
      codexOpen: false,
      homeView: "courses",
      navigationMode: "materials",
      recordingId: null,
      selectedCourseId: "42",
      selectedMaterialId: null,
      selectedScriptSectionId: "section-cache",
      selectedTaskId: null,
      studyMode: "script",
    })).toBe("/?course=42&mode=script&section=section-cache");

    expect(buildDashboardRouteURL({
      codexOpen: false,
      homeView: "calendar",
      navigationMode: "courses",
      recordingId: null,
      selectedCourseId: "42",
      selectedMaterialId: null,
      selectedScriptSectionId: null,
      selectedTaskId: null,
      studyMode: "formula",
    })).toBe("/?view=calendar");
  });
});
