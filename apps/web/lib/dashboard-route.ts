import type { StudyMode } from "@/components/study-mode-actions";

const ROUTABLE_STUDY_MODES = new Set<StudyMode>(["materials", "tasks", "script", "formula", "recordings"]);

export type DashboardRoute = {
  codexOpen: boolean;
  courseId: string | null;
  homeView: "courses" | "calendar";
  materialId: string | null;
  mode: StudyMode;
  recordingId: string | null;
  sectionId: string | null;
  taskId: string | null;
};

export type DashboardRouteURLInput = {
  codexOpen: boolean;
  homeView: "courses" | "calendar";
  navigationMode: "courses" | "materials";
  recordingId: string | null;
  selectedCourseId: string | null;
  selectedMaterialId: string | null;
  selectedScriptSectionId: string | null;
  selectedTaskId: string | null;
  studyMode: StudyMode;
};

export function readDashboardRoute(): DashboardRoute {
  if (typeof window === "undefined") {
    return defaultDashboardRoute();
  }
  return parseDashboardRouteSearch(window.location.search);
}

export function parseDashboardRouteSearch(search: string): DashboardRoute {
  const params = new URLSearchParams(search);
  const modeParam = params.get("mode");
  const mode: StudyMode = modeParam && ROUTABLE_STUDY_MODES.has(modeParam as StudyMode)
    ? modeParam as StudyMode
    : "materials";
  const courseId = cleanRouteParam(params.get("course"));

  return {
    codexOpen: params.get("codex") === "1",
    courseId,
    homeView: params.get("view") === "calendar" ? "calendar" : "courses",
    materialId: cleanRouteParam(params.get("material")),
    mode: courseId ? mode : "materials",
    recordingId: cleanRouteParam(params.get("recording")),
    sectionId: cleanRouteParam(params.get("section")),
    taskId: cleanRouteParam(params.get("task")),
  };
}

export function defaultDashboardRoute(): DashboardRoute {
  return {
    codexOpen: false,
    courseId: null,
    homeView: "courses",
    materialId: null,
    mode: "materials",
    recordingId: null,
    sectionId: null,
    taskId: null,
  };
}

export function buildDashboardRouteURL({
  codexOpen,
  homeView,
  navigationMode,
  recordingId,
  selectedCourseId,
  selectedMaterialId,
  selectedScriptSectionId,
  selectedTaskId,
  studyMode,
}: DashboardRouteURLInput): string {
  const params = new URLSearchParams();

  if (navigationMode === "courses" || !selectedCourseId) {
    if (homeView === "calendar") {
      params.set("view", "calendar");
    }
    if (codexOpen) {
      params.set("codex", "1");
    }
    return routePathWithParams(params);
  }

  params.set("course", selectedCourseId);
  params.set("mode", studyMode);
  if (studyMode === "materials" && selectedMaterialId) {
    params.set("material", selectedMaterialId);
  }
  if (studyMode === "tasks" && selectedTaskId) {
    params.set("task", selectedTaskId);
  }
  if (studyMode === "script" && selectedScriptSectionId) {
    params.set("section", selectedScriptSectionId);
  }
  if (studyMode === "recordings" && recordingId) {
    params.set("recording", recordingId);
  }
  if (codexOpen) {
    params.set("codex", "1");
  }
  return routePathWithParams(params);
}

function routePathWithParams(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function cleanRouteParam(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
