"use client";

import katex from "katex";
import { AlertCircle, ArrowLeft, ArrowRight, BookOpenText, CheckCircle2, Circle, Columns2, FileText, Gauge, Lightbulb, Maximize2, MessageCircle, Minimize2, MoreHorizontal, PanelRightClose, PanelRightOpen, Pencil, Play, RefreshCw, Rows3, Sparkles, Square, X } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ExtractedDocumentsResponse } from "@/components/extracted-document-inspector";
import { MobileSheet } from "@/components/mobile-sheet";
import {
  StudyPipelinePreview,
  type CourseInventoryResponse,
  type StudyPipelineStage,
  type StudyPipelineStatusResponse,
} from "@/components/study-pipeline-preview";
import { PDFDocumentViewer } from "@/components/pdf-document-viewer";
import type { StudyTestContext } from "@/lib/codex-chat";
import type { Course, Material } from "@/lib/dashboard-data";
import { courseTitle } from "@/lib/dashboard-data";
import type { StudyOutline } from "@/lib/study-outline";
import { EMPTY_STUDY_OUTLINE, taskDisplayTitle } from "@/lib/study-outline";
import { cn } from "@/lib/utils";

export type TaskViewResponse = {
  courseId: string;
  generatedAt: string;
  source?: "study-bundle" | "moodle-services";
  scriptMarkdown: string;
  scriptSections?: StudyContentState[];
  sheets: Array<{
    resourceId: string;
    title: string;
    kind: string;
    solutionResourceId?: string;
    solutionTitle?: string;
    solutionMarkdown?: string;
    tasks: TaskViewTask[];
  }>;
  resources: Array<{
    resourceId: string;
    title: string;
    kind: string;
  }>;
  progress: {
    open: number;
    done: number;
    checked: number;
    correct: number;
    wrong: number;
    needsReview: number;
  };
};

type TaskViewTask = {
  taskId: string;
  sourceResourceId: string;
  title: string;
  promptMarkdown: string;
  contentState?: StudyContentState;
  parts: Array<{ id: string; label?: string; promptMarkdown: string }>;
  latestAttempt?: {
    userAnswer: string;
    verdict: {
      isCorrect: boolean;
      feedbackMarkdown: string;
      mistakes: string[];
      suggestedNextStep?: string;
    };
  };
  status: "open" | "started" | "done" | "checked" | "correct" | "wrong" | "needs_review";
};

export type StudyContentState = {
  id: string;
  kind: "script-section" | "task" | string;
  title: string;
  status: "machine-extracted" | "codex-improved" | string;
  statusLabel: string;
  model?: string;
  updatedAt?: string;
  sourcePath?: string;
};

export type ScriptPDFMappingItem = {
  areas: string[];
  order: number;
  resourceId: string;
  title: string;
};

const PIPELINE_FEEDBACK_OPTIONS = [
  { id: "task_missing", label: "Aufgabe fehlt" },
  { id: "image_missing", label: "Bild fehlt" },
  { id: "solution_wrong", label: "Lösung stimmt nicht" },
  { id: "ocr_bad", label: "Text falsch erkannt" },
  { id: "task_confusing", label: "Aufgabe unklar" },
  { id: "other", label: "Etwas anderes" },
] as const;

type Mode = "tasks" | "script";

type FeedbackTarget = {
  message?: string;
  targetId: string;
  targetKind: string;
  title?: string;
  type: (typeof PIPELINE_FEEDBACK_OPTIONS)[number]["id"];
};

export function TaskStudyPanel({
  course,
  materials,
  mode,
  onOpenResource,
  onSelectedTaskIdChange,
  onSelectedScriptSectionIdChange,
  onStudyOutlineChange,
  onTaskViewChange,
  onTestActivityChange,
  selectedScriptSectionId,
  selectedTaskId,
  taskViewOverride,
}: {
  course: Course | null;
  materials: Material[];
  mode: Mode;
  onOpenResource: (resourceId: string) => void;
  onSelectedTaskIdChange: (taskId: string | null) => void;
  onSelectedScriptSectionIdChange: (sectionId: string | null) => void;
  onStudyOutlineChange: (outline: StudyOutline) => void;
  onTaskViewChange?: (view: TaskViewResponse | null) => void;
  onTestActivityChange?: (test: StudyTestContext | null) => void;
  selectedScriptSectionId: string | null;
  selectedTaskId: string | null;
  taskViewOverride?: TaskViewResponse;
}) {
  const [view, setView] = useState<TaskViewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updatingTaskStatus, setUpdatingTaskStatus] = useState(false);
  const [scriptIncluded, setScriptIncluded] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<StudyPipelineStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [courseInventory, setCourseInventory] = useState<CourseInventoryResponse | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [extractedDocuments, setExtractedDocuments] = useState<ExtractedDocumentsResponse | null>(null);
  const [extractedLoading, setExtractedLoading] = useState(false);
  const [extractedError, setExtractedError] = useState<string | null>(null);
  const [runningStage, setRunningStage] = useState<StudyPipelineStage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState<FeedbackTarget | null>(null);
  const [feedbackType, setFeedbackType] = useState<(typeof PIPELINE_FEEDBACK_OPTIONS)[number]["id"]>("task_confusing");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [taskMode, setTaskMode] = useState<"view" | "test">("view");
  const [testLayout, setTestLayout] = useState<TaskTestLayout>(() => {
    if (typeof window === "undefined") {
      return "split";
    }
    return window.localStorage.getItem(TASK_TEST_LAYOUT_STORAGE_KEY) === "stacked" ? "stacked" : "split";
  });
  const [testComposerOpen, setTestComposerOpen] = useState(true);

  useEffect(() => {
    window.localStorage.setItem(TASK_TEST_LAYOUT_STORAGE_KEY, testLayout);
  }, [testLayout]);
  const [previewResourceId, setPreviewResourceId] = useState<string | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const loadRequestId = useRef(0);

  const courseId = course ? String(course.id) : null;
  const tasks = useMemo(() => view?.sheets.flatMap((sheet) => sheet.tasks) ?? [], [view]);
  const selectedTask = useMemo(
    () => selectedTaskId
      ? tasks.find((task) => task.taskId === selectedTaskId)
        ?? tasks.find((task) => selectedTaskId.startsWith(`${task.taskId}-`) || task.taskId.startsWith(`${selectedTaskId}-`))
        ?? null
      : null,
    [selectedTaskId, tasks],
  );
  const selectedSheet = useMemo(
    () => view?.sheets.find((sheet) => sheet.tasks.some((task) => task.taskId === selectedTask?.taskId)) ?? null,
    [selectedTask, view],
  );
  const flatTasks = useMemo(() => view?.sheets.flatMap((sheet) => sheet.tasks) ?? [], [view]);
  const selectedTaskIndex = selectedTask
    ? flatTasks.findIndex((task) => task.taskId === selectedTask.taskId)
    : -1;
  const previousTask = selectedTaskIndex > 0 ? flatTasks[selectedTaskIndex - 1] : null;
  const nextTask = selectedTaskIndex >= 0 ? flatTasks[selectedTaskIndex + 1] ?? null : null;
  // The chapter (Moodle section) the selected task's sheet belongs to.
  const selectedTaskChapter = useMemo(() => {
    if (!selectedTask) {
      return null;
    }
    const materials = asArray(pipelineStatus?.materials);
    const material =
      materials.find((item) => item.id === selectedTask.sourceResourceId) ??
      materials.find((item) => item.id === selectedSheet?.resourceId);
    return material?.sectionName?.trim() || null;
  }, [pipelineStatus, selectedSheet, selectedTask]);

  // Live tutor context for the Codex chat: while the test mode is active, the
  // chat sees the focused subtask, the answer draft, and the stored solution.
  const testContextSourceRef = useRef({ onTestActivityChange, selectedSheet, selectedTask });
  testContextSourceRef.current = { onTestActivityChange, selectedSheet, selectedTask };
  const handleTestActivityChange = useCallback(
    (activity: { answerDraft: string; stepLabel: string | null; stepPrompt: string | null } | null) => {
      const { onTestActivityChange: notify, selectedSheet: sheet, selectedTask: task } = testContextSourceRef.current;
      if (!notify) {
        return;
      }
      if (!activity || !task) {
        notify(null);
        return;
      }
      notify({
        active: true,
        taskId: task.taskId,
        taskTitle: task.title,
        sheetTitle: sheet?.title ?? null,
        stepLabel: activity.stepLabel,
        stepPrompt: activity.stepPrompt,
        answerDraft: activity.answerDraft.trim() ? activity.answerDraft : null,
        solutionMarkdown: sheet?.solutionMarkdown ? sheet.solutionMarkdown.slice(0, 20000) : null,
        lastFeedbackMarkdown: task.latestAttempt?.verdict.feedbackMarkdown ?? null,
      });
    },
    [],
  );
  const materialById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
  const previewMaterial = previewResourceId ? materialById.get(previewResourceId) ?? null : null;
  const previewResource = previewResourceId
    ? view?.resources.find((resource) => resource.resourceId === previewResourceId) ?? null
    : null;
  const previewTitle = previewMaterial?.name ?? previewResource?.title ?? "Original-PDF";
  const previewPDFUrl = courseId && previewResourceId
    ? `/api/moodle/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(previewResourceId)}/pdf`
    : "";

  useEffect(() => {
    const controller = new AbortController();
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;
    setView(null);
    onStudyOutlineChange(EMPTY_STUDY_OUTLINE);
    setScriptIncluded(false);
    onTaskViewChange?.(null);
    setMessage(null);
    setError(null);
    setCourseInventory(null);
    setInventoryError(null);
    setInventoryLoading(false);
    setExtractedDocuments(null);
    setExtractedError(null);
    setExtractedLoading(false);
    if (taskViewOverride && (mode !== "script" || taskViewOverride.scriptMarkdown.trim())) {
      applyView(taskViewOverride, Boolean(taskViewOverride.scriptMarkdown));
      setLoading(false);
      return () => {
        controller.abort();
      };
    }
    if (courseId) {
      void loadPipelineStatus(courseId, mode === "script", {
        requestId,
        signal: controller.signal,
      });
    }
    return () => {
      controller.abort();
    };
  }, [courseId, mode, taskViewOverride]);

  useEffect(() => {
    if (!selectedTask) {
      setPreviewResourceId(null);
      setPreviewExpanded(false);
      return;
    }
    setTaskMode("view");
    setPreviewResourceId(null);
    setPreviewExpanded(false);
  }, [selectedTask?.taskId]);

  useEffect(() => {
    if (!view) {
      onStudyOutlineChange(EMPTY_STUDY_OUTLINE);
      return;
    }
    onStudyOutlineChange({
      tasks: buildTaskOutline(view, pipelineStatus),
      scriptSections: extractScriptSections(view.scriptMarkdown),
    });
  }, [onStudyOutlineChange, pipelineStatus, view]);

  if (!course || !courseId) {
    return (
      <section className="grid min-h-0 flex-1 place-items-center px-8 py-8 text-center">
        <div>
          <FileText className="mx-auto mb-3 text-muted-foreground" aria-hidden />
          <p className="font-medium">No course selected</p>
          <p className="mt-1 text-sm text-muted-foreground">Choose a course before opening tasks or the script.</p>
        </div>
      </section>
    );
  }

  async function loadPipelineStatus(
    id: string,
    includeScript: boolean,
    request?: { requestId: number; signal: AbortSignal },
  ) {
    setStatusLoading(true);
    setInventoryLoading(true);
    setLoading(false);
    setError(null);
    setInventoryError(null);
    setMessage(null);
    try {
      const requestInit = request?.signal ? { signal: request.signal } : undefined;
      const [statusResult, inventoryResult] = await Promise.allSettled([
        studyPipelineRequest<StudyPipelineStatusResponse>(
          `/courses/${encodeURIComponent(id)}/study-pipeline`,
          requestInit,
        ),
        studyPipelineRequest<CourseInventoryResponse>(
          `/courses/${encodeURIComponent(id)}/study-pipeline/inventory`,
          requestInit,
        ),
      ]);
      if (request && (request.signal.aborted || request.requestId !== loadRequestId.current)) {
        return;
      }
      if (inventoryResult.status === "fulfilled") {
        setCourseInventory(inventoryResult.value);
      } else if (!isAbortError(inventoryResult.reason)) {
        setCourseInventory(null);
        setInventoryError(formatStudyPipelineError(inventoryResult.reason));
      }
      if (statusResult.status === "rejected") {
        throw statusResult.reason;
      }
      const status = statusResult.value;
      setPipelineStatus(status);
      if (status.stage === "curated") {
        await loadView(id, includeScript, request);
      }
    } catch (statusError) {
      if (!isAbortError(statusError)) {
        setError(formatStudyPipelineError(statusError));
      }
    } finally {
      if (!request || (!request.signal.aborted && request.requestId === loadRequestId.current)) {
        setStatusLoading(false);
        setInventoryLoading(false);
      }
    }
  }

  async function refreshInventory() {
    if (!courseId || inventoryLoading) {
      return;
    }
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const inventory = await studyPipelineRequest<CourseInventoryResponse>(
        `/courses/${encodeURIComponent(courseId)}/study-pipeline/inventory`,
      );
      setCourseInventory(inventory);
    } catch (loadError) {
      setCourseInventory(null);
      setInventoryError(formatStudyPipelineError(loadError));
    } finally {
      setInventoryLoading(false);
    }
  }

  async function loadExtractedDocuments() {
    if (!courseId || extractedLoading) {
      return;
    }
    setExtractedLoading(true);
    setExtractedError(null);
    try {
      const documents = await studyPipelineRequest<ExtractedDocumentsResponse>(
        `/courses/${encodeURIComponent(courseId)}/study-pipeline/extracted-documents`,
      );
      setExtractedDocuments(documents);
    } catch (loadError) {
      setExtractedDocuments(null);
      setExtractedError(formatStudyPipelineError(loadError));
    } finally {
      setExtractedLoading(false);
    }
  }

  async function runPipelineStage(stage: StudyPipelineStage) {
    if (!courseId || runningStage) {
      return;
    }
    setRunningStage(stage);
    setError(null);
    setMessage(stageMessage(stage, mode));
    if (stage !== "curated") {
      setView(null);
      onTaskViewChange?.(null);
      onStudyOutlineChange(EMPTY_STUDY_OUTLINE);
      setScriptIncluded(false);
    }
    try {
      await studyPipelineRequest(`/courses/${encodeURIComponent(courseId)}/study-pipeline/${stage}`, {
        method: "POST",
        body: JSON.stringify({ includeScript: mode === "script" }),
      });
      await loadPipelineStatus(courseId, mode === "script");
      if (stage === "curated") {
        await loadView(courseId, mode === "script");
      }
      setMessage(stageDoneMessage(stage, mode));
    } catch (stageError) {
      setError(formatStudyPipelineError(stageError));
    } finally {
      setRunningStage(null);
    }
  }

  async function loadView(
    id: string,
    includeScript = mode === "script",
    request?: { requestId: number; signal: AbortSignal },
  ) {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const nextView = await loadTaskViewResponse(id, includeScript, request?.signal);
      if (request && (request.signal.aborted || request.requestId !== loadRequestId.current)) {
        return;
      }
      applyView(nextView, includeScript);
      setMessage(null);
    } catch (loadError) {
      if (isAbortError(loadError)) {
        return;
      }
      setError(formatStudyPipelineError(loadError));
    } finally {
      if (!request || (!request.signal.aborted && request.requestId === loadRequestId.current)) {
        setLoading(false);
      }
    }
  }

  function applyView(nextView: TaskViewResponse, includeScript: boolean) {
    const displayView = normalizeTaskViewForDisplay(nextView);
    setView(displayView);
    onTaskViewChange?.(displayView);
    setScriptIncluded(includeScript);
    if (mode === "tasks" && selectedTaskId) {
      const exactTask = displayView.sheets.flatMap((sheet) => sheet.tasks).find((task) => task.taskId === selectedTaskId);
      if (!exactTask) {
        const compatibleTask = displayView.sheets
          .flatMap((sheet) => sheet.tasks)
          .find((task) => selectedTaskId.startsWith(`${task.taskId}-`) || task.taskId.startsWith(`${selectedTaskId}-`));
        if (compatibleTask) {
          onSelectedTaskIdChange(compatibleTask.taskId);
        }
      }
    }
  }

  async function checkAnswer(input: { answer: string; stepLabel?: string | null; stepPrompt?: string }) {
    if (!selectedTask || !course || !courseId || checking) {
      return;
    }
    const trimmed = input.answer.trim();
    if (!trimmed) {
      setError("Schreibe zuerst eine Antwort, bevor Codex bewertet.");
      return;
    }

    setChecking(true);
    setError(null);
    setMessage("Codex bewertet deine Antwort…");
    try {
      const feedback = await runCodex([
        "Check this student answer against the Moodle task.",
        "Return clear feedback: what is correct, what is wrong or missing, and what to do next.",
        "Answer in the language of the task.",
        "",
        `Course: ${courseTitle(course)}`,
        `Sheet: ${selectedSheet?.title ?? "Unknown"}`,
        `Task: ${selectedTask.title}`,
        "",
        "Task prompt:",
        taskPromptText(selectedTask),
        ...(input.stepPrompt
          ? [
              "",
              `The student is answering only this subtask (${input.stepLabel ?? "Teilaufgabe"}):`,
              input.stepPrompt,
            ]
          : []),
        "",
        `Student answer${input.stepLabel ? ` for ${input.stepLabel}` : ""}:`,
        trimmed,
      ].join("\n"));
      await studyPipelineRequest(`/courses/${encodeURIComponent(courseId)}/study-pipeline/tasks/${encodeURIComponent(selectedTask.taskId)}/attempts`, {
        method: "POST",
        body: JSON.stringify({
          userAnswer: trimmed,
          verdict: {
            isCorrect: false,
            confidence: 0.75,
            feedbackMarkdown: feedback.finalResponse,
            mistakes: [],
            suggestedNextStep: "Discuss the feedback with Codex or revise your answer.",
          },
        }),
      });
      await loadView(courseId, false);
      setMessage("Answer checked and saved.");
    } catch (checkError) {
      setError(getErrorMessage(checkError));
    } finally {
      setChecking(false);
    }
  }

  async function updateSelectedTaskStatus(status: "done" | "open") {
    if (!selectedTask || !courseId || !view || updatingTaskStatus) {
      return;
    }
    const nextView = updateTaskStatusInView(view, selectedTask.taskId, status);
    setUpdatingTaskStatus(true);
    setError(null);
    try {
      await studyPipelineRequest(
        `/courses/${encodeURIComponent(courseId)}/study-pipeline/tasks/${encodeURIComponent(selectedTask.taskId)}/status`,
        {
          method: "POST",
          body: JSON.stringify({ status }),
        },
      );
      setView(nextView);
      onTaskViewChange?.(nextView);
      setMessage(status === "done" ? "Aufgabe als erledigt markiert." : "Aufgabe wieder geöffnet.");
    } catch (statusError) {
      setError(getErrorMessage(statusError));
    } finally {
      setUpdatingTaskStatus(false);
    }
  }

  async function submitPipelineFeedback() {
    if (!courseId || submittingFeedback) {
      return;
    }
    const targetID = feedbackTarget?.targetId ?? selectedTask?.taskId ?? selectedSheet?.resourceId ?? courseId;
    const targetKind = feedbackTarget?.targetKind ?? (selectedTask ? "task" : selectedSheet ? "assignment_sheet" : "course");
    setSubmittingFeedback(true);
    setError(null);
    try {
      await studyPipelineRequest(`/courses/${encodeURIComponent(courseId)}/study-pipeline/feedback`, {
        method: "POST",
        body: JSON.stringify({
          feedbackType: feedbackTarget?.type ?? feedbackType,
          message: feedbackMessage.trim(),
          targetId: targetID,
          targetKind,
        }),
      });
      setFeedbackDialogOpen(false);
      setFeedbackTarget(null);
      setFeedbackMessage("");
      setFeedbackType("task_confusing");
      setMessage("Problem wurde im Pipeline Review erfasst.");
    } catch (feedbackError) {
      setError(getErrorMessage(feedbackError));
    } finally {
      setSubmittingFeedback(false);
    }
  }

  function openFeedbackDialog(target?: FeedbackTarget) {
    setFeedbackTarget(target ?? null);
    setFeedbackType(target?.type ?? "task_confusing");
    setFeedbackMessage(target?.message ?? "");
    setFeedbackDialogOpen(true);
  }

  const pageTitle = mode === "script"
    ? "Script"
    : selectedTask
      ? selectedSheet?.title ?? "Aufgabenblatt"
      : "Aufgaben";
  const pageSubtitle = mode === "tasks" && selectedTask
    ? selectedTask.title
    : courseTitle(course);
  const pageIcon = mode === "script" ? <BookOpenText aria-hidden className="size-4" /> : <CheckCircle2 aria-hidden className="size-4" />;
  const fatalLoadError = Boolean(error && !view && !loading && !runningStage);
  const coursePipelineHref = `/courses/${encodeURIComponent(courseId)}/pipeline`;
  const hasPdfActions = Boolean(selectedTask?.sourceResourceId || selectedSheet?.resourceId || selectedSheet?.solutionResourceId);

  // Shared between the desktop header dropdown and the floating mobile one.
  const actionMenuItems = (
    <>
      {selectedTask?.sourceResourceId || selectedSheet?.resourceId ? (
        <DropdownMenuItem onSelect={() => setPreviewResourceId(selectedTask?.sourceResourceId ?? selectedSheet?.resourceId ?? null)}>
          <FileText aria-hidden />
          Original-PDF öffnen
        </DropdownMenuItem>
      ) : null}
      {selectedSheet?.solutionResourceId ? (
        <DropdownMenuItem onSelect={() => setPreviewResourceId(selectedSheet.solutionResourceId!)}>
          <FileText aria-hidden />
          Lösungs-PDF öffnen
        </DropdownMenuItem>
      ) : null}
      {hasPdfActions ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem
        disabled={Boolean(runningStage)}
        onSelect={() => void runPipelineStage("curated")}
      >
        {runningStage === "curated" ? <Spinner aria-hidden /> : <RefreshCw aria-hidden />}
        {mode === "script" ? "Script aktualisieren" : "Aufgaben aktualisieren"}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => openFeedbackDialog()}>
        <AlertCircle aria-hidden />
        Problem melden
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => window.location.assign(coursePipelineHref)}>
        <Gauge aria-hidden />
        Pipeline-Status anzeigen
      </DropdownMenuItem>
    </>
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-visible">
      {/* The top bar breadcrumb already names the task on mobile, so the
          header only exists on md+; mobile gets floating corner controls. */}
      <div
        className={cn(
          "items-center justify-between gap-3 border-b border-border px-4 py-3.5 md:px-6",
          selectedTask ? "hidden md:flex" : "flex",
        )}
      >
        {selectedTask ? (
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {selectedTaskChapter ?? selectedSheet?.title ?? "Aufgabenblatt"}
              {selectedTaskIndex >= 0 ? ` · ${selectedTaskIndex + 1} von ${flatTasks.length}` : ""}
            </p>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight">
                {taskDisplayTitle(selectedSheet?.title, selectedTask.title)}
              </h2>
              {taskMode === "test" ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                  <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-primary-foreground" />
                  Test
                </span>
              ) : !isDoneTaskStatus(selectedTask.status) && selectedTask.status !== "open" ? (
                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {selectedTask.status.replace("_", " ")}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {pageIcon}
              <h2 className="truncate text-lg font-semibold tracking-tight">
                {pageTitle}
              </h2>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">{pageSubtitle}</p>
          </div>
        )}
        {view ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {selectedTask ? (
              <>
                {taskMode === "test" ? (
                  <>
                    <div className="mr-1 hidden shrink-0 items-center rounded-full bg-secondary p-0.5 lg:inline-flex">
                      <TaskTestLayoutButton
                        active={testLayout === "stacked"}
                        icon={Rows3}
                        label="Frage über dem Eingabefeld"
                        onClick={() => setTestLayout("stacked")}
                      />
                      <TaskTestLayoutButton
                        active={testLayout === "split"}
                        icon={Columns2}
                        label="Eingabefeld rechts"
                        onClick={() => setTestLayout("split")}
                      />
                    </div>
                    {testLayout === "split" ? (
                      <Button
                        aria-label={testComposerOpen ? "Antwortbereich einklappen" : "Antwortbereich ausklappen"}
                        className="hidden lg:inline-flex"
                        onClick={() => setTestComposerOpen((current) => !current)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        {testComposerOpen ? <PanelRightClose aria-hidden /> : <PanelRightOpen aria-hidden />}
                      </Button>
                    ) : null}
                  </>
                ) : null}
                <Button
                  className={cn(
                    "hidden md:inline-flex",
                    isDoneTaskStatus(selectedTask.status) &&
                      "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 hover:text-emerald-600",
                  )}
                  disabled={updatingTaskStatus}
                  onClick={() => void updateSelectedTaskStatus(isDoneTaskStatus(selectedTask.status) ? "open" : "done")}
                  type="button"
                  variant="secondary"
                >
                  {updatingTaskStatus ? (
                    <Spinner aria-hidden />
                  ) : isDoneTaskStatus(selectedTask.status) ? (
                    <CheckCircle2 aria-hidden />
                  ) : (
                    <Circle aria-hidden />
                  )}
                  {isDoneTaskStatus(selectedTask.status) ? "Erledigt" : "Erledigt markieren"}
                </Button>
                {taskMode === "test" ? (
                  <Button onClick={() => setTaskMode("view")} type="button" variant="secondary">
                    <X aria-hidden />
                    Test beenden
                  </Button>
                ) : (
                  <Button
                    className="hidden md:inline-flex"
                    onClick={() => {
                      setTaskMode("test");
                      setTestComposerOpen(true);
                    }}
                    type="button"
                  >
                    <Play aria-hidden />
                    Test starten
                  </Button>
                )}
              </>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Aktionen" size="icon" type="button" variant="ghost">
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56 rounded-2xl border-0 bg-popover p-1.5 shadow-lg">
                {actionMenuItems}
              </DropdownMenuContent>
            </DropdownMenu>
            {!selectedTask ? (
              <Button asChild className="w-fit" variant="secondary">
                <a href={coursePipelineHref}>
                  <Gauge aria-hidden />
                  Pipeline-Status anzeigen
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Mobile corner controls: actions menu top-left; mode controls top-right
          (play and stop share the same spot). */}
      {view && selectedTask ? (
        <>
          <div className="fixed left-3 top-14 z-30 md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Aktionen"
                  className="grid size-10 place-items-center rounded-full bg-background/90 text-foreground shadow-md ring-1 ring-border backdrop-blur transition-transform active:scale-95"
                  type="button"
                >
                  <MoreHorizontal aria-hidden className="size-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56 rounded-2xl border-0 bg-popover p-1.5 shadow-lg">
                {actionMenuItems}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="fixed right-3 top-14 z-30 flex items-center gap-2 md:hidden">
            {taskMode === "test" ? (
              <button
                aria-label="Test beenden"
                className="grid size-10 place-items-center rounded-full bg-red-500/15 text-red-600 shadow-md ring-1 ring-red-500/30 backdrop-blur transition-transform active:scale-95"
                onClick={() => setTaskMode("view")}
                type="button"
              >
                <Square aria-hidden className="size-4 fill-current" />
              </button>
            ) : (
              <>
                <button
                  aria-label={isDoneTaskStatus(selectedTask.status) ? "Als offen markieren" : "Als erledigt markieren"}
                  className={cn(
                    "grid size-10 place-items-center rounded-full shadow-md ring-1 backdrop-blur transition-transform active:scale-95",
                    isDoneTaskStatus(selectedTask.status)
                      ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30"
                      : "bg-background/90 text-foreground ring-border",
                  )}
                  disabled={updatingTaskStatus}
                  onClick={() =>
                    void updateSelectedTaskStatus(isDoneTaskStatus(selectedTask.status) ? "open" : "done")
                  }
                  type="button"
                >
                  {updatingTaskStatus ? (
                    <Spinner aria-hidden className="size-4" />
                  ) : isDoneTaskStatus(selectedTask.status) ? (
                    <CheckCircle2 aria-hidden className="size-4" />
                  ) : (
                    <Circle aria-hidden className="size-4" />
                  )}
                </button>
                <button
                  aria-label="Test starten"
                  className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-md backdrop-blur transition-transform active:scale-95"
                  onClick={() => {
                    setTaskMode("test");
                    setTestComposerOpen(true);
                  }}
                  type="button"
                >
                  <Play aria-hidden className="size-4" />
                </button>
              </>
            )}
          </div>
        </>
      ) : null}

      {error && !fatalLoadError ? <div className="mx-4 mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive md:mx-5">{error}</div> : null}
      {message ? <div className="mx-4 mt-4 rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground md:mx-5">{message}</div> : null}
      {fatalLoadError ? (
        <StudyPipelineErrorState
          error={error ?? "Moodle study pipeline failed."}
          mode={mode}
          onRetry={() => void loadPipelineStatus(courseId, mode === "script")}
        />
      ) : !view && !loading ? (
        <StudyPipelinePreview
          course={course}
          extractedDocuments={extractedDocuments}
          extractedError={extractedError}
          extractedLoading={extractedLoading}
          inventory={courseInventory}
          inventoryError={inventoryError}
          inventoryLoading={inventoryLoading}
          loading={statusLoading}
          mode={mode}
          onLoadExtractedDocuments={() => void loadExtractedDocuments()}
          onRefreshInventory={() => void refreshInventory()}
          onRunStage={(stage) => void runPipelineStage(stage)}
          runningStage={runningStage}
          status={pipelineStatus}
        />
      ) : loading && !view ? (
        <StudyLoadingSkeleton mode={mode} />
      ) : mode === "script" ? (
        <ScriptReader
          courseTitleText={courseTitle(course)}
          onCitationClick={onOpenResource}
          onRequestImprovement={(chapter) => openFeedbackDialog({
            message: `Bitte diese Script-Section prüfen und verbessern: ${chapter.title}`,
            targetId: chapter.state?.id ?? chapter.id,
            targetKind: "script_section",
            title: chapter.title,
            type: "other",
          })}
          onSelectSection={onSelectedScriptSectionIdChange}
          selectedSectionId={selectedScriptSectionId}
          view={view}
        />
      ) : (
        <div
          className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden"
        >
          <main
            className={cn(
              "min-h-0 bg-background",
              selectedTask && taskMode === "test"
                ? "flex flex-col overflow-hidden md:h-full"
                : "overflow-auto px-4 py-5 md:px-10 md:py-8",
            )}
          >
            {selectedTask && taskMode === "test" ? (
              <TaskTestMode
                checking={checking}
                composerOpen={testComposerOpen}
                courseId={courseId}
                feedbackMarkdown={selectedTask.latestAttempt?.verdict.feedbackMarkdown ?? null}
                initialAnswer={selectedTask.latestAttempt?.userAnswer ?? ""}
                key={selectedTask.taskId}
                layout={testLayout}
                onActivityChange={handleTestActivityChange}
                onCitationClick={(resourceId) => setPreviewResourceId(resourceId)}
                onComposerOpenChange={setTestComposerOpen}
                onGrade={(gradeInput) => void checkAnswer(gradeInput)}
                onOpenSolutionResource={
                  selectedSheet?.solutionResourceId
                    ? () => setPreviewResourceId(selectedSheet.solutionResourceId ?? null)
                    : null
                }
                solutionMarkdown={selectedSheet?.solutionMarkdown ?? null}
                solutionResourceId={selectedSheet?.solutionResourceId ?? null}
                task={selectedTask}
              />
            ) : selectedTask ? (
              <article className="mx-auto max-w-[86ch] pb-28 md:pb-0">
                <div className="py-2">
                  <MarkdownBlock
                    onCitationClick={(resourceId) => setPreviewResourceId(resourceId)}
                    text={taskPromptText(selectedTask)}
                  />
                </div>
                {/* Mobile HUD: task navigation bottom-left (chat FAB owns bottom-right). */}
                <div className="fixed bottom-[max(env(safe-area-inset-bottom),1rem)] left-4 z-20 flex items-center gap-1 rounded-full bg-background/90 p-1 shadow-lg ring-1 ring-border backdrop-blur md:hidden [[data-mobile-chat=open]_&]:hidden">
                  <button
                    aria-label="Vorherige Aufgabe"
                    className="grid size-10 place-items-center rounded-full text-foreground transition-colors disabled:opacity-35"
                    disabled={!previousTask}
                    onClick={() => previousTask && onSelectedTaskIdChange(previousTask.taskId)}
                    type="button"
                  >
                    <ArrowLeft aria-hidden className="size-4" />
                  </button>
                  {selectedTaskIndex >= 0 ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {selectedTaskIndex + 1}/{flatTasks.length}
                    </span>
                  ) : null}
                  <button
                    aria-label="Nächste Aufgabe"
                    className="grid size-10 place-items-center rounded-full text-foreground transition-colors disabled:opacity-35"
                    disabled={!nextTask}
                    onClick={() => nextTask && onSelectedTaskIdChange(nextTask.taskId)}
                    type="button"
                  >
                    <ArrowRight aria-hidden className="size-4" />
                  </button>
                </div>
                <footer className="mt-10 hidden items-center justify-between gap-2 border-t border-border bg-background/95 pb-3 pt-4 backdrop-blur md:sticky md:bottom-0 md:z-10 md:flex">
                  <Button
                    aria-label="Vorherige Aufgabe"
                    disabled={!previousTask}
                    onClick={() => previousTask && onSelectedTaskIdChange(previousTask.taskId)}
                    type="button"
                    variant="ghost"
                  >
                    <ArrowLeft aria-hidden />
                    Vorherige
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      className={cn(
                        isDoneTaskStatus(selectedTask.status) &&
                          "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 hover:text-emerald-600",
                      )}
                      disabled={updatingTaskStatus}
                      onClick={() =>
                        void updateSelectedTaskStatus(isDoneTaskStatus(selectedTask.status) ? "open" : "done")
                      }
                      type="button"
                      variant="secondary"
                    >
                      {updatingTaskStatus ? (
                        <Spinner aria-hidden />
                      ) : isDoneTaskStatus(selectedTask.status) ? (
                        <CheckCircle2 aria-hidden />
                      ) : (
                        <Circle aria-hidden />
                      )}
                      Erledigt
                    </Button>
                    {nextTask ? (
                      <Button onClick={() => onSelectedTaskIdChange(nextTask.taskId)} type="button">
                        Weiter
                        <ArrowRight aria-hidden />
                      </Button>
                    ) : isDoneTaskStatus(selectedTask.status) ? (
                      <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-emerald-500/15 px-4 text-sm font-medium text-emerald-600">
                        <CheckCircle2 aria-hidden className="size-4" />
                        Alle erledigt
                      </span>
                    ) : null}
                  </div>
                </footer>
              </article>
            ) : (
              <div className="grid min-h-80 place-items-center py-10 text-center">
                <div className="flex max-w-sm flex-col items-center">
                  <span className="grid size-14 place-items-center rounded-full bg-secondary text-muted-foreground">
                    <FileText aria-hidden className="size-6" />
                  </span>
                  <p className="mt-4 font-medium">Keine Aufgaben gefunden</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    In den extrahierten Materialien wurden keine Aufgaben erkannt. Fordere die Aufgaben erneut mit den
                    Standard-Einstellungen an.
                  </p>
                  <Button
                    className="mt-4"
                    disabled={loading || Boolean(runningStage)}
                    onClick={() => void runPipelineStage("curated")}
                    type="button"
                    variant="secondary"
                  >
                    {runningStage === "curated" ? <Spinner aria-hidden /> : <Sparkles aria-hidden />}
                    {runningStage === "curated" ? "Wird erstellt" : "Aufgaben anfordern"}
                  </Button>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
      <Dialog
        open={feedbackDialogOpen}
        onOpenChange={(open) => {
          setFeedbackDialogOpen(open);
          if (!open) {
            setFeedbackTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-[min(92vw,520px)] rounded-[1.75rem] border-0 p-5 shadow-xl">
          <DialogTitle>{feedbackTarget ? "Verbesserung anfragen" : "Problem melden"}</DialogTitle>
          <div className="space-y-4">
            {feedbackTarget?.title ? (
              <p className="rounded-2xl bg-secondary px-3 py-2 text-sm text-muted-foreground">
                {feedbackTarget.title}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {PIPELINE_FEEDBACK_OPTIONS.map((option) => (
                <button
                  className={cn(
                    "min-h-9 rounded-full px-3 text-sm font-medium transition-colors",
                    feedbackType === option.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                  key={option.id}
                  onClick={() => setFeedbackType(option.id)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <textarea
              className="min-h-28 w-full resize-none rounded-[1.5rem] border-0 bg-secondary px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              onChange={(event) => setFeedbackMessage(event.target.value)}
              placeholder="Kurz beschreiben, was fehlt oder falsch ist."
              value={feedbackMessage}
            />
            <div className="flex justify-end gap-2">
              <Button
                disabled={submittingFeedback}
                onClick={() => {
                  setFeedbackDialogOpen(false);
                  setFeedbackTarget(null);
                }}
                type="button"
                variant="secondary"
              >
                Abbrechen
              </Button>
              <Button disabled={submittingFeedback} onClick={() => void submitPipelineFeedback()} type="button">
                {submittingFeedback ? <Spinner aria-hidden /> : <AlertCircle aria-hidden />}
                Senden
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(previewResourceId)}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewResourceId(null);
            setPreviewExpanded(false);
          }
        }}
      >
        <DialogContent
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-0 ring-0 [&_[data-slot=dialog-close]]:right-4 [&_[data-slot=dialog-close]]:top-4",
            previewExpanded
              ? "!left-3 !top-3 !h-[calc(100dvh-1.5rem)] !w-[calc(100vw-1.5rem)] !max-w-none !translate-x-0 !translate-y-0 rounded-[1.25rem] sm:!max-w-none"
              : "h-[min(84dvh,860px)] max-w-[min(1120px,94vw)] rounded-[1.75rem] sm:max-w-[min(1120px,94vw)]",
          )}
        >
          <DialogTitle className="sr-only">{previewTitle}</DialogTitle>
          <div className="min-h-0 flex-1 overflow-hidden bg-muted">
            {courseId && previewResourceId && previewPDFUrl ? (
              <PDFDocumentViewer
                courseId={courseId}
                expanded={previewExpanded}
                externalUrl={previewMaterial?.url}
                materialId={previewResourceId}
                onExpandedChange={setPreviewExpanded}
                onStateChange={() => {}}
                scrollCommand={null}
                title={previewTitle}
                url={previewPDFUrl}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

type TaskTestStep = {
  id: string;
  label: string | null;
  prompt: string;
};

type TaskTestLayout = "stacked" | "split";

const TASK_TEST_LAYOUT_STORAGE_KEY = "moodle.taskTest.layout";

// Focused exam mode (learn-arena style): one subtask at a time, answers in a
// composer that sits below (stacked) or right of (split) the question. Layout
// and collapse controls live in the panel's main toolbar.
function TaskTestMode({
  checking,
  composerOpen,
  courseId,
  feedbackMarkdown,
  initialAnswer,
  layout,
  onActivityChange,
  onCitationClick,
  onComposerOpenChange,
  onGrade,
  onOpenSolutionResource,
  solutionMarkdown,
  solutionResourceId,
  task,
}: {
  checking: boolean;
  composerOpen: boolean;
  courseId: string | null;
  feedbackMarkdown: string | null;
  initialAnswer: string;
  layout: TaskTestLayout;
  onActivityChange?: (activity: { answerDraft: string; stepLabel: string | null; stepPrompt: string | null } | null) => void;
  onCitationClick: (resourceId: string) => void;
  onComposerOpenChange: (open: boolean) => void;
  onGrade: (input: { answer: string; stepLabel?: string | null; stepPrompt?: string }) => void;
  onOpenSolutionResource: (() => void) | null;
  solutionMarkdown: string | null;
  solutionResourceId: string | null;
  task: TaskViewTask;
}) {
  const steps = useMemo<TaskTestStep[]>(() => {
    const parts = asArray(task.parts);
    if (parts.length === 0) {
      return [{ id: "task", label: null, prompt: task.promptMarkdown }];
    }
    return parts.map((part, index) => ({
      id: part.id || String(index),
      label: part.label ?? `Teilaufgabe ${String.fromCharCode(97 + index)})`,
      prompt: part.promptMarkdown,
    }));
  }, [task]);
  const contextMarkdown = asArray(task.parts).length > 0 ? task.promptMarkdown : null;

  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    initialAnswer && steps[0] ? { [steps[0].id]: initialAnswer } : {},
  );
  const [solutionOpen, setSolutionOpen] = useState(false);
  const solutionPDFAvailable = Boolean(courseId && solutionResourceId);
  const [solutionTab, setSolutionTab] = useState<"pdf" | "text">(solutionPDFAvailable ? "pdf" : "text");
  const hasSolution = Boolean(solutionMarkdown) || solutionPDFAvailable;
  // On mobile the composer lives in a bottom sheet instead of the page flow.
  const [mobileComposerOpen, setMobileComposerOpen] = useState(false);
  // Close the sheet once grading finishes so the feedback below is visible.
  const wasCheckingRef = useRef(false);
  useEffect(() => {
    if (wasCheckingRef.current && !checking) {
      setMobileComposerOpen(false);
    }
    wasCheckingRef.current = checking;
  }, [checking]);

  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const answer = answers[step.id] ?? "";
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const split = layout === "split";
  const canGrade = !checking && answer.trim().length > 0;

  // Report what the student currently sees (and writes) to the tutor chat.
  const onActivityChangeRef = useRef(onActivityChange);
  onActivityChangeRef.current = onActivityChange;
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      onActivityChangeRef.current?.({
        answerDraft: answer,
        stepLabel: step.label,
        stepPrompt: steps.length > 1 ? step.prompt : null,
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [answer, step.id, step.label, step.prompt, steps.length]);
  useEffect(() => {
    return () => onActivityChangeRef.current?.(null);
  }, []);

  function goToStep(index: number) {
    setStepIndex(index);
  }

  function grade() {
    if (!canGrade) {
      return;
    }
    onGrade({
      answer,
      stepLabel: step.label,
      stepPrompt: steps.length > 1 ? step.prompt : undefined,
    });
  }

  return (
    <div className="relative flex min-h-[70dvh] w-full min-w-0 flex-1 flex-col md:min-h-0">
      {steps.length > 1 ? (
        <div className="flex shrink-0 items-center gap-3 px-4 pt-3 md:px-6">
          <div className="flex min-w-0 flex-1 gap-1">
            {steps.map((item, index) => (
              <button
                aria-label={item.label ?? `Schritt ${index + 1}`}
                className={cn(
                  "h-1.5 min-w-0 flex-1 rounded-full transition-colors",
                  index === stepIndex
                    ? "bg-primary"
                    : (answers[item.id] ?? "").trim()
                      ? "bg-primary/40 hover:bg-primary/60"
                      : "bg-secondary hover:bg-secondary/80",
                )}
                key={item.id}
                onClick={() => goToStep(index)}
                type="button"
              />
            ))}
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {stepIndex + 1}/{steps.length}
          </span>
        </div>
      ) : null}

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          split && composerOpen && "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(24rem,40%)] lg:overflow-hidden",
        )}
      >
        <div className={cn("px-4 pb-28 pt-6 md:px-8 md:py-6", split && composerOpen && "lg:min-h-0 lg:overflow-y-auto")}>
          <div className="mx-auto w-full max-w-2xl">
            {solutionOpen && hasSolution ? (
              <TaskSolutionPanel
                className="mb-7 hidden md:block"
                courseId={courseId}
                onCitationClick={onCitationClick}
                onClose={() => setSolutionOpen(false)}
                onTabChange={setSolutionTab}
                solutionMarkdown={solutionMarkdown}
                solutionResourceId={solutionResourceId}
                solutionTab={solutionTab}
              />
            ) : null}

            {contextMarkdown ? (
              <div className="mb-6 rounded-2xl bg-secondary/50 px-4 py-3 text-sm">
                <MarkdownBlock onCitationClick={onCitationClick} text={contextMarkdown} />
              </div>
            ) : null}
            {step.label ? (
              <span className="mb-3 inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {step.label}
              </span>
            ) : null}
            <MarkdownBlock onCitationClick={onCitationClick} text={step.prompt} />

            {feedbackMarkdown ? (
              <section className="mt-7 rounded-3xl bg-secondary px-5 py-4">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <MessageCircle aria-hidden className="size-4" />
                  Codex-Bewertung
                </h4>
                <MarkdownBlock onCitationClick={onCitationClick} text={feedbackMarkdown} />
              </section>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "hidden px-4 pb-4 md:block md:px-6",
            split && composerOpen && "lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:py-4 lg:pl-0 lg:pr-4",
            split && !composerOpen && "lg:hidden",
          )}
        >
          <div
            className={cn(
              "mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-card shadow-lg ring-1 ring-border transition-shadow focus-within:shadow-xl",
              split && "lg:mx-0 lg:min-h-0 lg:max-w-none lg:flex-1",
            )}
          >
            <textarea
              className={cn(
                "min-h-44 w-full resize-none bg-transparent px-4 py-3.5 text-sm leading-6 outline-none placeholder:text-muted-foreground",
                split && "lg:min-h-0 lg:flex-1",
              )}
              onChange={(event) =>
                setAnswers((current) => ({ ...current, [step.id]: event.target.value }))
              }
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  grade();
                }
              }}
              placeholder={step.label ? `Deine Antwort zu ${step.label}…` : "Deine Antwort…"}
              value={answer}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
              <div className="flex min-w-0 items-center gap-2">
                {hasSolution ? (
                  <button
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      solutionOpen
                        ? "bg-amber-500/15 text-amber-600"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                    onClick={() => setSolutionOpen((current) => !current)}
                    type="button"
                  >
                    <Lightbulb aria-hidden className="size-3.5" />
                    {solutionOpen ? "Lösung verbergen" : "Lösung anzeigen"}
                  </button>
                ) : null}
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{wordCount} Wörter</span>
              </div>
              <Button disabled={!canGrade} onClick={grade} type="button">
                {checking ? <Spinner aria-hidden /> : <Sparkles aria-hidden />}
                Bewerten
              </Button>
            </div>
          </div>

          {steps.length > 1 ? (
            <div
              className={cn(
                "mx-auto mt-3 flex w-full max-w-2xl shrink-0 items-center justify-between",
                split
                  ? "lg:mx-0 lg:max-w-none"
                  : "sticky bottom-3 z-20 rounded-full bg-background/90 px-1.5 py-1 shadow-lg ring-1 ring-border/60 backdrop-blur-md",
              )}
            >
              <Button
                disabled={stepIndex === 0}
                onClick={() => goToStep(stepIndex - 1)}
                type="button"
                variant="ghost"
              >
                <ArrowLeft aria-hidden />
                Zurück
              </Button>
              <Button
                disabled={stepIndex >= steps.length - 1}
                onClick={() => goToStep(stepIndex + 1)}
                type="button"
                variant="secondary"
              >
                Weiter
                <ArrowRight aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {split && !composerOpen ? (
        <button
          className="absolute bottom-5 right-5 hidden items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition-opacity hover:opacity-90 lg:inline-flex"
          onClick={() => onComposerOpenChange(true)}
          type="button"
        >
          <PanelRightOpen aria-hidden className="size-4" />
          Antwort schreiben
        </button>
      ) : null}

      {/* Mobile test HUD: answer bottom-left, steps centered, solution next to
          the global chat FAB bottom-right. */}
      <div className="fixed bottom-[max(env(safe-area-inset-bottom),1rem)] left-4 z-20 md:hidden [[data-mobile-chat=open]_&]:hidden">
        <button
          aria-label="Antwort schreiben"
          className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform active:scale-95"
          onClick={() => setMobileComposerOpen(true)}
          type="button"
        >
          <Pencil aria-hidden className="size-5" />
        </button>
      </div>
      {steps.length > 1 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),1rem)] z-10 flex justify-center md:hidden [[data-mobile-chat=open]_&]:hidden">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-background/90 p-1 shadow-lg ring-1 ring-border backdrop-blur">
            <button
              aria-label="Vorheriger Schritt"
              className="grid size-10 place-items-center rounded-full text-foreground transition-colors disabled:opacity-35"
              disabled={stepIndex === 0}
              onClick={() => goToStep(stepIndex - 1)}
              type="button"
            >
              <ArrowLeft aria-hidden className="size-4" />
            </button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {stepIndex + 1}/{steps.length}
            </span>
            <button
              aria-label="Nächster Schritt"
              className="grid size-10 place-items-center rounded-full text-foreground transition-colors disabled:opacity-35"
              disabled={stepIndex >= steps.length - 1}
              onClick={() => goToStep(stepIndex + 1)}
              type="button"
            >
              <ArrowRight aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
      {hasSolution ? (
        <button
          aria-label={solutionOpen ? "Lösung verbergen" : "Lösung anzeigen"}
          className={cn(
            "fixed bottom-[max(env(safe-area-inset-bottom),1rem)] right-[4.75rem] z-20 grid size-12 place-items-center rounded-full shadow-lg ring-1 backdrop-blur transition-transform active:scale-95 md:hidden [[data-mobile-chat=open]_&]:hidden",
            solutionOpen
              ? "bg-amber-500/15 text-amber-600 ring-amber-500/30"
              : "bg-background/90 text-foreground ring-border",
          )}
          onClick={() => setSolutionOpen((current) => !current)}
          type="button"
        >
          <Lightbulb aria-hidden className="size-5" />
        </button>
      ) : null}

      {solutionOpen && hasSolution ? (
        <MobileSheet label="Lösung" onClose={() => setSolutionOpen(false)}>
          {(expanded, setExpanded) => (
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-center gap-2 px-4 pb-2">
                <Lightbulb aria-hidden className="size-4 shrink-0 text-amber-500" />
                <span className="text-sm font-semibold">Lösung</span>
                {solutionPDFAvailable && solutionMarkdown ? (
                  <div className="ml-1 inline-flex shrink-0 items-center rounded-full bg-secondary p-0.5">
                    <button
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                        solutionTab === "pdf" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                      )}
                      onClick={() => setSolutionTab("pdf")}
                      type="button"
                    >
                      PDF
                    </button>
                    <button
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                        solutionTab === "text" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                      )}
                      onClick={() => setSolutionTab("text")}
                      type="button"
                    >
                      Text
                    </button>
                  </div>
                ) : null}
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <button
                    aria-label={expanded ? "Verkleinern" : "Maximieren"}
                    className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    onClick={() => setExpanded(!expanded)}
                    type="button"
                  >
                    {expanded ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
                  </button>
                  <button
                    aria-label="Lösung schließen"
                    className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    onClick={() => setSolutionOpen(false)}
                    type="button"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </div>
              </div>
              {solutionTab === "pdf" && courseId && solutionResourceId ? (
                <div className={cn("bg-muted", expanded ? "min-h-0 flex-1" : "h-[50dvh]")}>
                  <PDFDocumentViewer
                    embedded
                    courseId={courseId}
                    materialId={solutionResourceId}
                    onStateChange={() => {}}
                    scrollCommand={null}
                    title="Lösung"
                    url={`/api/moodle/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(solutionResourceId)}/pdf`}
                  />
                </div>
              ) : solutionMarkdown ? (
                <div
                  className={cn(
                    "overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),1rem)]",
                    expanded ? "min-h-0 flex-1" : "max-h-[50dvh]",
                  )}
                >
                  <MarkdownBlock onCitationClick={onCitationClick} text={solutionMarkdown} />
                </div>
              ) : null}
            </div>
          )}
        </MobileSheet>
      ) : null}

      {mobileComposerOpen ? (
        <MobileSheet label="Antwortbereich" onClose={() => setMobileComposerOpen(false)}>
          {(expanded, setExpanded) => (
            <div className={cn("flex flex-col px-4 pb-[max(env(safe-area-inset-bottom),1rem)]", expanded && "h-full")}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{step.label ?? "Deine Antwort"}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    aria-label={expanded ? "Verkleinern" : "Maximieren"}
                    className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    onClick={() => setExpanded(!expanded)}
                    type="button"
                  >
                    {expanded ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
                  </button>
                  <button
                    aria-label="Schließen"
                    className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    onClick={() => setMobileComposerOpen(false)}
                    type="button"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </div>
              </div>
              <textarea
                autoFocus
                className={cn(
                  "min-h-36 w-full resize-none rounded-2xl bg-secondary/50 px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground",
                  expanded && "min-h-0 flex-1",
                )}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [step.id]: event.target.value }))
                }
                placeholder={step.label ? `Deine Antwort zu ${step.label}…` : "Deine Antwort…"}
                value={answer}
              />
              <div className="mt-2 flex shrink-0 items-center justify-between gap-2">
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{wordCount} Wörter</span>
                <Button disabled={!canGrade} onClick={grade} type="button">
                  {checking ? <Spinner aria-hidden /> : <Sparkles aria-hidden />}
                  Bewerten
                </Button>
              </div>
            </div>
          )}
        </MobileSheet>
      ) : null}
    </div>
  );
}

function TaskSolutionPanel({
  className,
  courseId,
  onCitationClick,
  onClose,
  onTabChange,
  solutionMarkdown,
  solutionResourceId,
  solutionTab,
}: {
  className?: string;
  courseId: string | null;
  onCitationClick: (resourceId: string) => void;
  onClose: () => void;
  onTabChange: (tab: "pdf" | "text") => void;
  solutionMarkdown: string | null;
  solutionResourceId: string | null;
  solutionTab: "pdf" | "text";
}) {
  const solutionPDFAvailable = Boolean(courseId && solutionResourceId);
  return (
    <section className={cn("overflow-hidden rounded-3xl border border-amber-500/30 bg-amber-500/10", className)}>
      <div className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
        <Lightbulb aria-hidden className="size-4 shrink-0 text-amber-500" />
        Lösung
        {solutionPDFAvailable && solutionMarkdown ? (
          <div className="ml-1 inline-flex shrink-0 items-center rounded-full bg-background/70 p-0.5">
            <button
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                solutionTab === "pdf" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onTabChange("pdf")}
              type="button"
            >
              PDF
            </button>
            <button
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                solutionTab === "text" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onTabChange("text")}
              type="button"
            >
              Text
            </button>
          </div>
        ) : null}
        <button
          aria-label="Lösung schließen"
          className="ml-auto grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
      {solutionTab === "pdf" && courseId && solutionResourceId ? (
        <div className="h-[55dvh] min-h-72 bg-muted">
          <PDFDocumentViewer
            allowFloat
            courseId={courseId}
            materialId={solutionResourceId}
            onStateChange={() => {}}
            scrollCommand={null}
            title="Lösung"
            url={`/api/moodle/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(solutionResourceId)}/pdf`}
          />
        </div>
      ) : solutionMarkdown ? (
        <div className="max-h-[50dvh] overflow-y-auto px-5 pb-4">
          <MarkdownBlock onCitationClick={onCitationClick} text={solutionMarkdown} />
        </div>
      ) : null}
    </section>
  );
}

function TaskTestLayoutButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Rows3;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "grid size-7 place-items-center rounded-full transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon aria-hidden className="size-3.5" />
    </button>
  );
}

function StudyLoadingSkeleton({ mode }: { mode: Mode }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-[86ch] px-4 py-8 md:px-10">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-hidden className="size-4" />
          {mode === "script" ? "Script wird geladen…" : "Aufgaben werden geladen…"}
        </p>
        <Skeleton className="mt-7 h-7 w-2/3 rounded-full" />
        <div className="mt-5 space-y-2.5">
          <Skeleton className="h-4 w-full rounded-full" />
          <Skeleton className="h-4 w-11/12 rounded-full" />
          <Skeleton className="h-4 w-4/5 rounded-full" />
        </div>
        <Skeleton className="mt-7 h-36 w-full rounded-3xl" />
        <div className="mt-7 space-y-2.5">
          <Skeleton className="h-4 w-full rounded-full" />
          <Skeleton className="h-4 w-5/6 rounded-full" />
          <Skeleton className="h-4 w-2/3 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function StudyPipelineErrorState({
  error,
  mode,
  onRetry,
}: {
  error: string;
  mode: Mode;
  onRetry: () => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto px-6 py-10 text-center">
      <div className="flex max-w-md flex-col items-center">
        <span className="grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle aria-hidden className="size-6" />
        </span>
        <h3 className="mt-4 text-xl font-semibold tracking-tight">
          {mode === "script" ? "Script konnte nicht geladen werden" : "Aufgaben konnten nicht geladen werden"}
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {error}
        </p>
        <Button className="mt-5 w-fit" onClick={onRetry} type="button" variant="secondary">
          <RefreshCw aria-hidden />
          Erneut laden
        </Button>
      </div>
    </div>
  );
}

function taskPromptText(task: TaskViewTask): string {
  return [
    task.promptMarkdown,
    ...asArray(task.parts).map((part) => [`### ${part.label ?? "Teilaufgabe"}`, part.promptMarkdown].join("\n\n")),
  ].filter(Boolean).join("\n\n");
}

export function normalizeTaskViewForDisplay(view: TaskViewResponse): TaskViewResponse {
  return {
    ...view,
    scriptSections: asArray(view.scriptSections),
    resources: asArray(view.resources),
    sheets: asArray(view.sheets)
      .map((sheet) => ({
        ...sheet,
        solutionMarkdown: sheet.solutionMarkdown ? cleanStudyBundleMarkdown(sheet.solutionMarkdown) : sheet.solutionMarkdown,
        tasks: asArray(sheet.tasks)
          .flatMap(splitTaskByHeadings)
          .sort(compareTaskViewTasks),
      }))
      .sort(compareTaskViewSheets),
  };
}

function buildTaskOutline(
  view: TaskViewResponse,
  pipelineStatus: StudyPipelineStatusResponse | null,
): StudyOutline["tasks"] {
  const materialsById = new Map(asArray(pipelineStatus?.materials).map((material) => [material.id, material]));
  return view.sheets.flatMap((sheet) =>
    sheet.tasks.map((task) => {
      const material = materialsById.get(task.sourceResourceId) ?? materialsById.get(sheet.resourceId);
      return {
        id: task.taskId,
        sectionTitle: material?.sectionName,
        sheetTitle: sheet.title,
        status: task.status,
        title: task.title,
      };
    }),
  );
}

function updateTaskStatusInView(
  view: TaskViewResponse,
  taskId: string,
  status: TaskViewTask["status"],
): TaskViewResponse {
  const sheets = view.sheets.map((sheet) => ({
    ...sheet,
    tasks: sheet.tasks.map((task) => task.taskId === taskId ? { ...task, status } : task),
  }));
  return {
    ...view,
    sheets,
    progress: summarizeTaskProgress(sheets),
  };
}

function summarizeTaskProgress(sheets: TaskViewResponse["sheets"]): TaskViewResponse["progress"] {
  const progress: TaskViewResponse["progress"] = {
    checked: 0,
    correct: 0,
    done: 0,
    needsReview: 0,
    open: 0,
    wrong: 0,
  };
  for (const task of sheets.flatMap((sheet) => sheet.tasks)) {
    switch (task.status) {
      case "done":
        progress.done++;
        progress.checked++;
        break;
      case "checked":
        progress.checked++;
        break;
      case "correct":
        progress.correct++;
        progress.checked++;
        break;
      case "wrong":
        progress.wrong++;
        progress.checked++;
        break;
      case "needs_review":
        progress.needsReview++;
        progress.checked++;
        break;
      default:
        progress.open++;
    }
  }
  return progress;
}

function isDoneTaskStatus(status: string): boolean {
  return status === "done" || status === "correct";
}

function compareTaskViewSheets(left: TaskViewResponse["sheets"][number], right: TaskViewResponse["sheets"][number]): number {
  return compareNaturalStudyTitles(left.title, right.title);
}

function compareTaskViewTasks(left: TaskViewTask, right: TaskViewTask): number {
  return compareNaturalStudyTitles(left.title, right.title);
}

function compareNaturalStudyTitles(left: string, right: string): number {
  const leftNumber = firstNumber(left);
  const rightNumber = firstNumber(right);
  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right, "de", { numeric: true, sensitivity: "base" });
}

function firstNumber(value: string): number | null {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function splitTaskByHeadings(task: TaskViewTask): TaskViewTask[] {
  const promptMarkdown = cleanStudyBundleMarkdown(task.promptMarkdown);
  const matches = Array.from(promptMarkdown.matchAll(/^##\s+(Aufgabe\s+\d+[^\n]*)\s*$/gim));
  if (matches.length === 0) {
    return [{
      ...task,
      parts: asArray(task.parts).map((part) => ({ ...part, promptMarkdown: cleanStudyBundleMarkdown(part.promptMarkdown) })),
      promptMarkdown,
    }];
  }

  return matches.map((match, index) => {
    const title = stripMarkdown(match[1]).replace(/\s+/g, " ").trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? promptMarkdown.length;
    return {
      ...task,
      contentState: task.contentState,
      parts: [],
      promptMarkdown: promptMarkdown.slice(start, end).trim(),
      taskId: `${task.taskId}-${slugifyTaskId(title) || `aufgabe-${index + 1}`}`,
      title,
    };
  });
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function cleanStudyBundleMarkdown(markdown: string): string {
  return markdown
    .replace(/^#\s+[^\n]+\n+/m, "")
    .replace(/^Source task:\s+.+$/gim, "")
    .replace(/^Solution status:\s+.+$/gim, "")
    .replace(/^Solution page:\s+.+$/gim, "")
    .replace(/^This is the versioned working copy of the Moodle solution\..*$/gim, "")
    .replace(/^##\s+Task Text\s*$/gim, "")
    .replace(/\n##\s+Original Sources[\s\S]*$/im, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugifyTaskId(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ScriptReader({
  courseTitleText,
  onCitationClick,
  onRequestImprovement,
  onSelectSection,
  selectedSectionId,
  view,
}: {
  courseTitleText: string;
  onCitationClick: (resourceId: string) => void;
  onRequestImprovement: (chapter: ScriptChapter) => void;
  onSelectSection: (sectionId: string | null) => void;
  selectedSectionId: string | null;
  view: TaskViewResponse | null;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chapters = useMemo(
    () => splitScriptChapters(view?.scriptMarkdown ?? "No script generated yet.", view?.scriptSections),
    [view?.scriptMarkdown, view?.scriptSections],
  );
  const [scrollProgress, setScrollProgress] = useState(0);
  // Scroll-spy: the chapter currently at the top of the viewport drives the
  // highlight in the table of contents.
  const [visibleChapterId, setVisibleChapterId] = useState<string | null>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !selectedSectionId) {
      return;
    }
    const chapter = chapters.find((item) => item.id === selectedSectionId || item.state?.id === selectedSectionId);
    if (!chapter) {
      return;
    }
    window.setTimeout(() => {
      container.querySelector<HTMLElement>(`[data-script-chapter-id="${CSS.escape(chapter.id)}"]`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 50);
  }, [chapters, selectedSectionId]);

  function updateScrollProgress() {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    const maxScroll = container.scrollHeight - container.clientHeight;
    setScrollProgress(maxScroll > 0 ? Math.min(100, Math.max(0, (container.scrollTop / maxScroll) * 100)) : 100);

    const containerTop = container.getBoundingClientRect().top;
    let current: string | null = null;
    for (const element of container.querySelectorAll<HTMLElement>("[data-script-chapter-id]")) {
      if (element.getBoundingClientRect().top - containerTop > 140) {
        break;
      }
      current = element.dataset.scriptChapterId ?? null;
    }
    setVisibleChapterId(current);
  }

  const activeChapterId =
    visibleChapterId ??
    chapters.find((item) => item.id === selectedSectionId || item.state?.id === selectedSectionId)?.id ??
    null;

  return (
    <div className="grid min-h-0 flex-1 bg-background xl:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col border-r border-border bg-background px-3 py-5 xl:flex">
        <p className="px-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Inhalt</p>
        <nav className="mt-3 min-h-0 flex-1 space-y-0.5 overflow-auto pr-1">
          {chapters.map((chapter, index) => {
            const active = activeChapterId === chapter.id;
            return (
              <button
                className={cn(
                  "flex w-full items-baseline gap-2 rounded-xl px-2 py-1.5 text-left text-[13px] leading-snug transition-colors",
                  active
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
                key={chapter.id}
                onClick={() => {
                  onSelectSection(chapter.state?.id ?? chapter.id);
                  scrollRef.current?.querySelector<HTMLElement>(`[data-script-chapter-id="${CSS.escape(chapter.id)}"]`)
                    ?.scrollIntoView({ block: "start", behavior: "smooth" });
                }}
                type="button"
              >
                <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/60">
                  {index + 1}
                </span>
                <span className="line-clamp-2 min-w-0 flex-1">{chapter.title}</span>
                {chapter.state?.status === "codex-improved" ? (
                  <Sparkles aria-hidden className="size-3 shrink-0 self-center text-primary" />
                ) : null}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-0 flex-col">
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur md:px-8">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs font-medium text-muted-foreground">
              {Math.round(scrollProgress)}% gelesen
            </p>
            <ContentStateBadge state={scriptAggregateState(view?.scriptSections)} />
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${scrollProgress}%` }} />
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-auto px-4 py-6 md:px-10 md:py-8"
          onScroll={updateScrollProgress}
          ref={scrollRef}
        >
          <article className="mx-auto max-w-[1080px]">
            <header className="mb-8 border-b border-border pb-6">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Course Script</p>
              <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
                {courseTitleText}
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Moodle material, shown section by section. Improved sections are stored separately from the extracted source.
              </p>
            </header>

            <div className="space-y-8">
              {chapters.map((chapter) => (
                <section
                  className="scroll-mt-28 border-b border-border pb-8 [contain-intrinsic-size:1px_760px] [content-visibility:auto]"
                  data-script-chapter-id={chapter.id}
                  id={chapter.id}
                  key={chapter.id}
                >
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h4 className="text-2xl font-semibold tracking-tight text-foreground">{chapter.title}</h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <ContentStateBadge state={chapter.state} />
                      </div>
                    </div>
                    <Button
                      className="w-fit"
                      onClick={() => onRequestImprovement(chapter)}
                      type="button"
                      variant="secondary"
                    >
                      <AlertCircle aria-hidden />
                      Verbesserung anfragen
                    </Button>
                  </div>
                  <MarkdownBlock onCitationClick={onCitationClick} text={chapter.bodyMarkdown} />
                </section>
              ))}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

function ContentStateBadge({ state }: { state?: StudyContentState | null }) {
  const isImproved = state?.status === "codex-improved";
  return (
    <span
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
        isImproved
          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
          : "bg-secondary text-muted-foreground",
      )}
      title={state?.sourcePath ?? undefined}
    >
      {isImproved ? <Sparkles aria-hidden className="size-3.5" /> : <FileText aria-hidden className="size-3.5" />}
      <span>{state?.statusLabel ?? "Machine extracted"}</span>
      {isImproved && state?.model ? <span className="opacity-75">{state.model}</span> : null}
    </span>
  );
}

function scriptAggregateState(states: StudyContentState[] | undefined): StudyContentState {
  const items = asArray(states);
  const improved = items.filter((item) => item.status === "codex-improved").length;
  if (improved > 0) {
    return {
      id: "script",
      kind: "script-section",
      status: improved === items.length ? "codex-improved" : "codex-improved",
      statusLabel: improved === items.length ? "Codex improved" : `${improved}/${items.length} Codex improved`,
      title: "Script",
    };
  }
  return {
    id: "script",
    kind: "script-section",
    status: "machine-extracted",
    statusLabel: items.length > 0 ? "Machine extracted" : "Not generated",
    title: "Script",
  };
}

type ScriptChapter = {
  bodyMarkdown: string;
  id: string;
  state?: StudyContentState;
  title: string;
};

export function splitScriptChapters(markdown: string, states: StudyContentState[] | undefined = []): ScriptChapter[] {
  const blocks = splitMarkdownBlocks(markdown);
  const stateItems = asArray(states);
  const chapters: ScriptChapter[] = [];
  const preface: string[] = [];
  let current: { blocks: string[]; id: string; state?: StudyContentState; title: string } | null = null;
  let stateCursor = 0;

  for (const block of blocks) {
    const heading = block.match(/^(#{1,3})\s+(.+)$/);
    const headingTitle = heading ? stripMarkdown(heading[2]) : "";
    const matchedState = heading ? findScriptStateForHeading(stateItems, headingTitle, stateCursor) : null;
    if (matchedState) {
      if (current) {
        chapters.push(scriptChapterFromBlocks(current));
      } else if (preface.length > 0) {
        chapters.push(scriptChapterFromBlocks({
          blocks: preface.splice(0, preface.length),
          id: "section-introduction",
          title: "Introduction",
        }));
      }
      stateCursor = Math.max(stateCursor, stateItems.indexOf(matchedState) + 1);
      current = {
        blocks: [],
        id: headingAnchorId(headingTitle),
        state: matchedState,
        title: headingTitle,
      };
      continue;
    }
    if (heading && stateItems.length === 0 && heading[1].length <= 2 && !/^course script$/i.test(headingTitle)) {
      if (current) {
        chapters.push(scriptChapterFromBlocks(current));
      }
      current = {
        blocks: [],
        id: headingAnchorId(headingTitle),
        title: headingTitle,
      };
      continue;
    }
    if (current) {
      current.blocks.push(block);
    } else {
      preface.push(block);
    }
  }
  if (current) {
    chapters.push(scriptChapterFromBlocks(current));
  }
  if (chapters.length === 0) {
    return [scriptChapterFromBlocks({
      blocks: preface.length > 0 ? preface : blocks,
      id: "section-script",
      state: stateItems[0],
      title: stateItems[0]?.title ?? "Script",
    })];
  }
  return chapters;
}

function findScriptStateForHeading(states: StudyContentState[], headingTitle: string, cursor: number): StudyContentState | null {
  const normalizedTitle = normalizeContentTitle(headingTitle);
  for (let index = cursor; index < states.length; index += 1) {
    const state = states[index];
    if (normalizeContentTitle(state.title) === normalizedTitle || headingAnchorId(state.title) === headingAnchorId(headingTitle)) {
      return state;
    }
  }
  return null;
}

function scriptChapterFromBlocks(chapter: { blocks: string[]; id: string; state?: StudyContentState; title: string }): ScriptChapter {
  return {
    bodyMarkdown: chapter.blocks.join("\n\n").trim() || "No extracted text available for this section yet.",
    id: chapter.id,
    state: chapter.state,
    title: chapter.title,
  };
}

function normalizeContentTitle(value: string): string {
  return stripMarkdown(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function MarkdownBlock({ onCitationClick, text }: { onCitationClick?: (resourceId: string) => void; text: string }) {
  return (
    <div className="paper-markdown space-y-4 break-words text-[0.98rem] leading-7 text-foreground" onClick={(event) => handleMarkdownClick(event, onCitationClick)}>
      {renderMarkdownBlocks(splitMarkdownBlocks(text)).map((block, index) => (
        <div key={index} dangerouslySetInnerHTML={{ __html: block }} />
      ))}
    </div>
  );
}

function splitMarkdownBlocks(text: string): string[] {
  const normalized = stripMarkdownFrontmatter(text)
    .trim()
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, expression: string) => `$$\n${expression.trim()}\n$$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, expression: string) => `\\[\n${expression.trim()}\n\\]`)
    .replace(/([^\n])\n```/g, "$1\n\n```")
    .replace(/```\n([^\n])/g, "```\n\n$1");
  return normalized.split(/\n{2,}/).filter(Boolean);
}

function stripMarkdownFrontmatter(text: string): string {
  return text.replace(/^---\n[\s\S]*?\n---\n*/m, "");
}

function renderMarkdownBlocks(blocks: string[]): string[] {
  const rendered: string[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (isSourceBlock(block)) {
      rendered.push(renderSourceLinks(block));
      continue;
    }
    const nextBlock = blocks[index + 1];
    if (isHeadingBlock(block) && nextBlock && isSourceBlock(nextBlock)) {
      rendered.push(renderMarkdownBlock(block, nextBlock));
      index += 1;
      continue;
    }
    rendered.push(renderMarkdownBlock(block));
  }
  return rendered;
}

function renderMarkdownBlock(block: string, sourceBlock?: string): string {
  if (isHtmlCommentBlock(block)) {
    return "";
  }
  if (isTrustedFigureBlock(block)) {
    return renderTrustedFigure(block);
  }
  if (block.startsWith("```")) {
    const code = block.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trimEnd();
    return renderCodeBlock(code);
  }
  if (isDisplayMathBlock(block)) {
    return `<div class="my-4 overflow-x-auto">${renderMath(escapeHtml(block))}</div>`;
  }
  if (isMarkdownTableBlock(block)) {
    return renderMarkdownTable(block);
  }
  const leadingHeading = block.match(/^(#{1,3})\s+([^\n]+)\n+([\s\S]+)$/);
  if (leadingHeading) {
    return [
      renderMarkdownBlock(`${leadingHeading[1]} ${leadingHeading[2]}`, sourceBlock),
      renderMarkdownBlock(leadingHeading[3]),
    ].join("");
  }
  const heading = block.match(/^(#{1,3})\s+(.+)$/);
  if (heading) {
    const level = heading[1].length + 2;
    const sizeClass = level <= 3 ? "text-xl" : "text-lg";
    const id = headingAnchorId(heading[2]);
    return `<div id="${id}" class="mt-7 flex scroll-mt-24 flex-col gap-2 border-b border-border pb-1 sm:flex-row sm:items-baseline sm:justify-between"><h${level} class="${sizeClass} font-semibold tracking-tight text-foreground">${inlineMarkdown(heading[2])}</h${level}>${sourceBlock ? renderSourceLinks(sourceBlock) : ""}</div>`;
  }
  if (hasMixedSlideLines(block)) {
    return block.split("\n")
      .map(cleanSlideLine)
      .filter(Boolean)
      .map((line) => `<p>${inlineMarkdown(line)}</p>`)
      .join("");
  }
  if (/^[-*]\s+/m.test(block)) {
    const items = parseListItems(block);
    return `<ul class="ml-6 list-disc space-y-2">${items.map((item) => `<li>${renderListItem(item)}</li>`).join("")}</ul>`;
  }
  return `<p>${inlineMarkdown(block).replace(/\n/g, "<br />")}</p>`;
}

function renderCodeBlock(code: string): string {
  if (!code.trim()) {
    return "";
  }
  return [
    `<pre class="my-5 overflow-auto rounded-[1.25rem] bg-secondary/70 px-5 py-4 font-mono text-sm leading-7 text-foreground shadow-inner" data-code="${escapeHtml(code)}">`,
    `<code>${highlightPseudoCode(code)}</code>`,
    "</pre>",
  ].join("");
}

function highlightPseudoCode(code: string): string {
  return code.split("\n").map(highlightPseudoCodeLine).join("\n");
}

function highlightPseudoCodeLine(line: string): string {
  const tokenPattern = /\b(for|to|do|od|if|then|else|while|return)\b|(<-|[()+*=/])|\b(\d+)\b/g;
  let output = "";
  let cursor = 0;
  for (const match of line.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    output += escapeHtml(line.slice(cursor, index));
    const token = match[0];
    if (match[1]) {
      output += `<span class="font-semibold text-blue-700">${escapeHtml(token)}</span>`;
    } else if (match[2]) {
      output += `<span class="text-emerald-700">${escapeHtml(token)}</span>`;
    } else {
      output += `<span class="text-violet-700">${escapeHtml(token)}</span>`;
    }
    cursor = index + token.length;
  }
  return output + escapeHtml(line.slice(cursor));
}

function isMarkdownTableBlock(block: string): boolean {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2 || !lines[0]?.includes("|")) {
    return false;
  }
  const headerCells = splitMarkdownTableRow(lines[0]);
  const delimiterCells = splitMarkdownTableRow(lines[1] ?? "");
  return headerCells.length >= 2 &&
    delimiterCells.length === headerCells.length &&
    delimiterCells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function renderMarkdownTable(block: string): string {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  const header = splitMarkdownTableRow(lines[0] ?? "");
  const bodyRows = lines.slice(2)
    .map(splitMarkdownTableRow)
    .filter((cells) => cells.length > 0)
    .map((cells) => header.map((_, index) => cells[index] ?? ""));

  const headerHtml = header
    .map((cell) => `<th class="px-3 py-2 font-semibold">${inlineMarkdown(cell)}</th>`)
    .join("");
  const bodyHtml = bodyRows
    .map((cells) => `<tr class="border-b border-border/70 align-top last:border-b-0">${cells.map((cell) => `<td class="px-3 py-3">${inlineMarkdown(cell)}</td>`).join("")}</tr>`)
    .join("");

  return [
    '<div class="my-5 overflow-x-auto rounded-md bg-secondary/50">',
    '<table class="w-full min-w-[640px] border-collapse text-left text-sm leading-6 text-foreground">',
    `<thead class="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground"><tr>${headerHtml}</tr></thead>`,
    `<tbody>${bodyHtml}</tbody>`,
    "</table>",
    "</div>",
  ].join("");
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const char of trimmed) {
    if (escaped) {
      current += char === "|" ? "|" : `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (escaped) {
    current += "\\";
  }
  cells.push(current.trim());
  return cells;
}

function hasMixedSlideLines(block: string): boolean {
  if (/\$\$|\\\[/.test(block)) {
    return false;
  }
  const lines = block.split("\n").filter((line) => line.trim());
  return lines.some((line) => !isListLine(line)) && lines.some(isListLine);
}

function isListLine(line: string): boolean {
  return /^(?:\s*•\s*)?\s*[-*]\s+/.test(line);
}

function cleanSlideLine(line: string): string {
  return cleanListItem(line).trim();
}

function cleanListItem(line: string): string {
  return line.replace(/^\s*•\s*/, "").replace(/^\s*[-*]\s+/, "");
}

function parseListItems(block: string): string[] {
  const items: string[] = [];
  let current: string[] = [];
  for (const line of block.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    if (isListLine(line)) {
      if (current.length > 0) {
        items.push(current.join("\n").trim());
      }
      current = [cleanListItem(line)];
      continue;
    }
    if (current.length === 0) {
      current = [line.trim()];
    } else {
      current.push(line.trim());
    }
  }
  if (current.length > 0) {
    items.push(current.join("\n").trim());
  }
  return items;
}

function renderListItem(item: string): string {
  if (isDisplayMathBlock(item) || /\$\$|\\\[/.test(item)) {
    return renderMarkdownBlocks(splitMarkdownBlocks(item)).join("");
  }
  return inlineMarkdown(item).replace(/\n/g, "<br />");
}

function inlineMarkdown(text: string): string {
  const escaped = escapeHtml(text);
  return renderMath(escaped)
    .replace(/\[([^\]]+)\]\(moodle-resource:([^)]+)\)/g, (_, label: string, resourceId: string) => {
      const decodedId = decodeHtml(resourceId);
      return `<button class="inline max-w-full p-0 text-left text-[0.9em] font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900" data-moodle-resource-id="${escapeHtml(decodedId)}" type="button">${label}</button>`;
    })
    .replace(/\[([^\]]+)\]\((?!moodle-resource:)([^)]+)\)/g, (_, label: string, href: string) => {
      const decodedHref = decodeHtml(href).trim();
      if (/^https?:\/\//i.test(decodedHref) || decodedHref.startsWith("/")) {
        return `<a class="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900" href="${escapeHtml(decodedHref)}" rel="noreferrer" target="_blank">${label}</a>`;
      }
      return label;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code class=\"rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em]\">$1</code>");
}

function isHtmlCommentBlock(block: string): boolean {
  return /^<!--[\s\S]*-->$/.test(block.trim());
}

function isTrustedFigureBlock(block: string): boolean {
  const trimmed = block.trim();
  if (!/^<figure>[\s\S]*<\/figure>$/.test(trimmed)) {
    return false;
  }
  const src = attributeValue(trimmed, "src");
  return Boolean(src && (
    src.startsWith("/api/moodle/") ||
    src.startsWith("/api/study-bundles/") ||
    src.startsWith("/_next/")
  ));
}

function renderTrustedFigure(block: string): string {
  const src = attributeValue(block, "src") ?? "";
  const alt = attributeValue(block, "alt") ?? "";
  return [
    '<figure class="mx-auto my-6 max-w-[min(560px,100%)] overflow-hidden rounded-md border border-border bg-background">',
    `<img class="mx-auto h-auto max-h-[320px] w-full object-contain" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`,
    alt ? `<figcaption class="border-t border-border px-3 py-2 text-xs text-muted-foreground">${escapeHtml(alt)}</figcaption>` : "",
    "</figure>",
  ].join("");
}

function attributeValue(markup: string, name: string): string | null {
  const match = markup.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match?.[1] ?? null;
}

function isHeadingBlock(block: string): boolean {
  return /^(#{1,3})\s+(.+)$/.test(block);
}

function isSourceBlock(block: string): boolean {
  return /^(source|task source|solution source)\s*:/i.test(block.trim());
}

function renderSourceLinks(block: string): string {
  return `<span class="inline-flex flex-wrap gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground">${inlineMarkdown(block)}</span>`;
}

export function renderScriptMarkdownHTML(markdown: string): string {
  return renderMarkdownBlocks(splitMarkdownBlocks(markdown)).join("");
}

export function extractScriptSections(markdown: string) {
  return splitMarkdownBlocks(markdown)
    .map((block, blockIndex) => {
      const heading = block.match(/^(#{1,3})\s+(.+)$/);
      if (!heading) {
        return null;
      }
      return {
        blockIndex,
        id: headingAnchorId(heading[2]),
        level: heading[1].length,
        title: stripMarkdown(heading[2]),
      };
    })
    .filter((section): section is { blockIndex: number; id: string; level: number; title: string } => Boolean(section));
}

export function buildScriptPDFMapping(
  markdown: string,
  resources: Array<{ kind: string; resourceId: string; title: string }>,
): ScriptPDFMappingItem[] {
  const pdfResources = resources.filter((resource) => resource.kind.toLowerCase().includes("pdf"));
  const resourceById = new Map(pdfResources.map((resource) => [normalizeMoodleResourceId(resource.resourceId), resource]));
  const mappingById = new Map<string, ScriptPDFMappingItem>();
  let currentArea = "Course script";

  splitMarkdownBlocks(markdown).forEach((block) => {
    const heading = block.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      currentArea = stripMarkdown(heading[2]);
    }

    for (const match of block.matchAll(/\]\(moodle-resource:([^)]+)\)/g)) {
      const resourceId = normalizeMoodleResourceId(decodeHtml(match[1]));
      const resource = resourceById.get(resourceId);
      if (!resource) {
        continue;
      }
      const item = mappingById.get(resourceId) ?? {
        areas: [],
        order: mappingById.size + 1,
        resourceId,
        title: resource.title,
      };
      if (!item.areas.includes(currentArea)) {
        item.areas.push(currentArea);
      }
      mappingById.set(resourceId, item);
    }
  });

  for (const resource of pdfResources) {
    const resourceId = normalizeMoodleResourceId(resource.resourceId);
    if (!mappingById.has(resourceId)) {
      mappingById.set(resourceId, {
        areas: [],
        order: mappingById.size + 1,
        resourceId,
        title: resource.title,
      });
    }
  }

  return Array.from(mappingById.values());
}

function normalizeMoodleResourceId(resourceId: string): string {
  return resourceId.replace(/^\/+/, "");
}

function headingAnchorId(value: string): string {
  const stripped = stripMarkdown(value);
  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `section-${slug || "untitled"}`;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#]/g, "")
    .trim();
}

function renderMath(value: string): string {
  return value
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: true, throwOnError: false }))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: true, throwOnError: false }))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: false, throwOnError: false }))
    .replace(/(^|[^$])\$([^$\n]+?)\$/g, (_, prefix: string, expression: string) => `${prefix}${katex.renderToString(unescapeHtml(expression), { displayMode: false, throwOnError: false })}`);
}

function isDisplayMathBlock(block: string): boolean {
  const trimmed = block.trim();
  return /^\$\$[\s\S]*\$\$$/.test(trimmed) || /^\\\[[\s\S]*\\\]$/.test(trimmed);
}

function handleMarkdownClick(
  event: React.MouseEvent<HTMLDivElement>,
  onCitationClick: ((resourceId: string) => void) | undefined,
) {
  if (!onCitationClick) {
    return;
  }
  const target = event.target instanceof HTMLElement
    ? event.target.closest<HTMLElement>("[data-moodle-resource-id]")
    : null;
  const resourceId = target?.dataset.moodleResourceId;
  if (!resourceId) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  onCitationClick(decodeURIComponent(resourceId));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function decodeHtml(value: string): string {
  return unescapeHtml(value);
}

function resourceTitle(view: TaskViewResponse | null, materials: Material[], resourceId: string): string | null {
  return view?.resources.find((resource) => resource.resourceId === resourceId)?.title
    ?? materials.find((material) => material.id === resourceId)?.name
    ?? null;
}

async function studyPipelineRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(studyPipelineEndpoint(path), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    const errorMessage = payload && typeof payload === "object" && "error" in payload
      ? String(payload.error)
      : `Moodle study pipeline failed with ${response.status}.`;
    throw new Error(errorMessage);
  }
  return payload as T;
}

function studyPipelineEndpoint(path: string): string {
  return `/api/study-pipeline${path}`;
}

async function loadTaskViewResponse(courseId: string, includeScript: boolean, signal?: AbortSignal): Promise<TaskViewResponse> {
  const query = `includeScript=${includeScript ? "1" : "0"}`;
  try {
    return await studyPipelineRequest<TaskViewResponse>(
      `/courses/${encodeURIComponent(courseId)}/study-pipeline/task-view?${query}`,
      signal ? { signal } : undefined,
    );
  } catch (pipelineError) {
    const bundlePath = `/api/study-bundles/courses/${encodeURIComponent(courseId)}/task-view?${query}`;
    const bundleResponse = await fetch(bundlePath, { signal });
    if (bundleResponse.ok) {
      return await bundleResponse.json() as TaskViewResponse;
    }
    if (![404, 400].includes(bundleResponse.status)) {
      const payload = await bundleResponse.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error ?? getErrorMessage(pipelineError));
    }
    throw pipelineError;
  }
}

async function runCodex(prompt: string): Promise<{ finalResponse: string }> {
  const response = await fetch("/api/codex/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt,
      moodleContext: { source: "task-study" },
      stream: false,
    }),
  });
  const payload = await response.json().catch(() => ({})) as { finalResponse?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Codex failed with ${response.status}.`);
  }
  return { finalResponse: payload.finalResponse ?? "" };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatStudyPipelineError(error: unknown): string {
  return getErrorMessage(error)
    .replace(/^Task Forge failed/i, "Moodle study pipeline failed")
    .replace(/^Study bundle/i, "Moodle study pipeline");
}

function stageMessage(stage: StudyPipelineStage, mode: Mode): string {
  if (stage === "raw") {
    return "Moodle-Rohdaten werden vorbereitet...";
  }
  if (stage === "extracted") {
    return "Texte werden aus den Moodle-Ressourcen extrahiert...";
  }
  return mode === "script" ? "Texte werden geprüft und das Script wird erstellt..." : "Texte werden geprüft und Aufgaben werden erstellt...";
}

function stageDoneMessage(stage: StudyPipelineStage, mode: Mode): string {
  if (stage === "raw") {
    return "Moodle-Rohdaten sind vorbereitet.";
  }
  if (stage === "extracted") {
    return "Texte sind extrahiert.";
  }
  return mode === "script" ? "Script wurde erstellt." : "Aufgaben wurden erstellt.";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
    || error instanceof Error && error.name === "AbortError";
}
