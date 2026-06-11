"use client";

import { FileText } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { CourseHero } from "@/components/course-hero";
import { MaterialsOutline, ScriptOutline, TaskOutline } from "@/components/course-study-outline";
import { FileViewer } from "@/components/file-viewer";
import { FormulaCollectionPanel } from "@/components/formula-collection-panel";
import { StudyPipelineAction } from "@/components/study-pipeline-action";
import { buildScriptPDFMapping, TaskStudyPanel, type TaskViewResponse } from "@/components/task-study-panel";
import { WebexRecordingsPanel } from "@/components/webex-recordings-panel";
import type { Course, Material, WebexRecording, WebexRecordingState } from "@/lib/dashboard-data";
import type { PDFScrollCommand, PDFViewState } from "@/lib/pdf-context";
import type { StudyOutline } from "@/lib/study-outline";
import type { StudyMode } from "@/components/study-mode-actions";

export function CourseMainPanel({
  course,
  courseHubOpen,
  courseId,
  material,
  materials,
  materialsBySection,
  materialsLoading,
  recordingsState,
  selectedRecording,
  studyMode,
  studyOutline,
  pdfScrollCommand,
  onPDFStateChange,
  onOpenResource,
  onLoadRecordings,
  onPlayRecording,
  onSelectMaterial,
  onSelectScriptSection,
  onSelectTask,
  onTaskStatusChange,
  onSelectedScriptSectionIdChange,
  onSelectedTaskIdChange,
  onSignInWebexBrowser,
  onStudyOutlineChange,
  taskViewOverride,
  selectedScriptSectionId,
  selectedTaskId,
}: {
  course: Course | null;
  courseHubOpen: boolean;
  courseId: string | null;
  material: Material | null;
  materials: Material[];
  materialsBySection: [string, Material[]][];
  materialsLoading: boolean;
  recordingsState?: WebexRecordingState;
  selectedScriptSectionId: string | null;
  selectedRecording: WebexRecording | null;
  selectedTaskId: string | null;
  studyMode: StudyMode;
  studyOutline: StudyOutline;
  pdfScrollCommand: PDFScrollCommand | null;
  onEnterStudyMode: (mode: StudyMode) => void;
  onOpenResource: (resourceId: string) => void;
  onPDFStateChange: (state: PDFViewState | null) => void;
  onLoadRecordings: () => void;
  onPlayRecording: (recording: WebexRecording) => void;
  onSelectMaterial: (material: Material) => void;
  onSelectScriptSection: (sectionId: string) => void;
  onSelectTask: (taskId: string) => void;
  onTaskStatusChange: (taskId: string, status: "done" | "open") => void;
  onSelectedScriptSectionIdChange: (sectionId: string | null) => void;
  onSelectedTaskIdChange: (taskId: string | null) => void;
  onSignInWebexBrowser: (credentials: { username: string; password: string }) => Promise<void>;
  onStudyOutlineChange: (outline: StudyOutline) => void;
  taskViewOverride?: TaskViewResponse;
}) {
  const [taskView, setTaskView] = useState<TaskViewResponse | null>(null);
  const pdfMapping = useMemo(
    () => (taskView ? buildScriptPDFMapping(taskView.scriptMarkdown, taskView.resources) : []),
    [taskView],
  );

  useEffect(() => {
    setTaskView(null);
  }, [courseId]);

  if (!course) {
    return (
      <CoursePanelShell>
        <NoCourseSelected />
      </CoursePanelShell>
    );
  }

  if (courseHubOpen) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden md:h-full">
        <div className="min-h-0 flex-1 overflow-auto">
          <CourseHero course={course} />
          <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6 md:py-6">
            <p className="mb-5 text-sm text-muted-foreground">
              Materialien, Aufgaben, Script und mehr erreichst du über die Sidebar links.
            </p>
            {courseId ? <StudyPipelineAction courseId={courseId} /> : null}
          </div>
        </div>
      </section>
    );
  }

  if (studyMode === "recordings") {
    return (
      <section className="flex min-h-[60dvh] flex-col overflow-visible md:h-full md:min-h-0 md:overflow-hidden">
        <WebexRecordingsPanel
          course={course}
          state={recordingsState}
          selectedRecording={selectedRecording}
          onLoad={onLoadRecordings}
          onPlay={onPlayRecording}
          onSignInWebexBrowser={onSignInWebexBrowser}
        />
      </section>
    );
  }

  if (studyMode === "formula") {
    return (
      <section className="flex min-h-[60dvh] flex-col overflow-visible md:h-full md:min-h-0 md:overflow-hidden">
        {courseId ? (
          <FormulaCollectionPanel
            course={course}
            courseId={courseId}
            onTaskViewChange={setTaskView}
            pdfMapping={pdfMapping}
            view={taskView}
          />
        ) : (
          <NoCourseSelected />
        )}
      </section>
    );
  }

  if (studyMode === "materials") {
    if (material) {
      return (
        <section className="flex min-h-[70dvh] flex-col overflow-hidden md:h-full md:min-h-0">
          <FileViewer
            courseId={courseId}
            material={material}
            onPDFStateChange={onPDFStateChange}
            pdfScrollCommand={pdfScrollCommand}
          />
        </section>
      );
    }

    return (
      <CoursePanelShell course={course}>
        <MaterialsOutline
          materials={materials}
          materialsBySection={materialsBySection}
          materialsLoading={materialsLoading}
          selectedMaterialId={null}
          onSelectMaterial={onSelectMaterial}
        />
      </CoursePanelShell>
    );
  }

  if (studyMode === "tasks" && !selectedTaskId && studyOutline.tasks.length > 0) {
    return (
      <CoursePanelShell course={course}>
        <TaskOutline
          selectedTaskId={selectedTaskId}
          tasks={studyOutline.tasks}
          onSelectTask={onSelectTask}
          onTaskStatusChange={onTaskStatusChange}
        />
      </CoursePanelShell>
    );
  }

  if (studyMode === "script" && !selectedScriptSectionId && studyOutline.scriptSections.length > 0) {
    return (
      <CoursePanelShell course={course}>
        <ScriptOutline
          scriptSections={studyOutline.scriptSections}
          selectedScriptSectionId={selectedScriptSectionId}
          onSelectScriptSection={onSelectScriptSection}
        />
      </CoursePanelShell>
    );
  }

  if (studyMode === "tasks" || studyMode === "script") {
    return (
      <section className="flex min-h-[60dvh] flex-col overflow-visible md:h-full md:min-h-0 md:overflow-hidden">
        <TaskStudyPanel
          course={course}
          materials={materials}
          mode={studyMode}
          onOpenResource={onOpenResource}
          onSelectedScriptSectionIdChange={onSelectedScriptSectionIdChange}
          onSelectedTaskIdChange={onSelectedTaskIdChange}
          onStudyOutlineChange={onStudyOutlineChange}
          onTaskViewChange={setTaskView}
          taskViewOverride={taskViewOverride}
          selectedScriptSectionId={selectedScriptSectionId}
          selectedTaskId={selectedTaskId}
        />
      </section>
    );
  }

  return (
    <CoursePanelShell>
      <NoCourseSelected />
    </CoursePanelShell>
  );
}

function CoursePanelShell({ children, course }: { children: ReactNode; course?: Course | null }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden md:h-full">
      <div className="min-h-0 flex-1 overflow-auto">
        {course ? <CourseHero course={course} /> : null}
        <div className="mx-auto w-full max-w-3xl px-4 py-4 md:px-6 md:py-5">
          {children}
        </div>
      </div>
    </section>
  );
}

function NoCourseSelected() {
  return (
    <div className="grid min-h-[40dvh] place-items-center py-8 text-center">
      <div className="max-w-sm">
        <FileText className="mx-auto mb-3 text-muted-foreground" aria-hidden />
        <p className="font-medium">No course selected</p>
        <p className="mt-1 text-sm text-muted-foreground">Choose a course to open its study workspace.</p>
      </div>
    </div>
  );
}
