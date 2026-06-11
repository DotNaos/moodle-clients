"use client";

import katex from "katex";
import { BookOpenText, Check, CheckCircle2, ChevronDown, FileText, Gauge, MessageCircle, RefreshCw, SendHorizontal, Sparkles, WandSparkles } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  StudyPipelinePreview,
  type StudyPipelineStage,
  type StudyPipelineStatusResponse,
} from "@/components/study-pipeline-preview";
import type { Course, Material } from "@/lib/dashboard-data";
import { courseTitle } from "@/lib/dashboard-data";
import type { StudyOutline } from "@/lib/study-outline";
import { EMPTY_STUDY_OUTLINE } from "@/lib/study-outline";
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

type TaskChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

type CodexModelOption = {
  id: string;
  label: string;
  description?: string;
  defaultReasoningEffort?: string;
  reasoningEfforts?: CodexReasoningOption[];
  speedTiers?: string[];
};

type CodexReasoningOption = {
  id: string;
  label: string;
  description?: string;
};

type RefineStreamEvent = {
  type?: string;
  message?: string;
  model?: string;
  reasoningEffort?: string;
  error?: string;
  contentPreview?: string;
};

type Mode = "tasks" | "script";

export function TaskStudyPanel({
  course,
  materials,
  mode,
  onOpenResource,
  onSelectedTaskIdChange,
  onSelectedScriptSectionIdChange,
  onStudyOutlineChange,
  onTaskViewChange,
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
  selectedScriptSectionId: string | null;
  selectedTaskId: string | null;
  taskViewOverride?: TaskViewResponse;
}) {
  const [view, setView] = useState<TaskViewResponse | null>(null);
  const [answer, setAnswer] = useState("");
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatMessages, setChatMessages] = useState<TaskChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updatingTaskStatus, setUpdatingTaskStatus] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [scriptIncluded, setScriptIncluded] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<StudyPipelineStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [runningStage, setRunningStage] = useState<StudyPipelineStage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refiningTarget, setRefiningTarget] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [refineModels, setRefineModels] = useState<CodexModelOption[]>([]);
  const [selectedRefineModel, setSelectedRefineModel] = useState("");
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState("");
  const [refineInstructions, setRefineInstructions] = useState("");
  const [codexConnected, setCodexConnected] = useState(false);
  const [codexAuthChecking, setCodexAuthChecking] = useState(false);
  const [refineStream, setRefineStream] = useState<string[]>([]);
  const loadRequestId = useRef(0);

  const courseId = course ? String(course.id) : null;
  const tasks = useMemo(() => view?.sheets.flatMap((sheet) => sheet.tasks) ?? [], [view]);
  const selectedTask = useMemo(
    () => selectedTaskId ? tasks.find((task) => task.taskId === selectedTaskId) ?? null : null,
    [selectedTaskId, tasks],
  );
  const selectedSheet = useMemo(
    () => view?.sheets.find((sheet) => sheet.tasks.some((task) => task.taskId === selectedTask?.taskId)) ?? null,
    [selectedTask, view],
  );
  const selectedResource = useMemo(
    () => selectedTask ? resourceTitle(view, materials, selectedTask.sourceResourceId) : null,
    [materials, selectedTask, view],
  );
  const selectedModel = useMemo(
    () => refineModels.find((model) => model.id === selectedRefineModel) ?? null,
    [refineModels, selectedRefineModel],
  );

  useEffect(() => {
    const controller = new AbortController();
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;
    setView(null);
    onStudyOutlineChange(EMPTY_STUDY_OUTLINE);
    setAnswer("");
    setChatMessages([]);
    setScriptIncluded(false);
    onTaskViewChange?.(null);
    setMessage(null);
    setError(null);
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
    if (!courseId) {
      setRefineModels([]);
      setSelectedRefineModel("");
      setSelectedReasoningEffort("");
      setModelError(null);
      setCodexConnected(false);
      return;
    }
    const controller = new AbortController();
    void refreshCodexModelCatalog(controller.signal);
    return () => controller.abort();
  }, [courseId]);

  useEffect(() => {
    if (!selectedTask) {
      setAnswer("");
      setChatMessages([]);
      return;
    }
    setAnswer(selectedTask.latestAttempt?.userAnswer ?? "");
    void loadChat(selectedTask.taskId);
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
    setLoading(false);
    setError(null);
    setMessage(null);
    try {
      const status = await studyPipelineRequest<StudyPipelineStatusResponse>(
        `/courses/${encodeURIComponent(id)}/study-pipeline`,
        request?.signal ? { signal: request.signal } : undefined,
      );
      if (request && (request.signal.aborted || request.requestId !== loadRequestId.current)) {
        return;
      }
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
      }
    }
  }

  async function runPipelineStage(stage: StudyPipelineStage) {
    if (!courseId || runningStage) {
      return;
    }
    setRunningStage(stage);
    setError(null);
    setMessage(stageMessage(stage, mode));
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
      const nextView = await studyPipelineRequest<TaskViewResponse>(
        `/courses/${encodeURIComponent(id)}/study-pipeline/task-view?includeScript=${includeScript ? "1" : "0"}`,
        request?.signal ? { signal: request.signal } : undefined,
      );
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
  }

  async function loadChat(taskId: string) {
    try {
      const payload = await studyPipelineRequest<{ messages: TaskChatMessage[] }>(
        `/courses/${encodeURIComponent(courseId ?? "")}/study-pipeline/tasks/${encodeURIComponent(taskId)}/chat`,
      );
      setChatMessages(asArray(payload.messages));
    } catch {
      setChatMessages([]);
    }
  }

  async function checkAnswer() {
    if (!selectedTask || !course || !courseId || checking) {
      return;
    }
    const trimmed = answer.trim();
    if (!trimmed) {
      setError("Write an answer before asking Codex to check it.");
      return;
    }

    setChecking(true);
    setError(null);
    setMessage("Codex is checking your answer...");
    try {
      const feedback = await runCodex([
        "Check this student answer against the Moodle task.",
        "Return clear feedback: what is correct, what is wrong or missing, and what to do next.",
        "",
        `Course: ${courseTitle(course)}`,
        `Sheet: ${selectedSheet?.title ?? "Unknown"}`,
        `Task: ${selectedTask.title}`,
        "",
        "Task prompt:",
        taskPromptText(selectedTask),
        "",
        "Student answer:",
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
    if (!selectedTask || !courseId || updatingTaskStatus) {
      return;
    }
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
      setView((current) => {
        if (!current) {
          return current;
        }
        const nextView = updateTaskStatusInView(current, selectedTask.taskId, status);
        onTaskViewChange?.(nextView);
        return nextView;
      });
      setMessage(status === "done" ? "Aufgabe als erledigt markiert." : "Aufgabe wieder geöffnet.");
    } catch (statusError) {
      setError(getErrorMessage(statusError));
    } finally {
      setUpdatingTaskStatus(false);
    }
  }

  async function sendChat() {
    if (!selectedTask || !course || chatting) {
      return;
    }
    const text = chatPrompt.trim();
    if (!text) {
      return;
    }
    setChatting(true);
    setError(null);
    setChatPrompt("");
    try {
      await studyPipelineRequest(`/courses/${encodeURIComponent(courseId ?? "")}/study-pipeline/tasks/${encodeURIComponent(selectedTask.taskId)}/chat`, {
        method: "POST",
        body: JSON.stringify({ role: "user", text }),
      });
      const response = await runCodex([
        "You are helping with this Moodle task. Use the task prompt, latest answer, and chat history.",
        "",
        `Course: ${courseTitle(course)}`,
        `Sheet: ${selectedSheet?.title ?? "Unknown"}`,
        `Task: ${selectedTask.title}`,
        "",
        "Task prompt:",
        taskPromptText(selectedTask),
        "",
        "Latest answer:",
        answer.trim() || "No answer yet.",
        "",
        "Chat history:",
        asArray(chatMessages).map((message) => `${message.role}: ${message.text}`).join("\n") || "No previous chat.",
        "",
        "User message:",
        text,
      ].join("\n"));
      await studyPipelineRequest(`/courses/${encodeURIComponent(courseId ?? "")}/study-pipeline/tasks/${encodeURIComponent(selectedTask.taskId)}/chat`, {
        method: "POST",
        body: JSON.stringify({ role: "assistant", text: response.finalResponse }),
      });
      await loadChat(selectedTask.taskId);
    } catch (chatError) {
      setError(getErrorMessage(chatError));
    } finally {
      setChatting(false);
    }
  }

  async function refreshCodexModelCatalog(signal?: AbortSignal) {
    setCodexAuthChecking(true);
    setModelError(null);
    try {
      const response = await fetch("/api/codex/auth", {
        cache: "no-store",
        signal,
      });
      const payload = await response.json().catch(() => ({})) as { authenticated?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Codex status failed with ${response.status}.`);
      }
      if (!payload.authenticated) {
        setCodexConnected(false);
        setRefineModels([]);
        setSelectedRefineModel("");
        setSelectedReasoningEffort("");
        setModelError("Connect ChatGPT before loading refinement models.");
        return;
      }
      setCodexConnected(true);
      await loadCodexModels(signal);
    } catch (authError) {
      if (!isAbortError(authError)) {
        setCodexConnected(false);
        setRefineModels([]);
        setSelectedRefineModel("");
        setSelectedReasoningEffort("");
        setModelError(getErrorMessage(authError));
      }
    } finally {
      setCodexAuthChecking(false);
    }
  }

  async function loadCodexModels(signal?: AbortSignal) {
    setModelLoading(true);
    setModelError(null);
    try {
      const response = await fetch("/api/codex/models", {
        cache: "no-store",
        signal,
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; models?: CodexModelOption[] };
      if (!response.ok) {
        throw new Error(payload.error ?? `Model catalog failed with ${response.status}.`);
      }
      const models = asArray(payload.models).filter((model) => model.id && model.label);
      setRefineModels(models);
      setSelectedRefineModel((current) => {
        const nextModel = models.some((model) => model.id === current) ? current : models[0]?.id ?? "";
        const model = models.find((item) => item.id === nextModel) ?? null;
        setSelectedReasoningEffort((currentEffort) => nextReasoningEffort(model, currentEffort));
        return nextModel;
      });
    } catch (modelsError) {
      if (!isAbortError(modelsError)) {
        setRefineModels([]);
        setSelectedRefineModel("");
        setSelectedReasoningEffort("");
        setModelError(getErrorMessage(modelsError));
      }
    } finally {
      setModelLoading(false);
    }
  }

  async function refineStudyContent(kind: "script-section" | "task", targetID: string) {
    if (!courseId || !targetID || refiningTarget) {
      return;
    }
    if (!codexConnected) {
      setError("Connect ChatGPT before improving study content.");
      return;
    }
    if (!selectedRefineModel) {
      setError("Choose a Codex model from the catalog before improving this content.");
      return;
    }
    const refineKey = `${kind}:${targetID}`;
    setRefiningTarget(refineKey);
    setError(null);
    setRefineStream([]);
    setMessage(null);
    try {
      const response = await fetch(studyPipelineEndpoint(`/courses/${encodeURIComponent(courseId)}/study-pipeline/refine`), {
        method: "POST",
        headers: {
          accept: "application/x-ndjson",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          kind,
          targetId: targetID,
          model: selectedRefineModel,
          reasoningEffort: selectedReasoningEffort,
          customPrompt: refineInstructions.trim() || undefined,
        }),
      });
      await readRefineStream(response, (event) => {
        const line = refineEventMessage(event);
        if (line) {
          setRefineStream((current) => [...current.slice(-5), line]);
        }
      });
      await loadView(courseId, mode === "script" || scriptIncluded);
      setMessage("Codex-improved version saved separately from the extracted source.");
    } catch (refineError) {
      const message = getErrorMessage(refineError);
      setError(message);
      if (isCodexAuthError(message)) {
        setCodexConnected(false);
        setRefineModels([]);
        setSelectedRefineModel("");
        setSelectedReasoningEffort("");
        setModelError("Connect ChatGPT again before improving study content.");
      }
    } finally {
      setRefiningTarget(null);
      setRefineStream([]);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-visible">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between md:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {mode === "script" ? <BookOpenText aria-hidden className="size-4" /> : <CheckCircle2 aria-hidden className="size-4" />}
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {mode === "script" ? "Script" : "Aufgaben"}
            </h2>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">{courseTitle(course)}</p>
        </div>
        {view ? (
          <Button
            className="w-fit"
            disabled={loading || runningStage === "curated"}
            onClick={() => void runPipelineStage("curated")}
            type="button"
            variant="secondary"
          >
            {loading || runningStage === "curated" ? <Spinner aria-hidden /> : <RefreshCw aria-hidden />}
            Neu erstellen
          </Button>
        ) : null}
      </div>

      {error ? <div className="mx-4 mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive md:mx-5">{error}</div> : null}
      {message ? <div className="mx-4 mt-4 rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground md:mx-5">{message}</div> : null}
      {refineStream.length > 0 ? (
        <div className="mx-4 mt-4 rounded-[1.5rem] bg-secondary px-4 py-3 text-sm text-muted-foreground md:mx-5">
          <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
            <Spinner aria-hidden />
            Codex arbeitet
          </div>
          <div className="space-y-1">
            {refineStream.map((line, index) => (
              <p className="truncate" key={`${line}-${index}`}>{line}</p>
            ))}
          </div>
        </div>
      ) : null}
      {view ? (
        <CodexModelPicker
          authChecking={codexAuthChecking}
          connected={codexConnected}
          error={modelError}
          loading={modelLoading}
          models={refineModels}
          onModelChange={(modelId) => {
            const nextModel = refineModels.find((model) => model.id === modelId) ?? null;
            setSelectedRefineModel(modelId);
            setSelectedReasoningEffort((current) => nextReasoningEffort(nextModel, current));
          }}
          onReasoningChange={setSelectedReasoningEffort}
          onInstructionsChange={setRefineInstructions}
          instructions={refineInstructions}
          reasoningValue={selectedReasoningEffort}
          selectedModel={selectedModel}
          value={selectedRefineModel}
        />
      ) : null}

      {!view && !loading ? (
        <StudyPipelinePreview
          course={course}
          loading={statusLoading}
          mode={mode}
          onRunStage={(stage) => void runPipelineStage(stage)}
          runningStage={runningStage}
          status={pipelineStatus}
        />
      ) : loading && !view ? (
        <div className="grid min-h-0 flex-1 place-items-center text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><Spinner aria-hidden /> Loading study material</span>
        </div>
      ) : mode === "script" ? (
        <ScriptReader
          courseTitleText={courseTitle(course)}
          modelReady={codexConnected && Boolean(selectedRefineModel)}
          onCitationClick={onOpenResource}
          onRefine={(targetID) => void refineStudyContent("script-section", targetID)}
          onSelectSection={onSelectedScriptSectionIdChange}
          refiningTarget={refiningTarget}
          selectedSectionId={selectedScriptSectionId}
          view={view}
        />
      ) : (
        <div
          className={cn(
            "grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-visible md:overflow-auto",
            selectedTask ? "2xl:grid-cols-[minmax(0,1fr)_340px]" : "",
          )}
        >
          {selectedTask ? (
            <aside className="max-h-72 min-h-0 overflow-auto border-b border-border px-3 py-3 md:hidden">
              {view?.sheets.map((sheet) => (
                <section className="mb-5" key={sheet.resourceId}>
                  <h3 className="mb-2 line-clamp-2 px-2 text-xs font-medium uppercase text-muted-foreground">
                    {sheet.title}
                  </h3>
                  <div className="flex flex-col gap-1">
                    {sheet.tasks.map((task) => (
                      <button
                        className={cn(
                          "rounded-2xl px-3 py-2 text-left text-sm transition-colors",
                          task.taskId === selectedTask?.taskId ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
                        )}
                        key={task.taskId}
                        onClick={() => onSelectedTaskIdChange(task.taskId)}
                        type="button"
                      >
                        <span className="line-clamp-2 font-medium">{task.title}</span>
                        <span className={cn("mt-1 block text-xs", task.taskId === selectedTask?.taskId ? "text-primary-foreground/70" : "text-muted-foreground")}>
                          {task.status.replace("_", " ")}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )) ?? null}
            </aside>
          ) : null}

          <main className="min-h-0 overflow-visible bg-background px-4 py-5 md:px-10 md:py-8">
            {selectedTask ? (
              <article className="mx-auto max-w-[82ch]">
                <header className="mb-6 border-b border-border pb-5">
                  <p className="text-sm font-medium text-muted-foreground">{selectedSheet?.title ?? "Aufgabenblatt"}</p>
                  <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-foreground">
                    {selectedTask.title}
                  </h3>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <ContentStateBadge state={selectedTask.contentState} />
                    <Button
                      disabled={updatingTaskStatus}
                      onClick={() => void updateSelectedTaskStatus(isDoneTaskStatus(selectedTask.status) ? "open" : "done")}
                      type="button"
                      variant={isDoneTaskStatus(selectedTask.status) ? "secondary" : "default"}
                    >
                      {updatingTaskStatus ? <Spinner aria-hidden /> : <CheckCircle2 aria-hidden />}
                      {isDoneTaskStatus(selectedTask.status) ? "Wieder öffnen" : "Erledigt"}
                    </Button>
                    {selectedTask.contentState?.id ? (
                      <Button
                        disabled={!codexConnected || !selectedRefineModel || refiningTarget === `task:${selectedTask.contentState.id}`}
                        onClick={() => void refineStudyContent("task", selectedTask.contentState?.id ?? selectedTask.sourceResourceId)}
                        type="button"
                        variant="secondary"
                      >
                        {refiningTarget === `task:${selectedTask.contentState.id}` ? <Spinner aria-hidden /> : <WandSparkles aria-hidden />}
                        Mit Codex verbessern
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{selectedResource ?? courseTitle(course)}</p>
                </header>
                <div className="py-2">
                  <MarkdownBlock onCitationClick={onOpenResource} text={taskPromptText(selectedTask)} />
                </div>
                <label className="mt-5 block text-sm font-medium text-muted-foreground">
                  Deine Lösung
                  <textarea
                    className="mt-2 min-h-36 w-full resize-y rounded-[1.5rem] bg-secondary px-4 py-3 text-sm leading-6 outline-none transition-colors focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => setAnswer(event.target.value)}
                    value={answer}
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button disabled={checking} onClick={() => void checkAnswer()} type="button">
                    {checking ? <Spinner aria-hidden /> : <CheckCircle2 aria-hidden />}
                    Mit Codex prüfen
                  </Button>
                </div>
                {selectedTask.latestAttempt?.verdict.feedbackMarkdown ? (
                  <section className="mt-6 rounded-[1.5rem] bg-secondary px-5 py-4">
                    <h4 className="mb-3 flex items-center gap-2 font-semibold">
                      <MessageCircle aria-hidden className="size-4" />
                      Feedback
                    </h4>
                    <MarkdownBlock onCitationClick={onOpenResource} text={selectedTask.latestAttempt.verdict.feedbackMarkdown} />
                  </section>
                ) : null}

                <section className="mt-6 border-t border-border pt-5">
                  <h4 className="font-semibold">Chat zu dieser Aufgabe</h4>
                  <div className="mt-3 flex flex-col gap-2">
                      {asArray(chatMessages).map((chat) => (
                      <div
                        className={cn(
                          "rounded-[1.25rem] px-4 py-3 text-sm leading-6",
                          chat.role === "user" ? "self-end bg-primary text-primary-foreground" : "bg-secondary",
                        )}
                        key={chat.id}
                      >
                        <MarkdownBlock onCitationClick={onOpenResource} text={chat.text} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <textarea
                      className="min-h-20 flex-1 resize-y rounded-[1.5rem] bg-secondary px-4 py-3 text-sm outline-none focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                      onChange={(event) => setChatPrompt(event.target.value)}
                      placeholder="Nachfrage stellen..."
                      value={chatPrompt}
                    />
                    <Button className="sm:self-start" disabled={chatting || !chatPrompt.trim()} onClick={() => void sendChat()} type="button">
                      {chatting ? <Spinner aria-hidden /> : <SendHorizontal aria-hidden />}
                      Senden
                    </Button>
                  </div>
                </section>
              </article>
            ) : (
              <div className="grid min-h-80 place-items-center text-center text-sm text-muted-foreground">
                <div>
                  <FileText className="mx-auto mb-3" aria-hidden />
                  Keine Aufgaben gefunden.
                </div>
              </div>
            )}
          </main>
          {selectedTask ? (
            <aside className="mx-auto min-h-0 max-w-[82ch] overflow-visible border-t border-border bg-background px-5 py-6 sm:px-9 2xl:mx-0 2xl:h-full 2xl:max-w-none 2xl:overflow-auto 2xl:border-l 2xl:border-t-0">
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Quelle</p>
                  <h4 className="mt-1 text-sm font-semibold">{selectedResource ?? selectedSheet?.title ?? "Moodle resource"}</h4>
                  {selectedTask ? (
                    <Button className="mt-3" onClick={() => onOpenResource(selectedTask.sourceResourceId)} type="button" variant="secondary">
                      Aufgabenblatt öffnen
                    </Button>
                  ) : null}
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Lösung</p>
                  {selectedSheet?.solutionResourceId ? (
                    <>
                      <h4 className="mt-1 text-sm font-semibold">{selectedSheet.solutionTitle ?? "Lösung"}</h4>
                      <Button className="mt-3" onClick={() => onOpenResource(selectedSheet.solutionResourceId!)} type="button" variant="secondary">
                        Lösungs-PDF öffnen
                      </Button>
                      {selectedSheet.solutionMarkdown ? (
                        <div className="mt-4 border-t border-border pt-4 md:max-h-[36rem] md:overflow-auto">
                          <MarkdownBlock onCitationClick={onOpenResource} text={selectedSheet.solutionMarkdown} />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Keine Moodle-Lösung gefunden. Codex prüft deine Antwort direkt gegen Aufgabe und Kurskontext.
                    </p>
                  )}
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      )}
    </section>
  );
}

function CodexModelPicker({
  authChecking,
  connected,
  error,
  loading,
  models,
  onModelChange,
  onReasoningChange,
  onInstructionsChange,
  instructions,
  reasoningValue,
  selectedModel,
  value,
}: {
  authChecking: boolean;
  connected: boolean;
  error: string | null;
  loading: boolean;
  models: CodexModelOption[];
  onModelChange: (value: string) => void;
  onReasoningChange: (value: string) => void;
  onInstructionsChange: (value: string) => void;
  instructions: string;
  reasoningValue: string;
  selectedModel: CodexModelOption | null;
  value: string;
}) {
  const [openMenu, setOpenMenu] = useState<"model" | "reasoning" | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const reasoningOptions = asArray(selectedModel?.reasoningEfforts);
  const selectedReasoning = reasoningOptions.find((option) => option.id === reasoningValue) ?? null;
  const disabled = authChecking || loading || !connected;
  const statusText = authChecking
    ? "Checking ChatGPT connection..."
    : !connected
      ? "Connect ChatGPT before choosing a model."
      : loading
        ? "Loading model catalog..."
        : error
          ? error
      : "Loaded from your Codex catalog.";

  useEffect(() => {
    if (!openMenu) {
      return;
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  return (
    <div ref={pickerRef} className="mx-4 mt-4 flex flex-col gap-3 rounded-[1.5rem] bg-secondary px-4 py-3 text-sm md:mx-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Sparkles aria-hidden className="size-4" />
            Codex refinement
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{statusText}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <CatalogMenu
            disabled={disabled || models.length === 0}
            icon={<Sparkles aria-hidden className="size-4" />}
            label="Model"
            onOpenChange={(open) => setOpenMenu(open ? "model" : null)}
            open={openMenu === "model"}
            options={models.map((model) => ({
              id: model.id,
              label: model.label,
              description: model.speedTiers?.length ? `Speed: ${model.speedTiers.join(", ")}` : model.description,
            }))}
            onSelect={onModelChange}
            value={value}
            valueLabel={selectedModel?.label ?? "No model"}
          />
          <CatalogMenu
            disabled={disabled || reasoningOptions.length === 0}
            icon={<Gauge aria-hidden className="size-4" />}
            label="Reasoning"
            onOpenChange={(open) => setOpenMenu(open ? "reasoning" : null)}
            open={openMenu === "reasoning"}
            options={reasoningOptions}
            onSelect={onReasoningChange}
            value={reasoningValue}
            valueLabel={selectedReasoning?.label ?? "Default"}
          />
        </div>
      </div>
      <label className="block">
        <span className="sr-only">Additional Codex refinement prompt</span>
        <textarea
          className="min-h-20 w-full resize-y rounded-[1.25rem] border-0 bg-background px-4 py-3 text-sm leading-6 text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          disabled={disabled}
          maxLength={2000}
          onChange={(event) => onInstructionsChange(event.target.value)}
          placeholder="Optional: Sag Codex, worauf es beim Verbessern achten soll..."
          value={instructions}
        />
      </label>
    </div>
  );
}

function CatalogMenu({
  disabled,
  icon,
  label,
  onOpenChange,
  onSelect,
  open,
  options,
  value,
  valueLabel,
}: {
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
  open: boolean;
  options: Array<{ id: string; label: string; description?: string }>;
  value: string;
  valueLabel: string;
}) {
  return (
    <div className="relative min-w-0">
      <Button
        aria-expanded={open}
        className="h-11 w-full justify-between bg-background px-4 shadow-sm hover:bg-background sm:w-auto sm:min-w-44"
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        type="button"
        variant="secondary"
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="min-w-0">
            <span className="block text-left text-[0.68rem] font-medium uppercase leading-3 text-muted-foreground">{label}</span>
            <span className="block max-w-48 truncate text-left text-sm text-foreground">{valueLabel}</span>
          </span>
        </span>
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", open ? "rotate-180" : "")} />
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-80 w-full overflow-auto rounded-[1.5rem] bg-popover p-2 text-popover-foreground shadow-2xl sm:w-72">
          {options.map((option) => (
            <button
              className={cn(
                "flex w-full items-start gap-3 rounded-[1rem] px-3 py-2 text-left transition-colors hover:bg-secondary",
                option.id === value ? "bg-secondary" : "",
              )}
              key={option.id}
              onClick={() => {
                onSelect(option.id);
                onOpenChange(false);
              }}
              type="button"
            >
              <span className="mt-0.5 grid size-5 place-items-center">
                {option.id === value ? <Check aria-hidden className="size-4" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{option.label}</span>
                {option.description ? (
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-4 text-muted-foreground">{option.description}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function nextReasoningEffort(model: CodexModelOption | null, current: string): string {
  const options = asArray(model?.reasoningEfforts);
  if (options.some((option) => option.id === current)) {
    return current;
  }
  if (model?.defaultReasoningEffort && options.some((option) => option.id === model.defaultReasoningEffort)) {
    return model.defaultReasoningEffort;
  }
  return options[0]?.id ?? "";
}

async function readRefineStream(response: Response, onEvent: (event: RefineStreamEvent) => void): Promise<void> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-ndjson") || !response.body) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? `Codex refinement failed with ${response.status}.`);
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseRefineStreamEvent(line);
      if (!event) {
        continue;
      }
      onEvent(event);
      if (event.type === "error") {
        throw new Error(event.error ?? event.message ?? "Codex refinement failed.");
      }
    }
  }
  if (buffer.trim()) {
    const event = parseRefineStreamEvent(buffer);
    if (event) {
      onEvent(event);
      if (event.type === "error") {
        throw new Error(event.error ?? event.message ?? "Codex refinement failed.");
      }
    }
  }
}

function parseRefineStreamEvent(line: string): RefineStreamEvent | null {
  if (!line.trim()) {
    return null;
  }
  try {
    return JSON.parse(line) as RefineStreamEvent;
  } catch {
    return null;
  }
}

function refineEventMessage(event: RefineStreamEvent): string | null {
  if (event.error) {
    return event.error;
  }
  if (event.message) {
    return event.message;
  }
  if (event.type === "done") {
    return "Codex refinement finished.";
  }
  return null;
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

function ScriptReader({
  courseTitleText,
  modelReady,
  onCitationClick,
  onRefine,
  onSelectSection,
  refiningTarget,
  selectedSectionId,
  view,
}: {
  courseTitleText: string;
  modelReady: boolean;
  onCitationClick: (resourceId: string) => void;
  onRefine: (targetID: string) => void;
  onSelectSection: (sectionId: string | null) => void;
  refiningTarget: string | null;
  selectedSectionId: string | null;
  view: TaskViewResponse | null;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chapters = useMemo(
    () => splitScriptChapters(view?.scriptMarkdown ?? "No script generated yet.", view?.scriptSections),
    [view?.scriptMarkdown, view?.scriptSections],
  );
  const [scrollProgress, setScrollProgress] = useState(0);

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
  }

  return (
    <div className="grid min-h-0 flex-1 bg-background 2xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 border-r border-border bg-background px-4 py-5 2xl:block">
        <div className="sticky top-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Course Script</p>
          <h3 className="mt-2 line-clamp-2 text-base font-semibold leading-tight">{courseTitleText}</h3>
          <nav className="mt-5 max-h-[calc(100dvh-14rem)] space-y-1 overflow-auto pr-1">
            {chapters.map((chapter) => (
              <button
                className={cn(
                  "flex w-full items-start gap-2 rounded-[1.25rem] px-3 py-2 text-left text-sm transition-colors",
                  selectedSectionId === chapter.id || selectedSectionId === chapter.state?.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-secondary",
                )}
                key={chapter.id}
                onClick={() => {
                  onSelectSection(chapter.state?.id ?? chapter.id);
                  scrollRef.current?.querySelector<HTMLElement>(`[data-script-chapter-id="${CSS.escape(chapter.id)}"]`)
                    ?.scrollIntoView({ block: "start", behavior: "smooth" });
                }}
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 font-medium">{chapter.title}</span>
                  <span className={cn("mt-1 block text-xs", selectedSectionId === chapter.id || selectedSectionId === chapter.state?.id ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {chapter.state?.statusLabel ?? "Machine extracted"}
                  </span>
                </span>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex min-h-0 flex-col">
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Reading progress</p>
              <p className="mt-1 truncate text-sm font-medium">{Math.round(scrollProgress)}% through this script</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ContentStateBadge state={scriptAggregateState(view?.scriptSections)} />
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${scrollProgress}%` }} />
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
                    {chapter.state?.id ? (
                      <Button
                        className="w-fit"
                        disabled={!modelReady || refiningTarget === `script-section:${chapter.state.id}`}
                        onClick={() => onRefine(chapter.state?.id ?? "")}
                        type="button"
                        variant="secondary"
                      >
                        {refiningTarget === `script-section:${chapter.state.id}` ? <Spinner aria-hidden /> : <WandSparkles aria-hidden />}
                        Mit Codex verbessern
                      </Button>
                    ) : null}
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
    return code.trim()
      ? `<pre class="overflow-auto rounded-md border border-border bg-secondary p-4 font-mono text-xs leading-5 text-foreground">${escapeHtml(code)}</pre>`
      : "";
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
    '<figure class="my-6 overflow-hidden rounded-md border border-border bg-background">',
    `<img class="h-auto w-full object-contain" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`,
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

function isCodexAuthError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("not connected") ||
    normalized.includes("connect chatgpt") ||
    normalized.includes("not logged in") ||
    normalized.includes("missing bearer") ||
    normalized.includes("401 unauthorized");
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
  return mode === "script" ? "Script wird erstellt..." : "Aufgaben werden erstellt...";
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
