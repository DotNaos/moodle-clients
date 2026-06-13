"use client";

import { AlertCircle, CheckCircle2, Circle, GitBranch, Loader2, Play, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  CoursePipelineBlueprint,
  type PipelineRunsResponse,
} from "@/components/course-pipeline-blueprint";
import type { BlueprintRunScope } from "@/components/course-pipeline-blueprint-model";
import { hasPipelineLiveWork } from "@/components/course-pipeline-progress";
import type { ExtractedDocumentsResponse } from "@/components/extracted-document-inspector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type {
  CourseInventoryResponse,
  StudyPipelineStatusResponse,
} from "@/components/study-pipeline-preview";
import type { TaskViewResponse } from "@/components/task-study-panel";
import type { Course } from "@/lib/dashboard-data";
import { courseTitle } from "@/lib/dashboard-data";

type CoursePipelineInspectorProps = {
  course: Course;
  courseId: string;
};

type OptionalInspectorData = "extractedDocuments" | "inventory" | "runs" | "taskView";
type PipelineStageId = "inventory" | "raw" | "extracted" | "curated";
type PipelineRunMode = "single" | "from";
type PipelineScopeMode = "course" | "selected";
type PipelineStepState = "failed" | "queued" | "running" | "succeeded";

type PipelinePlanStep = {
  detail?: string;
  id: string;
  label: string;
  state: PipelineStepState;
  stage: PipelineStageId;
};

const PIPELINE_STAGES: Array<{ id: PipelineStageId; label: string }> = [
  { id: "inventory", label: "Inventory" },
  { id: "raw", label: "Raw import" },
  { id: "extracted", label: "Extraction" },
  { id: "curated", label: "Codex" },
];

export function CoursePipelineInspector({
  course,
  courseId,
}: CoursePipelineInspectorProps) {
  const [inventory, setInventory] = useState<CourseInventoryResponse | null>(null);
  const [status, setStatus] = useState<StudyPipelineStatusResponse | null>(null);
  const [runs, setRuns] = useState<PipelineRunsResponse | null>(null);
  const [extractedDocuments, setExtractedDocuments] = useState<ExtractedDocumentsResponse | null>(null);
  const [taskView, setTaskView] = useState<TaskViewResponse | null>(null);
  const [unavailable, setUnavailable] = useState<Partial<Record<OptionalInspectorData, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectingRunId, setSelectingRunId] = useState<string | null>(null);
  const [rerunningEngine, setRerunningEngine] = useState<string | null>(null);
  const [selectedScope, setSelectedScope] = useState<BlueprintRunScope | null>(null);
  const [runMode, setRunMode] = useState<PipelineRunMode>("from");
  const [runScopeMode, setRunScopeMode] = useState<PipelineScopeMode>("selected");
  const [runStartStage, setRunStartStage] = useState<PipelineStageId>("extracted");
  const [runPlan, setRunPlan] = useState<PipelinePlanStep[]>([]);
  const [runningPlanId, setRunningPlanId] = useState<string | null>(null);

  const liveWork = useMemo(
    () => hasPipelineLiveWork({
      actionIds: [selectingRunId, rerunningEngine, runningPlanId],
      runs,
      status,
    }),
    [rerunningEngine, runningPlanId, runs, selectingRunId, status],
  );

  useEffect(() => {
    void loadInspectorData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    if (!liveWork) return;
    const timer = window.setInterval(() => {
      void loadInspectorData({ silent: true });
    }, 3500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, liveWork]);

  async function loadInspectorData(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
      setError(null);
      setUnavailable({});
    }
    try {
      const [statusResult, inventoryResult, runsResult] = await Promise.allSettled([
        studyPipelineRequest<StudyPipelineStatusResponse>(courseId, ""),
        studyPipelineRequest<CourseInventoryResponse>(courseId, "/inventory"),
        studyPipelineRequest<PipelineRunsResponse>(courseId, "/runs"),
      ]);

      if (statusResult.status === "fulfilled") {
        setStatus(statusResult.value);
      } else {
        setStatus(null);
        setError(formatStudyPipelineError(statusResult.reason));
      }

      const nextUnavailable: Partial<Record<OptionalInspectorData, string>> = {};
      if (inventoryResult.status === "fulfilled") {
        setInventory(inventoryResult.value);
      } else {
        setInventory(null);
        nextUnavailable.inventory = formatStudyPipelineError(inventoryResult.reason);
      }
      if (runsResult.status === "fulfilled") {
        setRuns(runsResult.value);
      } else {
        setRuns(null);
        nextUnavailable.runs = formatStudyPipelineError(runsResult.reason);
      }
      setUnavailable(nextUnavailable);
      if (!options?.silent) {
        setLoading(false);
      }

      void loadOptionalInspectorData({ baseUnavailable: nextUnavailable });
    } catch (loadError) {
      if (!options?.silent) {
        setError(formatStudyPipelineError(loadError));
        setLoading(false);
      }
    }
  }

  async function loadOptionalInspectorData(options?: { baseUnavailable?: Partial<Record<OptionalInspectorData, string>> }) {
    const [extractedDocumentsResult, taskViewResult] = await Promise.allSettled([
      studyPipelineRequest<ExtractedDocumentsResponse>(courseId, "/extracted-documents"),
      loadTaskViewForInspector(courseId),
    ]);

    const nextUnavailable = { ...(options?.baseUnavailable ?? {}) };
    if (extractedDocumentsResult.status === "fulfilled") {
      setExtractedDocuments(extractedDocumentsResult.value);
      delete nextUnavailable.extractedDocuments;
    } else {
      setExtractedDocuments(null);
      nextUnavailable.extractedDocuments = formatStudyPipelineError(extractedDocumentsResult.reason);
    }
    if (taskViewResult.status === "fulfilled") {
      setTaskView(taskViewResult.value);
      delete nextUnavailable.taskView;
    } else {
      setTaskView(null);
      nextUnavailable.taskView = formatStudyPipelineError(taskViewResult.reason);
    }
    setUnavailable(nextUnavailable);
  }

  async function selectActiveRun(runId: string) {
    setSelectingRunId(runId);
    setError(null);
    try {
      await studyPipelinePost(courseId, `/runs/${encodeURIComponent(runId)}/select`, {
        reason: "selected in course pipeline inspector",
      });
      setRuns(await studyPipelineRequest<PipelineRunsResponse>(courseId, "/runs"));
    } catch (selectError) {
      setError(formatStudyPipelineError(selectError));
    } finally {
      setSelectingRunId(null);
    }
  }

  async function rerunExtracted(engine: string) {
    setRerunningEngine(engine);
    setError(null);
    try {
      setStatus(await studyPipelinePost<StudyPipelineStatusResponse>(courseId, "/extracted", {
        configHash: `config:extracted:${engine}:default`,
        engine,
      }));
      setRuns(await studyPipelineRequest<PipelineRunsResponse>(courseId, "/runs"));
    } catch (rerunError) {
      setError(formatStudyPipelineError(rerunError));
    } finally {
      setRerunningEngine(null);
    }
  }

  async function runPipelinePlan() {
    const runId = makeClientRunId();
    const scope = resolveRunScope({ mode: runScopeMode, selectedScope });
    const stages = stagesForPlan(runMode, runStartStage);
    setRunningPlanId(runId);
    setError(null);
    setRunPlan(stages.map((stage) => ({
      id: `${runId}:${stage.id}`,
      label: stage.label,
      state: "queued",
      stage: stage.id,
    })));

    try {
      for (const stage of stages) {
        setRunPlan((current) => markPlanStep(current, stage.id, "running"));
        const response = await studyPipelinePost<StudyPipelineStatusResponse>(
          courseId,
          `/${stage.id}`,
          stageRequestBody(stage.id, scope),
        );
        setStatus(response);
        setRunPlan((current) => markPlanStep(current, stage.id, "succeeded"));
        await loadInspectorData({ silent: true });
      }
    } catch (runError) {
      setRunPlan((current) => markRunningPlanStepFailed(current, formatStudyPipelineError(runError)));
      setError(formatStudyPipelineError(runError));
    } finally {
      setRunningPlanId(null);
      await loadInspectorData({ silent: true });
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background md:h-full">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-4 py-5 md:px-6 md:py-6">
          <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <GitBranch aria-hidden className="size-4" />
                Pipeline
              </p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{courseTitle(course)}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge loading={loading} liveWork={liveWork} status={status?.status} />
              <Button disabled={loading} onClick={() => void loadInspectorData()} type="button" variant="secondary">
                {loading ? <Spinner aria-hidden /> : <RefreshCw aria-hidden />}
                Refresh
              </Button>
            </div>
          </header>

          {error ? (
            <div className="flex items-start gap-2 rounded-3xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <PipelineRunControl
            disabled={Boolean(runningPlanId) || loading}
            mode={runMode}
            onModeChange={setRunMode}
            onRun={() => void runPipelinePlan()}
            onScopeModeChange={setRunScopeMode}
            onStartStageChange={setRunStartStage}
            plan={runPlan}
            scopeMode={runScopeMode}
            selectedScope={selectedScope}
            startStage={runStartStage}
          />

          <CoursePipelineBlueprint
            extractedDocuments={extractedDocuments}
            inventory={inventory}
            onRerunExtraction={(engine) => void rerunExtracted(engine)}
            onSelectedScopeChange={setSelectedScope}
            onSelectRun={(runId) => void selectActiveRun(runId)}
            rerunningEngine={rerunningEngine}
            runs={runs}
            selectingRunId={selectingRunId}
            status={status}
            taskView={taskView}
            unavailable={{
              extractedDocuments: unavailable.extractedDocuments,
              inventory: unavailable.inventory,
              runs: unavailable.runs,
              taskView: unavailable.taskView,
            }}
          />
        </div>
      </div>
    </section>
  );
}

function PipelineRunControl({
  disabled,
  mode,
  onModeChange,
  onRun,
  onScopeModeChange,
  onStartStageChange,
  plan,
  scopeMode,
  selectedScope,
  startStage,
}: {
  disabled: boolean;
  mode: PipelineRunMode;
  onModeChange: (mode: PipelineRunMode) => void;
  onRun: () => void;
  onScopeModeChange: (mode: PipelineScopeMode) => void;
  onStartStageChange: (stage: PipelineStageId) => void;
  plan: PipelinePlanStep[];
  scopeMode: PipelineScopeMode;
  selectedScope: BlueprintRunScope | null;
  startStage: PipelineStageId;
}) {
  const effectiveScope = resolveRunScope({ mode: scopeMode, selectedScope });
  const running = plan.some((step) => step.state === "running");
  const completed = plan.filter((step) => step.state === "succeeded").length;
  const percent = plan.length === 0 ? 0 : Math.round((completed / plan.length) * 100);
  const selectedDisabled = !selectedScope;

  return (
    <section className="rounded-3xl bg-secondary/45 px-4 py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ModeButton active={mode === "from"} disabled={disabled} label="Ab Schritt" onClick={() => onModeChange("from")} />
            <ModeButton active={mode === "single"} disabled={disabled} label="Nur Schritt" onClick={() => onModeChange("single")} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PIPELINE_STAGES.map((stage) => (
              <ModeButton
                active={startStage === stage.id}
                disabled={disabled}
                key={stage.id}
                label={stage.label}
                onClick={() => onStartStageChange(stage.id)}
              />
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 xl:items-end">
          <div className="flex flex-wrap gap-2">
            <ModeButton active={scopeMode === "course"} disabled={disabled} label="Ganzer Kurs" onClick={() => onScopeModeChange("course")} />
            <ModeButton
              active={scopeMode === "selected"}
              disabled={disabled || selectedDisabled}
              label="Auswahl"
              onClick={() => onScopeModeChange("selected")}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="min-w-0 truncate text-sm text-muted-foreground">
              Scope: <span className="font-medium text-foreground">{effectiveScope.label}</span>
              {effectiveScope.resourceIds.length > 0 ? ` · ${effectiveScope.resourceIds.length} resource${effectiveScope.resourceIds.length === 1 ? "" : "s"}` : ""}
            </p>
            <Button className="w-fit rounded-full" disabled={disabled} onClick={onRun} type="button">
              {running ? <Spinner aria-hidden /> : <Play aria-hidden />}
              {mode === "single" ? "Schritt starten" : "Ab hier starten"}
            </Button>
          </div>
        </div>
      </div>

      {plan.length > 0 ? (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{running ? "Pipeline läuft" : percent === 100 ? "Pipeline fertig" : "Pipeline bereit"}</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {plan.map((step) => (
              <PipelinePlanStepTile key={step.id} step={step} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ModeButton({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
        active ? "bg-foreground text-background" : "bg-background/70 text-muted-foreground hover:text-foreground"
      } disabled:cursor-not-allowed disabled:opacity-45`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function PipelinePlanStepTile({ step }: { step: PipelinePlanStep }) {
  const Icon = step.state === "succeeded"
    ? CheckCircle2
    : step.state === "failed"
      ? XCircle
      : step.state === "running"
        ? Loader2
        : Circle;
  return (
    <div className="rounded-2xl bg-background/70 px-3 py-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon aria-hidden className={`size-4 ${step.state === "running" ? "animate-spin" : ""}`} />
        {step.label}
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{step.detail ?? stepStateLabel(step.state)}</p>
    </div>
  );
}

function StatusBadge({
  liveWork,
  loading,
  status,
}: {
  liveWork: boolean;
  loading: boolean;
  status?: string;
}) {
  if (loading || liveWork) {
    return (
      <Badge className="rounded-full">
        <Loader2 aria-hidden className="size-3.5 animate-spin" />
        {liveWork ? "Live" : "Loading"}
      </Badge>
    );
  }
  if (!status) return null;
  return <Badge className="rounded-full" variant="outline">{status}</Badge>;
}

function resolveRunScope({
  mode,
  selectedScope,
}: {
  mode: PipelineScopeMode;
  selectedScope: BlueprintRunScope | null;
}): BlueprintRunScope {
  if (mode === "selected" && selectedScope) return selectedScope;
  return { kind: "course", label: "Whole course", resourceIds: [] };
}

function stagesForPlan(mode: PipelineRunMode, startStage: PipelineStageId) {
  const startIndex = PIPELINE_STAGES.findIndex((stage) => stage.id === startStage);
  if (mode === "single") return PIPELINE_STAGES.filter((stage) => stage.id === startStage);
  return PIPELINE_STAGES.slice(Math.max(0, startIndex));
}

function stageRequestBody(stage: PipelineStageId, scope: BlueprintRunScope) {
  return {
    ...(stage === "extracted" ? { configHash: "config:extracted:pdftotext:default", engine: "pdftotext" } : {}),
    ...(scope.resourceIds.length > 0 ? { resourceIds: scope.resourceIds } : {}),
  };
}

function markPlanStep(plan: PipelinePlanStep[], stage: PipelineStageId, state: PipelineStepState): PipelinePlanStep[] {
  return plan.map((step) => step.stage === stage ? { ...step, detail: undefined, state } : step);
}

function markRunningPlanStepFailed(plan: PipelinePlanStep[], detail: string): PipelinePlanStep[] {
  let marked = false;
  return plan.map((step) => {
    if (!marked && step.state === "running") {
      marked = true;
      return { ...step, detail, state: "failed" };
    }
    return step;
  });
}

function stepStateLabel(state: PipelineStepState): string {
  switch (state) {
    case "failed":
      return "failed";
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "done";
  }
}

function makeClientRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}`;
}

async function studyPipelineRequest<T>(courseId: string, suffix: string): Promise<T> {
  const response = await fetch(
    `/api/study-pipeline/courses/${encodeURIComponent(courseId)}/study-pipeline${suffix}`,
    { cache: "no-store" },
  );
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Moodle study pipeline failed with ${response.status}.`);
  }
  return payload as T;
}

async function studyPipelinePost<T>(courseId: string, suffix: string, body: unknown): Promise<T> {
  const response = await fetch(
    `/api/study-pipeline/courses/${encodeURIComponent(courseId)}/study-pipeline${suffix}`,
    {
      body: JSON.stringify(body),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Moodle study pipeline failed with ${response.status}.`);
  }
  return payload as T;
}

async function loadTaskViewForInspector(courseId: string): Promise<TaskViewResponse> {
  const query = "includeScript=1";
  try {
    return await studyPipelineRequest<TaskViewResponse>(courseId, `/task-view?${query}`);
  } catch (pipelineError) {
    const bundleResponse = await fetch(`/api/study-bundles/courses/${encodeURIComponent(courseId)}/task-view?${query}`, {
      cache: "no-store",
    });
    if (bundleResponse.ok) {
      return await bundleResponse.json() as TaskViewResponse;
    }
    if (![400, 404].includes(bundleResponse.status)) {
      const payload = await bundleResponse.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error ?? formatStudyPipelineError(pipelineError));
    }
    throw pipelineError;
  }
}

function formatStudyPipelineError(error: unknown): string {
  return error instanceof Error ? error.message : "Moodle study pipeline failed.";
}
