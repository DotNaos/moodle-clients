import type { CourseInventoryNode, CourseInventoryTaskGroup } from "@/components/study-pipeline-preview";
import { finalOutputNodeData } from "@/components/course-pipeline-blueprint-node-data";
import { buildTaskOutputLossDiagnostics } from "@/components/course-pipeline-loss-diagnostics";
import type {
  BlueprintNodeData,
  BlueprintProblem,
  BlueprintRenderedField,
  BlueprintRunScope,
  ScriptOutputRecord,
  TaskOutputRecord,
} from "@/components/course-pipeline-blueprint-model";
import type { PDFDocumentStructure } from "@/components/extracted-document-inspector";

export function finalTaskOutputNodeData({
  courseId,
  group,
  index,
  outputs,
  runScope,
  sourceDocuments,
  upstreamProblems,
}: {
  courseId?: string;
  group: CourseInventoryTaskGroup;
  index: number;
  outputs: TaskOutputRecord[];
  runScope?: BlueprintRunScope;
  sourceDocuments?: Array<PDFDocumentStructure | null>;
  upstreamProblems: BlueprintProblem[];
}): BlueprintNodeData {
  if (outputs.length === 0) {
    return finalOutputNodeData({
      sourceLabel: group.title,
      status: "missing",
      title: `Output ${index + 1}`,
      type: "task",
      upstreamProblems,
      runScope,
    });
  }
  const validationProblems = outputs.flatMap((output) => validateWebsiteReadyMarkdown(output.promptMarkdown, output.title));
  const lossDiagnostics = buildTaskOutputLossDiagnostics({ courseId, outputs, sourceDocuments: sourceDocuments ?? [] });
  const needsReview = outputs.some((output) => output.status === "needs_review")
    || upstreamProblems.length > 0
    || validationProblems.length > 0
    || lossDiagnostics.problems.length > 0;
  return {
    title: outputs.length === 1 ? outputs[0]?.title ?? `Output ${index + 1}` : `${outputs.length} Task Outputs`,
    subtitle: "website task output",
    detail: "Final task output loaded from the same task-view used by the normal course UI.",
    evidence: [
      `Source lane: ${group.title}`,
      `${outputs.length} task output${outputs.length === 1 ? "" : "s"} loaded`,
      validationProblems.length > 0 ? `${validationProblems.length} website-ready validation problem${validationProblems.length === 1 ? "" : "s"}` : "Website-ready validation passed",
      ...lossDiagnostics.evidence,
      ...outputs.map((output) => `${output.taskId}: ${output.status}`),
    ],
    inputs: [{ label: "task draft", detail: group.title }],
    bodyData: taskOutputBodyData({ group, lossDiagnostics, outputs }),
    outputs: outputs.map((output) => ({ label: output.title, detail: output.taskId, state: outputState(output.status, validationProblems.length) })),
    outputPreview: outputs.map((output) => `${output.title}\n${output.promptMarkdown || "No prompt markdown stored."}`).join("\n\n---\n\n"),
    problems: needsReview
      ? [
          ...upstreamProblems,
          ...validationProblems,
          ...lossDiagnostics.problems,
          ...outputs
            .filter((output) => output.status === "needs_review")
            .map((output) => ({ label: "Output needs review", detail: `${output.title} is marked needs_review.`, severity: "warning" as const })),
        ]
      : undefined,
    runScope,
    stepKind: "transform",
    tone: needsReview ? "warning" : "output",
    status: needsReview ? "needs_review" : "ready",
    renderedFields: taskOutputRenderedFields(outputs, lossDiagnostics),
    meta: [
      { label: "Output type", value: "task" },
      { label: "Count", value: String(outputs.length) },
      { label: "Source", value: outputs[0]?.sheetTitle ?? group.title },
      { label: "Website validation", value: validationProblems.length > 0 ? `${validationProblems.length} problem${validationProblems.length === 1 ? "" : "s"}` : "passed" },
      { label: "Unresolved elements", value: String(lossDiagnostics.unresolvedElements) },
    ],
  };
}

export function finalScriptOutputNodeData({
  index,
  outputs,
  resource,
  runScope,
  upstreamProblems,
}: {
  index: number;
  outputs: ScriptOutputRecord[];
  resource: CourseInventoryNode;
  runScope?: BlueprintRunScope;
  upstreamProblems: BlueprintProblem[];
}): BlueprintNodeData {
  if (outputs.length === 0) {
    return finalOutputNodeData({
      sourceLabel: resource.name,
      status: "missing",
      title: `Script Section ${index + 1}`,
      type: "script",
      upstreamProblems,
      runScope,
    });
  }
  const validationProblems = outputs.flatMap((output) => validateWebsiteReadyMarkdown(`${output.title}\n${output.statusLabel}${output.sourcePath ? `\n${output.sourcePath}` : ""}`, output.title));
  const needsReview = outputs.some((output) => output.status === "needs_review") || upstreamProblems.length > 0 || validationProblems.length > 0;
  return {
    title: outputs.length === 1 ? outputs[0]?.title ?? `Script Section ${index + 1}` : `${outputs.length} Script Sections`,
    subtitle: "website script output",
    detail: "Final script output loaded from the same task-view used by the normal course UI.",
    evidence: [
      `Source lane: ${resource.name}`,
      `${outputs.length} script section${outputs.length === 1 ? "" : "s"} loaded`,
      validationProblems.length > 0 ? `${validationProblems.length} website-ready validation problem${validationProblems.length === 1 ? "" : "s"}` : "Website-ready validation passed",
      ...outputs.map((output) => `${output.id}: ${output.statusLabel}`),
    ],
    inputs: [{ label: "script draft", detail: resource.name }],
    bodyData: scriptOutputBodyData({ outputs, resource }),
    outputs: outputs.map((output) => ({ label: output.title, detail: output.id, state: outputState(output.status, validationProblems.length) })),
    outputPreview: outputs.map((output) => `${output.title}\n${output.statusLabel}${output.sourcePath ? `\n${output.sourcePath}` : ""}`).join("\n\n---\n\n"),
    problems: needsReview ? [...upstreamProblems, ...validationProblems] : undefined,
    runScope,
    stepKind: "transform",
    tone: needsReview ? "warning" : "output",
    status: needsReview ? "needs_review" : "ready",
    renderedFields: scriptOutputRenderedFields(outputs),
    meta: [
      { label: "Output type", value: "script" },
      { label: "Count", value: String(outputs.length) },
      { label: "Resource", value: resource.name },
      { label: "Website validation", value: validationProblems.length > 0 ? `${validationProblems.length} problem${validationProblems.length === 1 ? "" : "s"}` : "passed" },
    ],
  };
}

function taskOutputBodyData({
  group,
  lossDiagnostics,
  outputs,
}: {
  group: CourseInventoryTaskGroup;
  lossDiagnostics: ReturnType<typeof buildTaskOutputLossDiagnostics>;
  outputs: TaskOutputRecord[];
}) {
  return {
    type: "task_outputs",
    sourceGroup: {
      id: group.id,
      title: group.title,
      pairingStatus: group.pairingStatus,
      sheetResourceId: group.sheet.id,
      solutionResourceId: group.solution?.id ?? null,
    },
    outputs: outputs.map((output) => ({
      taskId: output.taskId,
      title: output.title,
      status: output.status,
      sourceResourceId: output.sourceResourceId,
      sheetTitle: output.sheetTitle,
      solutionResourceId: output.solutionResourceId ?? null,
      solutionTitle: output.solutionTitle ?? null,
      promptMarkdown: output.promptMarkdown,
      parts: output.parts,
      contentState: output.contentState ?? null,
    })),
    diagnostics: {
      unresolvedElements: lossDiagnostics.unresolvedElements,
      unresolvedElementMarkdown: lossDiagnostics.unresolvedElementMarkdown,
    },
  };
}

function scriptOutputBodyData({
  outputs,
  resource,
}: {
  outputs: ScriptOutputRecord[];
  resource: CourseInventoryNode;
}) {
  return {
    type: "script_outputs",
    sourceResource: {
      id: resource.id,
      name: resource.name,
      bucket: resource.bucket,
      role: resource.role,
    },
    outputs: outputs.map((output) => ({
      id: output.id,
      title: output.title,
      status: output.status,
      statusLabel: output.statusLabel,
      sourcePath: output.sourcePath ?? null,
      model: output.model ?? null,
      updatedAt: output.updatedAt ?? null,
    })),
  };
}

function taskOutputRenderedFields(
  outputs: TaskOutputRecord[],
  lossDiagnostics: ReturnType<typeof buildTaskOutputLossDiagnostics>,
): BlueprintRenderedField[] {
  const outputFields = outputs.flatMap((output, outputIndex) => {
    const fields: BlueprintRenderedField[] = [];
    if (output.promptMarkdown.trim()) {
      fields.push({
        label: output.title,
        path: `outputs[${outputIndex}].promptMarkdown`,
        type: "markdown",
        value: output.promptMarkdown,
      });
    }
    for (const [partIndex, part] of output.parts.entries()) {
      if (!part.promptMarkdown.trim()) continue;
      fields.push({
        label: part.label ? `${output.title} · ${part.label}` : `${output.title} · Part ${partIndex + 1}`,
        path: `outputs[${outputIndex}].parts[${partIndex}].promptMarkdown`,
        type: "markdown",
        value: part.promptMarkdown,
      });
    }
    const feedback = output.latestAttempt?.verdict.feedbackMarkdown;
    if (feedback?.trim()) {
      fields.push({
        label: `${output.title} · latest feedback`,
        path: `outputs[${outputIndex}].latestAttempt.verdict.feedbackMarkdown`,
        type: "markdown",
        value: feedback,
      });
    }
    return fields;
  });
  if (!lossDiagnostics.unresolvedElementMarkdown.trim()) return outputFields;
  return [
    ...outputFields,
    {
      description: "These detected PDF elements still need a final used/ignored/unsupported/failed outcome.",
      label: "Elements needing accountability",
      path: "diagnostics.unresolvedElementMarkdown",
      type: "markdown",
      value: lossDiagnostics.unresolvedElementMarkdown,
    },
  ];
}

function scriptOutputRenderedFields(outputs: ScriptOutputRecord[]): BlueprintRenderedField[] {
  return outputs
    .filter((output) => output.statusLabel.trim())
    .map((output, outputIndex) => ({
      label: output.title,
      path: `outputs[${outputIndex}].statusLabel`,
      type: "text",
      value: output.statusLabel,
    }));
}

function validateWebsiteReadyMarkdown(markdown: string | undefined, outputTitle: string): BlueprintProblem[] {
  const text = markdown?.trim() ?? "";
  const problems: BlueprintProblem[] = [];
  if (!text) {
    problems.push({ label: "Empty output", detail: `${outputTitle} has no renderable content.`, severity: "error" });
    return problems;
  }
  if (/(^|\n)\s*(Source task|Solution status|Solution page|Original Sources)\s*:/i.test(text) || /<!--\s*source:/i.test(text)) {
    problems.push({ label: "Pipeline artifact visible", detail: `${outputTitle} still contains source/debug lines that should not appear in website content.`, severity: "warning" });
  }
  if (/!\[[^\]]*]\(\s*\)/.test(text) || /!\[[^\]]*]\((?:missing|undefined|null|about:blank)[^)]*\)/i.test(text)) {
    problems.push({ label: "Broken image reference", detail: `${outputTitle} contains an image without a usable asset URL.`, severity: "error" });
  }
  if (/!\[[^\]]*]\((?:\.\.\/|\.\/)?\.extracted\//i.test(text)) {
    problems.push({ label: "Internal image path", detail: `${outputTitle} references an internal extraction path instead of a web asset.`, severity: "error" });
  }
  if (/[�]|(?:Ã.|Â.|â€|â€™|â€œ|â€\u009d)/.test(text)) {
    problems.push({ label: "Encoding problem", detail: `${outputTitle} contains replacement or mojibake characters.`, severity: "warning" });
  }
  if (hasUnbalancedMathDelimiters(text)) {
    problems.push({ label: "LaTeX delimiter problem", detail: `${outputTitle} has unbalanced math delimiters and may not render correctly.`, severity: "warning" });
  }
  return problems;
}

function hasUnbalancedMathDelimiters(text: string): boolean {
  return countMatches(text, /\\\(/g) !== countMatches(text, /\\\)/g)
    || countMatches(text, /\\\[/g) !== countMatches(text, /\\\]/g)
    || countMatches(text, /\$\$/g) % 2 !== 0;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function outputState(status: string, validationProblemCount: number): string {
  if (validationProblemCount > 0) return "needs_review";
  return status;
}
