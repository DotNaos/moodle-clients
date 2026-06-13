import type { CourseInventoryNode, CourseInventoryTaskGroup } from "@/components/study-pipeline-preview";
import { finalOutputNodeData } from "@/components/course-pipeline-blueprint-node-data";
import type { BlueprintNodeData, BlueprintProblem, ScriptOutputRecord, TaskOutputRecord } from "@/components/course-pipeline-blueprint-model";

export function finalTaskOutputNodeData({
  group,
  index,
  outputs,
  upstreamProblems,
}: {
  group: CourseInventoryTaskGroup;
  index: number;
  outputs: TaskOutputRecord[];
  upstreamProblems: BlueprintProblem[];
}): BlueprintNodeData {
  if (outputs.length === 0) {
    return finalOutputNodeData({
      sourceLabel: group.title,
      status: "missing",
      title: `Output ${index + 1}`,
      type: "task",
      upstreamProblems,
    });
  }
  const needsReview = outputs.some((output) => output.status === "needs_review") || upstreamProblems.length > 0;
  return {
    title: outputs.length === 1 ? outputs[0]?.title ?? `Output ${index + 1}` : `${outputs.length} Task Outputs`,
    subtitle: "website task output",
    detail: "Final task output loaded from the same task-view used by the normal course UI.",
    evidence: [
      `Source lane: ${group.title}`,
      `${outputs.length} task output${outputs.length === 1 ? "" : "s"} loaded`,
      ...outputs.map((output) => `${output.taskId}: ${output.status}`),
    ],
    inputs: [{ label: "task draft", detail: group.title }],
    outputs: outputs.map((output) => ({ label: output.title, detail: output.taskId, state: output.status })),
    outputPreview: outputs.map((output) => `${output.title}\n${output.promptMarkdown || "No prompt markdown stored."}`).join("\n\n---\n\n"),
    problems: needsReview
      ? [
          ...upstreamProblems,
          ...outputs
            .filter((output) => output.status === "needs_review")
            .map((output) => ({ label: "Output needs review", detail: `${output.title} is marked needs_review.`, severity: "warning" as const })),
        ]
      : undefined,
    stepKind: "transform",
    tone: needsReview ? "warning" : "output",
    status: needsReview ? "needs_review" : "ready",
    meta: [
      { label: "Output type", value: "task" },
      { label: "Count", value: String(outputs.length) },
      { label: "Source", value: outputs[0]?.sheetTitle ?? group.title },
    ],
  };
}

export function finalScriptOutputNodeData({
  index,
  outputs,
  resource,
  upstreamProblems,
}: {
  index: number;
  outputs: ScriptOutputRecord[];
  resource: CourseInventoryNode;
  upstreamProblems: BlueprintProblem[];
}): BlueprintNodeData {
  if (outputs.length === 0) {
    return finalOutputNodeData({
      sourceLabel: resource.name,
      status: "missing",
      title: `Script Section ${index + 1}`,
      type: "script",
      upstreamProblems,
    });
  }
  const needsReview = outputs.some((output) => output.status === "needs_review") || upstreamProblems.length > 0;
  return {
    title: outputs.length === 1 ? outputs[0]?.title ?? `Script Section ${index + 1}` : `${outputs.length} Script Sections`,
    subtitle: "website script output",
    detail: "Final script output loaded from the same task-view used by the normal course UI.",
    evidence: [
      `Source lane: ${resource.name}`,
      `${outputs.length} script section${outputs.length === 1 ? "" : "s"} loaded`,
      ...outputs.map((output) => `${output.id}: ${output.statusLabel}`),
    ],
    inputs: [{ label: "script draft", detail: resource.name }],
    outputs: outputs.map((output) => ({ label: output.title, detail: output.id, state: output.status })),
    outputPreview: outputs.map((output) => `${output.title}\n${output.statusLabel}${output.sourcePath ? `\n${output.sourcePath}` : ""}`).join("\n\n---\n\n"),
    problems: needsReview ? upstreamProblems : undefined,
    stepKind: "transform",
    tone: needsReview ? "warning" : "output",
    status: needsReview ? "needs_review" : "ready",
    meta: [
      { label: "Output type", value: "script" },
      { label: "Count", value: String(outputs.length) },
      { label: "Resource", value: resource.name },
    ],
  };
}
