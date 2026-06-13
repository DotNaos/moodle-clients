"use client";

import { ChevronRight } from "lucide-react";

import type { StudyMode } from "@/components/study-mode-actions";
import type { HomeView } from "@/lib/home-navigation";
import type { Course, Material } from "@/lib/dashboard-data";
import { courseTitle } from "@/lib/dashboard-data";
import type { StudyOutline } from "@/lib/study-outline";
import { taskDisplayTitle } from "@/lib/study-outline";
import { cn } from "@/lib/utils";

type BreadcrumbSegment = {
  label: string;
  onClick?: () => void;
};

function studyModeLabel(studyMode: StudyMode): string {
  if (studyMode === "tasks") return "Aufgaben";
  if (studyMode === "script") return "Script";
  if (studyMode === "formula") return "Formeln";
  if (studyMode === "recordings") return "Aufzeichnungen";
  return "Materialien";
}

function buildSegments({
  homeView,
  navigationMode,
  selectedCourse,
  selectedMaterial,
  selectedScriptSectionId,
  selectedTaskId,
  studyMode,
  studyOutline,
  onBackToCourses,
  onOpenCourseRoot,
  onOpenStudyModeRoot,
  courseHubOpen,
}: {
  homeView: HomeView;
  navigationMode: "courses" | "materials";
  courseHubOpen: boolean;
  selectedCourse: Course | null;
  selectedMaterial: Material | null;
  selectedScriptSectionId: string | null;
  selectedTaskId: string | null;
  studyMode: StudyMode;
  studyOutline: StudyOutline;
  onBackToCourses: () => void;
  onOpenCourseRoot: () => void;
  onOpenStudyModeRoot: () => void;
}): BreadcrumbSegment[] {
  if (navigationMode === "courses") {
    if (homeView === "calendar") {
      return [{ label: "Kalender" }];
    }

    return [{ label: "Courses" }];
  }

  const segments: BreadcrumbSegment[] = [{ label: "Courses", onClick: onBackToCourses }];

  if (selectedCourse) {
    segments.push({ label: courseTitle(selectedCourse), onClick: onOpenCourseRoot });
  }

  if (courseHubOpen) {
    return segments;
  }

  const leafLabel = getLeafLabel({
    selectedMaterial,
    selectedScriptSectionId,
    selectedTaskId,
    studyMode,
    studyOutline,
  });
  const hasLeaf = Boolean(leafLabel);

  segments.push({
    label: studyModeLabel(studyMode),
    onClick: hasLeaf ? onOpenStudyModeRoot : undefined,
  });

  if (leafLabel) {
    segments.push({ label: leafLabel });
  }

  return segments;
}

function getLeafLabel({
  selectedMaterial,
  selectedScriptSectionId,
  selectedTaskId,
  studyMode,
  studyOutline,
}: {
  selectedMaterial: Material | null;
  selectedScriptSectionId: string | null;
  selectedTaskId: string | null;
  studyMode: StudyMode;
  studyOutline: StudyOutline;
}): string | null {
  if (studyMode === "materials" && selectedMaterial) {
    return selectedMaterial.name;
  }

  if (studyMode === "tasks" && selectedTaskId) {
    const task = studyOutline.tasks.find((task) => task.id === selectedTaskId);
    if (task) {
      return taskDisplayTitle(task.sheetTitle, task.title);
    }
    return null;
  }

  if (studyMode === "script" && selectedScriptSectionId) {
    return studyOutline.scriptSections.find((section) => section.id === selectedScriptSectionId)?.title ?? null;
  }

  return null;
}

export function DashboardNavBreadcrumb({
  className,
  homeView,
  navigationMode,
  courseHubOpen,
  selectedCourse,
  selectedMaterial,
  selectedScriptSectionId,
  selectedTaskId,
  studyMode,
  studyOutline,
  onBackToCourses,
  onOpenCourseRoot,
  onOpenStudyModeRoot,
}: {
  className?: string;
  homeView: HomeView;
  navigationMode: "courses" | "materials";
  courseHubOpen: boolean;
  selectedCourse: Course | null;
  selectedMaterial: Material | null;
  selectedScriptSectionId: string | null;
  selectedTaskId: string | null;
  studyMode: StudyMode;
  studyOutline: StudyOutline;
  onBackToCourses: () => void;
  onOpenCourseRoot: () => void;
  onOpenStudyModeRoot: () => void;
}) {
  const segments = buildSegments({
    homeView,
    navigationMode,
    courseHubOpen,
    selectedCourse,
    selectedMaterial,
    selectedScriptSectionId,
    selectedTaskId,
    studyMode,
    studyOutline,
    onBackToCourses,
    onOpenCourseRoot,
    onOpenStudyModeRoot,
  });

  return (
    <nav aria-label="Workspace navigation" className={cn("flex min-w-0 flex-1 items-center gap-2", className)}>
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;

          return (
            <li key={`${segment.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/70" /> : null}
              {segment.onClick && !isLast ? (
                <button
                  className="truncate text-muted-foreground transition-colors hover:text-foreground"
                  onClick={segment.onClick}
                  type="button"
                >
                  {segment.label}
                </button>
              ) : (
                <span className={cn("truncate", isLast ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {segment.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
