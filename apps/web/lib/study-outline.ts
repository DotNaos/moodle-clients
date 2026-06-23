export type StudyTaskOutline = {
  id: string;
  readOnly?: boolean;
  readiness?: "ready" | "unprocessed" | "unknown" | string;
  readinessLabel?: string;
  sectionTitle?: string;
  sheetTitle: string;
  status: TaskProgressStatus;
  title: string;
};

export type TaskProgressStatus = "open" | "started" | "done" | "checked" | "correct" | "wrong" | "needs_review" | string;

export type ScriptSectionOutline = {
  blockIndex: number;
  id: string;
  level: number;
  title: string;
};

export type StudyOutline = {
  scriptSections: ScriptSectionOutline[];
  tasks: StudyTaskOutline[];
};

export const EMPTY_STUDY_OUTLINE: StudyOutline = {
  scriptSections: [],
  tasks: [],
};

type TaskViewOutlineSource = {
  sheets: Array<{
    readOnly?: boolean;
    readiness?: "ready" | "unprocessed" | "unknown" | string;
    readinessLabel?: string;
    sectionName?: string;
    title: string;
    tasks: Array<{
      sectionName?: string;
      status: TaskProgressStatus;
      taskId: string;
      title: string;
    }>;
  }>;
};

export function buildStudyOutlineFromTaskView(view: TaskViewOutlineSource): StudyOutline {
  return {
    scriptSections: [],
    tasks: view.sheets.flatMap((sheet) =>
      sheet.tasks.map((task) => ({
        id: task.taskId,
        readOnly: Boolean(sheet.readOnly),
        readiness: sheet.readiness,
        readinessLabel: sheet.readinessLabel,
        sectionTitle: task.sectionName ?? sheet.sectionName,
        sheetTitle: sheet.title,
        status: task.status,
        title: task.title,
      })),
    ),
  };
}

// Combines sheet and task numbering into one label: "Aufgabenblatt 01" +
// "Aufgabe 1" → "Aufgabe 1.1". Titles outside that pattern stay unchanged.
export function taskDisplayTitle(sheetTitle: string | null | undefined, taskTitle: string): string {
  const sheetNumber = firstNumberIn(sheetTitle ?? "");
  const taskMatch = taskTitle.match(/^aufgabe\s*0*(\d+)(.*)$/i);
  if (sheetNumber === null || !taskMatch) {
    return taskTitle;
  }
  return `Aufgabe ${sheetNumber}.${Number(taskMatch[1])}${taskMatch[2]}`;
}

function firstNumberIn(value: string): number | null {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}
