export type StudyTaskOutline = {
  id: string;
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
