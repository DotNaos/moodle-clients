"use client";

import { ExternalLink, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CourseThumbnail } from "@/components/dashboard-ui";
import { FileViewer } from "@/components/file-viewer";
import { FormulaCollectionPanel } from "@/components/formula-collection-panel";
import { buildScriptPDFMapping, TaskStudyPanel, type TaskViewResponse } from "@/components/task-study-panel";
import { WebexRecordingsPanel } from "@/components/webex-recordings-panel";
import { Button } from "@/components/ui/button";
import type { Course, Material, WebexRecording, WebexRecordingState } from "@/lib/dashboard-data";
import { courseSubtitle, courseTitle } from "@/lib/dashboard-data";
import type { PDFScrollCommand, PDFViewState } from "@/lib/pdf-context";
import type { StudyOutline } from "@/lib/study-outline";
import type { StudyMode } from "@/components/study-mode-actions";

export function CourseMainPanel({
  course,
  courseId,
  material,
  materials,
  recordingsState,
  selectedRecording,
  studyMode,
  pdfScrollCommand,
  onPDFStateChange,
  onOpenResource,
  onLoadRecordings,
  onPlayRecording,
  onSelectedScriptSectionIdChange,
  onSelectedTaskIdChange,
  onSignInWebexBrowser,
  onStudyOutlineChange,
  selectedScriptSectionId,
  selectedTaskId,
}: {
  course: Course | null;
  courseId: string | null;
  material: Material | null;
  materials: Material[];
  recordingsState?: WebexRecordingState;
  selectedScriptSectionId: string | null;
  selectedRecording: WebexRecording | null;
  selectedTaskId: string | null;
  studyMode: StudyMode;
  pdfScrollCommand: PDFScrollCommand | null;
  onOpenResource: (resourceId: string) => void;
  onPDFStateChange: (state: PDFViewState | null) => void;
  onLoadRecordings: () => void;
  onPlayRecording: (recording: WebexRecording) => void;
  onSelectedScriptSectionIdChange: (sectionId: string | null) => void;
  onSelectedTaskIdChange: (taskId: string | null) => void;
  onSignInWebexBrowser: (credentials: { username: string; password: string }) => Promise<void>;
  onStudyOutlineChange: (outline: StudyOutline) => void;
}) {
  const [taskView, setTaskView] = useState<TaskViewResponse | null>(null);
  const pdfMapping = useMemo(
    () => taskView ? buildScriptPDFMapping(taskView.scriptMarkdown, taskView.resources) : [],
    [taskView],
  );

  useEffect(() => {
    setTaskView(null);
  }, [courseId]);

  if (studyMode === "recordings") {
    return (
      <WebexRecordingsPanel
        course={course}
        state={recordingsState}
        selectedRecording={selectedRecording}
        onLoad={onLoadRecordings}
        onPlay={onPlayRecording}
        onSignInWebexBrowser={onSignInWebexBrowser}
      />
    );
  }

  if (studyMode === "tasks" || studyMode === "script") {
    return (
      <section className="flex min-h-[60dvh] flex-col overflow-visible rounded-[1.5rem] bg-card lg:min-h-0 lg:overflow-hidden lg:rounded-[2rem]">
        <TaskStudyPanel
          course={course}
          materials={materials}
          mode={studyMode}
          onOpenResource={onOpenResource}
          onSelectedScriptSectionIdChange={onSelectedScriptSectionIdChange}
          onSelectedTaskIdChange={onSelectedTaskIdChange}
          onStudyOutlineChange={onStudyOutlineChange}
          onTaskViewChange={setTaskView}
          selectedScriptSectionId={selectedScriptSectionId}
          selectedTaskId={selectedTaskId}
        />
      </section>
    );
  }

  if (studyMode === "formula") {
    return (
      <section className="flex min-h-[60dvh] flex-col overflow-visible rounded-[1.5rem] bg-card lg:min-h-0 lg:overflow-hidden lg:rounded-[2rem]">
        {course ? (
          <FormulaCollectionPanel course={course} pdfMapping={pdfMapping} view={taskView} />
        ) : (
          <NoCourseSelected />
        )}
      </section>
    );
  }

  if (material) {
    return (
      <section className="flex min-h-[70dvh] flex-col overflow-hidden rounded-[1.5rem] bg-card lg:min-h-0 lg:rounded-[2rem]">
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
    <section className="flex min-h-[50dvh] flex-col overflow-hidden rounded-[1.5rem] bg-card lg:min-h-0 lg:rounded-[2rem]">
      {course ? <CourseOverview course={course} /> : <NoCourseSelected />}
    </section>
  );
}

function CourseOverview({ course }: { course: Course }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center px-8 py-8">
      <div className="w-full max-w-2xl">
        <div className="flex items-start gap-5">
          <CourseThumbnail course={course} size="large" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Selected course</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{courseTitle(course)}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{courseSubtitle(course)}</p>
          </div>
        </div>
        <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-[1.5rem] bg-muted px-5 py-4 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">Choose a material from the left to preview it here.</p>
          {course.viewUrl ? (
            <Button asChild variant="secondary">
              <a href={course.viewUrl} target="_blank" rel="noreferrer">
                Open Moodle <ExternalLink aria-hidden />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NoCourseSelected() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center px-8 py-8 text-center">
      <div className="max-w-sm">
        <FileText className="mx-auto mb-3 text-muted-foreground" aria-hidden />
        <p className="font-medium">No course selected</p>
        <p className="mt-1 text-sm text-muted-foreground">Choose a course on the left to open its materials.</p>
      </div>
    </div>
  );
}
