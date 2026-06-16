import type { CodexActionResult } from "@/hooks/use-codex-moodle-actions";
import type { CodexChatMessage, MoodleUIAction } from "@/lib/codex-actions";
import type { CodexAttachment } from "@/lib/codex-files";
import type { Course, Material, User } from "@/lib/dashboard-data";
import { courseSubtitle, courseTitle } from "@/lib/dashboard-data";
import { buildPDFPromptContext, type PDFViewState } from "@/lib/pdf-context";

export type CodexChatRole = "user" | "assistant";

export type CodexToolStatus = "running" | "completed" | "failed";

export type CodexToolEvent = {
  id: string;
  // Backend item id, used to correlate running → completed updates for the
  // same tool call (more reliable than matching by title).
  sourceId?: string;
  title: string;
  status: CodexToolStatus;
};

export type CodexActionStatus = "pending" | "running" | "completed" | "cancelled" | "failed";

export type CodexAppliedAction = {
  id: string;
  type: MoodleUIAction["type"];
  label: string;
  detail?: string;
  resources: string[];
  status?: CodexActionStatus;
  requestId?: string;
  reason?: string;
  error?: string;
  showControls?: boolean;
};

export type CodexChatUIMessage = {
  id: string;
  role: CodexChatRole;
  text: string;
  toolEvents: CodexToolEvent[];
  actions: CodexAppliedAction[];
  attachments: CodexAttachment[];
};

// Note appended to the backend prompt so Codex knows which uploaded files it can
// read from the mounted volume (uploads/ → /home/codex/.codex/uploads/).
export function buildAttachmentPrompt(text: string, attachments: CodexAttachment[]): string {
  if (attachments.length === 0) {
    return text;
  }
  const uploads = attachments.filter((attachment) => attachment.kind !== "resource");
  const resources = attachments.filter((attachment) => attachment.kind === "resource");
  const notes: string[] = [];
  if (uploads.length > 0) {
    notes.push(
      `[The user attached ${uploads.length} file(s) to your workspace, readable at /home/codex/.codex/uploads/: ${uploads
        .map((attachment) => attachment.name)
        .join(", ")}.]`,
    );
  }
  if (resources.length > 0) {
    notes.push(
      `[The user referenced these Moodle course resources: ${resources
        .map((attachment) => attachment.name)
        .join(", ")}. Use the Moodle UI actions (load_course_resources / open_material) to read them if needed.]`,
    );
  }
  return `${text}\n\n${notes.join("\n")}`.trim();
}

export type LoadedResourceContext = CodexActionResult["loadedResources"];

// Live "over the shoulder" context while the student works on a task in test
// mode: the focused subtask, the answer draft, and the stored solution. Lets
// Codex act like a personal teacher with the same information as the student.
export type StudyTestContext = {
  active: boolean;
  taskId: string;
  taskTitle: string;
  sheetTitle?: string | null;
  stepLabel?: string | null;
  stepPrompt?: string | null;
  answerDraft?: string | null;
  solutionMarkdown?: string | null;
  lastFeedbackMarkdown?: string | null;
};

export type StudyChatContext = {
  mode: "materials" | "tasks" | "script" | "formula" | "recordings" | "pipeline";
  selectedTask?: {
    taskId: string;
    title: string;
    sheetTitle?: string;
    sourceResourceId?: string;
    sourceTitle?: string;
    status?: string;
    promptMarkdown?: string;
  } | null;
  selectedScriptSection?: {
    sectionId: string;
    title: string;
  } | null;
  test?: StudyTestContext | null;
} | null;

const ACTION_LABELS: Record<MoodleUIAction["type"], string> = {
  open_course: "Kurs geöffnet",
  open_material: "Material geöffnet",
  open_resource: "Ressource geöffnet",
  load_course_resources: "Materialien geladen",
  open_moodle_course_page: "Moodle-Kursseite geöffnet",
  open_latest_pdf: "Neuestes PDF geöffnet",
  scroll_pdf_to_page: "Zu Seite gesprungen",
  set_task_status: "Aufgabenstatus vorgeschlagen",
};

const PENDING_ACTION_LABELS: Record<MoodleUIAction["type"], string> = {
  open_course: "Kursmaterialien laden",
  open_material: "Material öffnen",
  open_resource: "Ressource öffnen",
  load_course_resources: "Materialien laden",
  open_moodle_course_page: "Moodle-Kursseite öffnen",
  open_latest_pdf: "Neuestes PDF öffnen",
  scroll_pdf_to_page: "PDF verschieben",
  set_task_status: "Aufgabenstatus ändern",
};

export function describeAppliedActions(
  actions: MoodleUIAction[],
  loadedResources: LoadedResourceContext,
  courses: Course[],
): CodexAppliedAction[] {
  return actions.map((action) => {
    const courseId = "courseId" in action ? action.courseId : null;
    const loaded = courseId
      ? loadedResources.find((entry) => String(entry.course.id) === String(courseId))
      : undefined;
    const course =
      loaded?.course ?? courses.find((candidate) => String(candidate.id) === String(courseId)) ?? null;

    const base = ACTION_LABELS[action.type];
    const label = course ? `${base}: ${courseTitle(course)}` : base;

    const resources = loaded?.resources.map((resource) => resource.name) ?? [];
    let detail: string | undefined;
    if (action.type === "scroll_pdf_to_page") {
      detail = `Seite ${action.page}`;
    } else if (resources.length > 0) {
      detail = `${resources.length} ${resources.length === 1 ? "Material" : "Materialien"}`;
    }

    return {
      id: crypto.randomUUID(),
      type: action.type,
      label,
      detail,
      resources,
      status: "completed",
    };
  });
}

export function describePendingActions(
  actions: MoodleUIAction[],
  courses: Course[],
  materials: Material[],
  requestId: string,
): CodexAppliedAction[] {
  return actions.map((action, index) => {
    const course = findActionCourse(action, courses);
    const material = findActionMaterial(action, materials);
    const base = PENDING_ACTION_LABELS[action.type];
    const label = material?.name
      ? `${base}: ${material.name}`
      : course
        ? `${base}: ${courseTitle(course)}`
        : base;

    return {
      id: crypto.randomUUID(),
      type: action.type,
      label,
      detail: actionDetail(action),
      resources: [],
      status: "pending",
      requestId,
      reason: action.reason ?? undefined,
      showControls: index === 0,
    };
  });
}

export function buildMoodleContext({
  user,
  courses,
  selectedCourse,
  materials,
  selectedMaterial,
  pdfState,
  studyContext,
  loadedResources = [],
}: {
  user: User | null;
  courses: Course[];
  selectedCourse: Course | null;
  materials: Material[];
  selectedMaterial: Material | null;
  pdfState: PDFViewState | null;
  studyContext?: StudyChatContext;
  loadedResources?: LoadedResourceContext;
}) {
  return {
    source: "moodle-web",
    user: user
      ? {
          displayName: user.displayName,
          moodleSiteUrl: user.moodleSiteUrl,
          moodleUserId: user.moodleUserId,
        }
      : null,
    selectedCourse: selectedCourse ? courseContext(selectedCourse) : null,
    selectedMaterial: selectedMaterial ? materialContext(selectedMaterial) : null,
    study: studyContext ?? null,
    pdf: buildPDFPromptContext(pdfState),
    courses: courses.slice(0, 80).map(courseContext),
    materials: materials.map(materialContext),
    loadedCourseResources: loadedResources.map(({ course, resources }) => ({
      course: courseContext(course),
      resources: resources.map(materialContext),
    })),
  };
}

export function completeCodexActions(actions: MoodleUIAction[], prompt: string): MoodleUIAction[] {
  if (!asksToOpenPDF(prompt)) {
    return actions;
  }

  const alreadyHandlesPDF = actions.some(
    (action) =>
      action.type === "open_material" ||
      action.type === "open_resource" ||
      action.type === "open_latest_pdf" ||
      action.type === "load_course_resources",
  );
  if (alreadyHandlesPDF) {
    return actions;
  }

  const courseAction = actions.find((action): action is Extract<MoodleUIAction, { type: "open_course" }> =>
    action.type === "open_course"
  );
  if (!courseAction) {
    return actions;
  }

  return [
    ...actions,
    {
      type: "load_course_resources",
      courseId: courseAction.courseId,
      reason: "User asked to open a PDF in this course, so resources must be loaded first.",
    },
  ];
}

export function shouldContinueAfterActions(actions: MoodleUIAction[], result: CodexActionResult): boolean {
  if (result.loadedResources.length === 0) {
    return false;
  }

  const opensConcreteResource = actions.some(
    (action) => action.type === "open_material" || action.type === "open_resource" || action.type === "open_latest_pdf",
  );
  if (opensConcreteResource) {
    return false;
  }

  return actions.some((action) => action.type === "load_course_resources" || action.type === "open_course");
}

export function mergeLoadedResources(
  current: LoadedResourceContext,
  incoming: LoadedResourceContext,
): LoadedResourceContext {
  const merged = new Map<string, LoadedResourceContext[number]>();
  for (const entry of [...current, ...incoming]) {
    merged.set(String(entry.course.id), entry);
  }
  return [...merged.values()];
}

export function buildActionFollowUpMessage(actions: MoodleUIAction[], loadedResources: LoadedResourceContext): string {
  const loaded = loadedResources
    .map(({ course, resources }) => `${courseTitle(course)}: ${resources.length} resources loaded`)
    .join("; ");
  const actionTypes = actions.map((action) => action.type).join(", ");
  return `Host applied Moodle UI actions: ${actionTypes}. ${loaded || "No resources were loaded."} Continue the original user request using the updated Moodle context.`;
}

export function toChatHistory(messages: Array<Pick<CodexChatUIMessage, "role" | "text">>): CodexChatMessage[] {
  return messages
    .filter((message) => message.text.trim() && message.text !== "Thinking...")
    .map((message) => ({
      role: message.role,
      text: message.text,
    }))
    .slice(-12);
}

// Safety net for older backends that still send Codex lifecycle messages as
// "tool" events (the current backend tags these as "status"). These are noise,
// not real tool calls, so the chat hides them.
const CODEX_LIFECYCLE_NOISE = new Set([
  "Starting Codex chat in the per-user Docker runner.",
  "Starting Codex in the per-user Docker runner.",
  "Codex session started.",
  "Codex is reading the extracted content.",
  "Codex started a work item.",
  "Codex completed a work item.",
  "Codex refinement failed.",
  "Codex is working.",
]);

export function isCodexLifecycleNoise(title: string): boolean {
  const trimmed = title.trim();
  return CODEX_LIFECYCLE_NOISE.has(trimmed) || trimmed.startsWith("Codex event: ");
}

export function displayCodexText(text: string): string {
  try {
    const parsed = JSON.parse(text) as { answer?: unknown };
    return typeof parsed.answer === "string" ? stripMoodleActionBlock(parsed.answer) : stripMoodleActionBlock(text);
  } catch {
    return stripMoodleActionBlock(text);
  }
}

function stripMoodleActionBlock(text: string): string {
  return text.replace(/\s*<moodle-actions\b[\s\S]*?(?:<\/moodle-actions>|$)/gi, "");
}

function asksToOpenPDF(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return /\bpdf\b/.test(normalized) && /(open|show|display|öffne|oeffne|zeige|lad|lade)/i.test(normalized);
}

function courseContext(course: Course) {
  return {
    id: String(course.id),
    title: courseTitle(course),
    subtitle: courseSubtitle(course),
    category: course.categoryName ?? course.category ?? null,
    citation: `[${courseTitle(course)}](moodle-course:${encodeCitationPart(course.id)})`,
  };
}

function materialContext(material: Material) {
  return {
    id: material.id,
    name: material.name,
    type: material.type ?? null,
    fileType: material.fileType ?? null,
    sectionName: material.sectionName ?? null,
    courseId: material.courseId ?? null,
    uploadedAt: material.uploadedAt ?? null,
    citation: materialCitation(material),
  };
}

export function materialCitation(material: Material): string | null {
  const courseId = material.courseId == null ? null : String(material.courseId);
  if (!courseId) {
    return null;
  }
  return `[${material.name}](moodle-resource:${encodeCitationPart(courseId)}:${encodeCitationPart(material.id)})`;
}

function encodeCitationPart(value: string | number): string {
  return encodeURIComponent(String(value));
}

function findActionCourse(action: MoodleUIAction, courses: Course[]): Course | null {
  const courseId = "courseId" in action ? action.courseId : null;
  if (!courseId) {
    return null;
  }
  return courses.find((candidate) => String(candidate.id) === String(courseId)) ?? null;
}

function findActionMaterial(action: MoodleUIAction, materials: Material[]): Material | null {
  const materialId =
    action.type === "open_material" ? action.materialId : action.type === "open_resource" ? action.resourceId : null;
  if (!materialId) {
    return null;
  }
  return materials.find((candidate) => candidate.id === materialId) ?? null;
}

function actionDetail(action: MoodleUIAction): string | undefined {
  if (action.type === "scroll_pdf_to_page") {
    return `Seite ${action.page}`;
  }
  if (action.type === "set_task_status") {
    return action.status === "done" ? "Als erledigt markieren" : "Wieder öffnen";
  }
  return undefined;
}
