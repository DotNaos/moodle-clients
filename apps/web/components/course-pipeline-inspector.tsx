"use client";

import {
  AlertCircle,
  CheckCircle2,
  FileQuestion,
  FileText,
  GitBranch,
  Layers,
  Loader2,
  MessageSquareWarning,
  RotateCcw,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CoursePipelineBlueprint,
  type PipelineRunsResponse,
} from "@/components/course-pipeline-blueprint";
import { CoursePipelineRunComparison } from "@/components/course-pipeline-run-comparison";
import type { ExtractedDocumentsResponse } from "@/components/extracted-document-inspector";
import { Spinner } from "@/components/ui/spinner";
import {
  buildInventorySections,
  type CourseInventoryResponse,
  type StudyPipelineStatusResponse,
} from "@/components/study-pipeline-preview";
import type { TaskViewResponse } from "@/components/task-study-panel";
import type { Course, Material } from "@/lib/dashboard-data";
import { courseTitle } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

type InspectorTab = "resources" | "buckets" | "runs" | "compare" | "blueprint" | "review";

type CoursePipelineInspectorProps = {
  course: Course;
  courseId: string;
  materials: Material[];
  materialsLoading: boolean;
};

type PipelineFeedbackRecord = {
  id: string;
  courseId: string;
  targetId: string;
  targetKind: string;
  feedbackType: string;
  message: string;
  sourceRunId?: string;
  sourceArtifactId?: string;
  status: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

type PipelineProposalRecord = {
  id: string;
  courseId: string;
  targetId: string;
  targetKind: string;
  title: string;
  contentPreview: string;
  sourceRunId?: string;
  sourceArtifactId?: string;
  model?: string;
  status: string;
  createdBy?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type PipelineAuditRecord = {
  id: string;
  courseId: string;
  actorId?: string;
  action: string;
  targetKind: string;
  targetId: string;
  sourceRunId?: string;
  sourceArtifactId?: string;
  message?: string;
  createdAt: string;
};

type PipelineReviewResponse = {
  courseId: string;
  feedback: PipelineFeedbackRecord[];
  proposals: PipelineProposalRecord[];
  audit?: PipelineAuditRecord[];
};

type OptionalInspectorData = "extractedDocuments" | "inventory" | "review" | "runs" | "taskView";

const INSPECTOR_TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: "resources", label: "Resources" },
  { id: "buckets", label: "Buckets" },
  { id: "runs", label: "Runs" },
  { id: "compare", label: "Compare" },
  { id: "blueprint", label: "Blueprint" },
  { id: "review", label: "Review" },
];

export function CoursePipelineInspector({
  course,
  courseId,
  materials,
  materialsLoading,
}: CoursePipelineInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("resources");
  const [inventory, setInventory] = useState<CourseInventoryResponse | null>(null);
  const [status, setStatus] = useState<StudyPipelineStatusResponse | null>(null);
  const [runs, setRuns] = useState<PipelineRunsResponse | null>(null);
  const [review, setReview] = useState<PipelineReviewResponse | null>(null);
  const [extractedDocuments, setExtractedDocuments] = useState<ExtractedDocumentsResponse | null>(null);
  const [taskView, setTaskView] = useState<TaskViewResponse | null>(null);
  const [unavailable, setUnavailable] = useState<Partial<Record<OptionalInspectorData, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectingRunId, setSelectingRunId] = useState<string | null>(null);
  const [publishingRunId, setPublishingRunId] = useState<string | null>(null);
  const [rerunningEngine, setRerunningEngine] = useState<string | null>(null);
  const [submittingProposalId, setSubmittingProposalId] = useState<string | null>(null);
  const [moderatingId, setModeratingId] = useState<string | null>(null);

  const inventorySections = useMemo(() => buildInventorySections(inventory), [inventory]);
  useEffect(() => {
    void loadInspectorData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function loadInspectorData() {
    setLoading(true);
    setError(null);
    setUnavailable({});
    try {
      const [statusResult, inventoryResult, runsResult, reviewResult] = await Promise.allSettled([
        studyPipelineRequest<StudyPipelineStatusResponse>(courseId, ""),
        studyPipelineRequest<CourseInventoryResponse>(courseId, "/inventory"),
        studyPipelineRequest<PipelineRunsResponse>(courseId, "/runs"),
        studyPipelineRequest<PipelineReviewResponse>(courseId, "/review"),
      ]);
      const [extractedDocumentsResult, taskViewResult] = await Promise.allSettled([
        studyPipelineRequest<ExtractedDocumentsResponse>(courseId, "/extracted-documents"),
        loadTaskViewForInspector(courseId),
      ]);
      if (statusResult.status === "fulfilled") {
        setStatus(statusResult.value);
      }
      if (statusResult.status === "rejected") {
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
      if (reviewResult.status === "fulfilled") {
        setReview(reviewResult.value);
      } else {
        setReview(null);
        nextUnavailable.review = formatStudyPipelineError(reviewResult.reason);
      }
      if (extractedDocumentsResult.status === "fulfilled") {
        setExtractedDocuments(extractedDocumentsResult.value);
      } else {
        setExtractedDocuments(null);
        nextUnavailable.extractedDocuments = formatStudyPipelineError(extractedDocumentsResult.reason);
      }
      if (taskViewResult.status === "fulfilled") {
        setTaskView(taskViewResult.value);
      } else {
        setTaskView(null);
        nextUnavailable.taskView = formatStudyPipelineError(taskViewResult.reason);
      }
      setUnavailable(nextUnavailable);
    } catch (loadError) {
      setError(formatStudyPipelineError(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function selectActiveRun(runId: string) {
    setSelectingRunId(runId);
    setError(null);
    try {
      await studyPipelinePost(courseId, `/runs/${encodeURIComponent(runId)}/select`, {
        reason: "selected in course pipeline inspector",
      });
      const nextRuns = await studyPipelineRequest<PipelineRunsResponse>(courseId, "/runs");
      setRuns(nextRuns);
    } catch (selectError) {
      setError(formatStudyPipelineError(selectError));
    } finally {
      setSelectingRunId(null);
    }
  }

  async function publishRun(runId: string) {
    const actionId = `publish:${runId}`;
    setPublishingRunId(actionId);
    setError(null);
    try {
      await studyPipelinePost(courseId, `/runs/${encodeURIComponent(runId)}/publish`, {
        reason: "published in course pipeline inspector",
      });
      const [nextRuns, nextReview] = await Promise.all([
        studyPipelineRequest<PipelineRunsResponse>(courseId, "/runs"),
        studyPipelineRequest<PipelineReviewResponse>(courseId, "/review"),
      ]);
      setRuns(nextRuns);
      setReview(nextReview);
    } catch (publishError) {
      setError(formatStudyPipelineError(publishError));
    } finally {
      setPublishingRunId(null);
    }
  }

  async function unpublishRun(runId: string) {
    const actionId = `unpublish:${runId}`;
    setPublishingRunId(actionId);
    setError(null);
    try {
      await studyPipelinePost(courseId, `/runs/${encodeURIComponent(runId)}/unpublish`, {
        reason: "unpublished in course pipeline inspector",
      });
      const [nextRuns, nextReview] = await Promise.all([
        studyPipelineRequest<PipelineRunsResponse>(courseId, "/runs"),
        studyPipelineRequest<PipelineReviewResponse>(courseId, "/review"),
      ]);
      setRuns(nextRuns);
      setReview(nextReview);
    } catch (unpublishError) {
      setError(formatStudyPipelineError(unpublishError));
    } finally {
      setPublishingRunId(null);
    }
  }

  async function rerunExtracted(engine: string) {
    setRerunningEngine(engine);
    setError(null);
    try {
      const response = await studyPipelinePost<StudyPipelineStatusResponse>(courseId, "/extracted", {
        configHash: `config:extracted:${engine}:default`,
        engine,
      });
      setStatus(response);
      const nextRuns = await studyPipelineRequest<PipelineRunsResponse>(courseId, "/runs");
      setRuns(nextRuns);
    } catch (rerunError) {
      setError(formatStudyPipelineError(rerunError));
    } finally {
      setRerunningEngine(null);
    }
  }

  async function submitProposal(proposalId: string) {
    setSubmittingProposalId(proposalId);
    setError(null);
    try {
      await studyPipelinePost(courseId, `/proposals/${encodeURIComponent(proposalId)}/submit`, {});
      const nextReview = await studyPipelineRequest<PipelineReviewResponse>(courseId, "/review");
      setReview(nextReview);
    } catch (submitError) {
      setError(formatStudyPipelineError(submitError));
    } finally {
      setSubmittingProposalId(null);
    }
  }

  async function moderateFeedback(feedbackId: string, action: "resolve" | "dismiss") {
    const actionId = `feedback:${action}:${feedbackId}`;
    setModeratingId(actionId);
    setError(null);
    try {
      await studyPipelinePost(courseId, `/feedback/${encodeURIComponent(feedbackId)}/${action}`, {
        reason: action === "resolve" ? "resolved in course pipeline inspector" : "dismissed in course pipeline inspector",
      });
      const nextReview = await studyPipelineRequest<PipelineReviewResponse>(courseId, "/review");
      setReview(nextReview);
    } catch (moderationError) {
      setError(formatStudyPipelineError(moderationError));
    } finally {
      setModeratingId(null);
    }
  }

  async function moderateProposal(proposalId: string, action: "promote" | "dismiss") {
    const actionId = `proposal:${action}:${proposalId}`;
    setModeratingId(actionId);
    setError(null);
    try {
      await studyPipelinePost(courseId, `/proposals/${encodeURIComponent(proposalId)}/${action}`, {
        reason: action === "promote" ? "promoted in course pipeline inspector" : "dismissed in course pipeline inspector",
      });
      const nextReview = await studyPipelineRequest<PipelineReviewResponse>(courseId, "/review");
      setReview(nextReview);
    } catch (moderationError) {
      setError(formatStudyPipelineError(moderationError));
    } finally {
      setModeratingId(null);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background md:h-full">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 md:px-6 md:py-7">
          <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <GitBranch aria-hidden className="size-4" />
                Pipeline
              </p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{courseTitle(course)}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Course-level inspection surface for Moodle resources, classification, runs, blueprint, and review state.
              </p>
            </div>
            <Button disabled={loading} onClick={() => void loadInspectorData()} type="button" variant="secondary">
              {loading ? <Spinner aria-hidden /> : <RefreshCw aria-hidden />}
              Refresh
            </Button>
          </header>

          <div className="flex gap-1 overflow-x-auto rounded-full bg-secondary p-1">
            {INSPECTOR_TABS.map((tab) => (
              <button
                className={cn(
                  "h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-background hover:text-foreground",
                )}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-3xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {activeTab === "resources" ? (
            <ResourcesTab
              inventory={inventory}
              inventoryError={unavailable.inventory}
              loading={materialsLoading}
              materials={materials}
              status={status}
            />
          ) : activeTab === "buckets" ? (
            <BucketsTab inventoryError={unavailable.inventory} sections={inventorySections} />
          ) : activeTab === "runs" ? (
            <RunsTab
              loading={loading}
              onPublishRun={(runId) => void publishRun(runId)}
              onSelectRun={(runId) => void selectActiveRun(runId)}
              onUnpublishRun={(runId) => void unpublishRun(runId)}
              publishingRunId={publishingRunId}
              runs={runs}
              selectingRunId={selectingRunId}
              status={status}
              unavailableReason={unavailable.runs}
            />
          ) : activeTab === "compare" ? (
            <CoursePipelineRunComparison
              onRerun={(engine) => void rerunExtracted(engine)}
              onSelectRun={(runId) => void selectActiveRun(runId)}
              rerunningEngine={rerunningEngine}
              runs={runs}
              selectingRunId={selectingRunId}
            />
          ) : activeTab === "blueprint" ? (
            <CoursePipelineBlueprint
              extractedDocuments={extractedDocuments}
              inventory={inventory}
              runs={runs}
              status={status}
              taskView={taskView}
              unavailable={{
                extractedDocuments: unavailable.extractedDocuments,
                taskView: unavailable.taskView,
              }}
            />
          ) : (
            <ReviewTab
              inventory={inventory}
              moderatingId={moderatingId}
              onModerateFeedback={(feedbackId, action) => void moderateFeedback(feedbackId, action)}
              onModerateProposal={(proposalId, action) => void moderateProposal(proposalId, action)}
              onSubmitProposal={(proposalId) => void submitProposal(proposalId)}
              review={review}
              submittingProposalId={submittingProposalId}
              unavailableReason={unavailable.review}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function ResourcesTab({
  inventory,
  inventoryError,
  loading,
  materials,
  status,
}: {
  inventory: CourseInventoryResponse | null;
  inventoryError?: string;
  loading: boolean;
  materials: Material[];
  status: StudyPipelineStatusResponse | null;
}) {
  const nodes = [
    ...(inventory?.lectureMaterial ?? []),
    ...(inventory?.references ?? []),
    ...(inventory?.interactions ?? []),
    ...(inventory?.unknown ?? []),
    ...(inventory?.ignoredAllowed ?? []),
    ...(inventory?.taskGroups.flatMap((group) => [
      group.sheet,
      ...(group.solution ? [group.solution] : []),
      ...(group.solutionCandidates ?? []),
    ]) ?? []),
  ];
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
  const statusMaterialsById = new Map((status?.materials ?? []).map((item) => [item.id, item] as const));
  const displayMaterials: Material[] = materials.length > 0
    ? materials
    : (status?.materials ?? []).map((item) => ({
      fileType: item.fileType,
      id: item.id,
      name: item.name,
      sectionName: item.sectionName,
      type: item.type || item.resourceType,
    }));

  if (loading && displayMaterials.length === 0) {
    return <LoadingPanel label="Resources loading" />;
  }

  return (
    <div className="grid gap-2">
      {inventoryError ? (
        <p className="rounded-3xl bg-secondary/45 px-4 py-3 text-sm text-muted-foreground">
          Classification details are not available from the current Moodle services deployment.
        </p>
      ) : null}
      {displayMaterials.map((material) => {
        const node = nodesById.get(material.id);
        const statusMaterial = statusMaterialsById.get(material.id);
        const bucket = node?.bucket ?? statusMaterial?.type ?? "not classified";
        const confidence = node?.confidence ?? null;
        return (
          <div className="grid gap-3 rounded-3xl bg-secondary/45 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]" key={material.id}>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{material.name}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {material.sectionName || "No section"} · {material.type || material.fileType || "resource"}
              </p>
              {node?.reason ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{node.reason}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <Badge>{bucket}</Badge>
              {confidence ? <Badge variant="outline">{confidenceLabel(confidence)}</Badge> : null}
            </div>
          </div>
        );
      })}
      {displayMaterials.length === 0 ? (
        <EmptyInspectorState
          icon={FileText}
          title="No resources loaded"
          description="Open a course with Moodle materials to inspect the first pipeline source layer."
        />
      ) : null}
    </div>
  );
}

function BucketsTab({
  inventoryError,
  sections,
}: {
  inventoryError?: string;
  sections: ReturnType<typeof buildInventorySections>;
}) {
  if (inventoryError) {
    return (
      <EmptyInspectorState
        icon={Layers}
        title="Inventory unavailable"
        description="The current Moodle services deployment does not expose classification buckets yet."
      />
    );
  }
  if (sections.length === 0) {
    return (
      <EmptyInspectorState
        icon={Layers}
        title="No inventory buckets yet"
        description="Refresh after the course inventory endpoint has returned classification data."
      />
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {sections.map((section) => (
        <section className="rounded-3xl bg-secondary/45 px-4 py-4" key={section.id}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">{section.label}</h2>
            <Badge variant="outline">{section.items.length}</Badge>
          </div>
          <div className="mt-3 grid gap-2">
            {section.items.slice(0, 12).map((item) => (
              <div className="rounded-2xl bg-background/70 px-3 py-2" key={`${section.id}:${item.id}`}>
                <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {item.reason || `Classified as ${item.bucket}.`}
                </p>
              </div>
            ))}
            {section.items.length > 12 ? (
              <p className="px-1 text-xs text-muted-foreground">+{section.items.length - 12} more resources</p>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}

function RunsTab({
  loading,
  onPublishRun,
  onSelectRun,
  onUnpublishRun,
  publishingRunId,
  runs,
  selectingRunId,
  status,
  unavailableReason,
}: {
  loading: boolean;
  onPublishRun: (runId: string) => void;
  onSelectRun: (runId: string) => void;
  onUnpublishRun: (runId: string) => void;
  publishingRunId: string | null;
  runs: PipelineRunsResponse | null;
  selectingRunId: string | null;
  status: StudyPipelineStatusResponse | null;
  unavailableReason?: string;
}) {
  const activeRunIds = new Set((runs?.activeSelections ?? []).map((selection) => selection.activeRunId));
  if (loading && !runs && !status) {
    return <LoadingPanel label="Runs loading" />;
  }
  if (unavailableReason) {
    return (
      <EmptyInspectorState
        icon={RefreshCw}
        title="Run history unavailable"
        description="The current Moodle services deployment does not expose immutable run history yet."
      />
    );
  }
  if (!runs || runs.runs.length === 0) {
    return (
      <EmptyInspectorState
        icon={RefreshCw}
        title="No pipeline runs stored"
        description="Request tasks or run a pipeline stage to create the first immutable run record."
      />
    );
  }
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Current status" value={status?.status ?? "unknown"} />
        <Metric label="Current stage" value={status?.stage || "not started"} />
        <Metric label="Stored runs" value={String(runs.runs.length)} />
        <Metric label="Active selections" value={String(runs.activeSelections.length)} />
      </div>
      <div className="grid gap-2">
        {runs.runs.map((run) => {
          const active = activeRunIds.has(run.id);
          const publishActionId = active ? `unpublish:${run.id}` : `publish:${run.id}`;
          const publishing = publishingRunId === publishActionId;
          return (
            <div className="grid gap-3 rounded-3xl bg-secondary/45 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]" key={run.id}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{run.stage}</p>
                  <Badge variant={run.status === "failed" ? "destructive" : active ? "default" : "secondary"}>
                    {active ? "active" : run.status}
                  </Badge>
                  <Badge variant="outline">{run.ownership === "user_owned" ? "user-owned" : "shared"}</Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {run.engine} · {run.configHash} · {formatDateTime(run.createdAt)}
                </p>
                {run.fileHash ? <p className="mt-1 truncate text-xs text-muted-foreground">File hash: {run.fileHash}</p> : null}
                {run.error ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-destructive">{run.error}</p> : null}
                <p className="mt-2 truncate text-[11px] text-muted-foreground/80">{run.id}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {active ? (
                  <Button
                    disabled={publishing}
                    onClick={() => onUnpublishRun(run.id)}
                    type="button"
                    variant="destructive"
                  >
                    {publishing ? <Spinner aria-hidden /> : <RotateCcw aria-hidden />}
                    Unpublish
                  </Button>
                ) : (
                  <Button
                    disabled={publishing || run.status === "failed"}
                    onClick={() => onPublishRun(run.id)}
                    type="button"
                    variant="secondary"
                  >
                    {publishing ? <Spinner aria-hidden /> : <CheckCircle2 aria-hidden />}
                    Publish
                  </Button>
                )}
                <Button
                  disabled={active || selectingRunId === run.id}
                  onClick={() => onSelectRun(run.id)}
                  type="button"
                  variant="secondary"
                >
                  {selectingRunId === run.id ? <Spinner aria-hidden /> : <RotateCcw aria-hidden />}
                  {active ? "Aktiv" : "Als aktiv setzen"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewTab({
  inventory,
  moderatingId,
  onModerateFeedback,
  onModerateProposal,
  onSubmitProposal,
  review,
  submittingProposalId,
  unavailableReason,
}: {
  inventory: CourseInventoryResponse | null;
  moderatingId: string | null;
  onModerateFeedback: (feedbackId: string, action: "resolve" | "dismiss") => void;
  onModerateProposal: (proposalId: string, action: "promote" | "dismiss") => void;
  onSubmitProposal: (proposalId: string) => void;
  review: PipelineReviewResponse | null;
  submittingProposalId: string | null;
  unavailableReason?: string;
}) {
  const reviewItems = [
    ...(inventory?.taskGroups.filter((group) => group.pairingStatus !== "paired").map((group) => ({
      id: group.id,
      title: group.title,
      detail: group.pairingReason,
      state: group.pairingStatus === "missing_solution" ? "Missing solution" : "Ambiguous solution",
    })) ?? []),
    ...(inventory?.unknown.map((item) => ({
      id: item.id,
      title: item.name,
      detail: item.reason || "No confident inventory bucket matched.",
      state: "Unknown resource",
    })) ?? []),
  ];

  const feedback = review?.feedback ?? [];
  const proposals = review?.proposals ?? [];
  const audit = review?.audit ?? [];

  if (unavailableReason && reviewItems.length === 0) {
    return (
      <EmptyInspectorState
        icon={MessageSquareWarning}
        title="Review queue unavailable"
        description="The current Moodle services deployment does not expose feedback and proposal review yet."
      />
    );
  }

  if (reviewItems.length === 0 && feedback.length === 0 && proposals.length === 0 && audit.length === 0) {
    return (
      <EmptyInspectorState
        icon={CheckCircle2}
        title="No review items"
        description="Missing solutions, ambiguous pairs, unknown resources, user feedback, and submitted proposals will appear here."
      />
    );
  }

  return (
    <div className="grid gap-4">
      {feedback.length > 0 ? (
        <section className="grid gap-2">
          <ReviewSectionTitle icon={MessageSquareWarning} title="User feedback" />
          {feedback.map((item) => {
            const canModerate = item.status !== "resolved" && item.status !== "dismissed";
            const resolving = moderatingId === `feedback:resolve:${item.id}`;
            const dismissing = moderatingId === `feedback:dismiss:${item.id}`;
            return (
              <div className="grid gap-3 rounded-3xl bg-secondary/45 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]" key={item.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {feedbackTypeLabel(item.feedbackType)} · {item.targetKind} {item.targetId}
                  </p>
                  <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                    {item.message || "No extra note provided."}
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground/80">{formatDateTime(item.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Badge variant={item.status === "open" ? "destructive" : "secondary"}>{item.status}</Badge>
                  {canModerate ? (
                    <>
                      <Button
                        disabled={resolving || dismissing}
                        onClick={() => onModerateFeedback(item.id, "resolve")}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        {resolving ? <Spinner aria-hidden /> : <CheckCircle2 aria-hidden />}
                        Resolve
                      </Button>
                      <Button
                        disabled={resolving || dismissing}
                        onClick={() => onModerateFeedback(item.id, "dismiss")}
                        size="sm"
                        type="button"
                        variant="destructive"
                      >
                        {dismissing ? <Spinner aria-hidden /> : <AlertCircle aria-hidden />}
                        Dismiss
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {proposals.length > 0 ? (
        <section className="grid gap-2">
          <ReviewSectionTitle icon={Sparkles} title="Codex proposals" />
          {proposals.map((proposal) => {
            const submitting = submittingProposalId === proposal.id;
            const promoting = moderatingId === `proposal:promote:${proposal.id}`;
            const dismissing = moderatingId === `proposal:dismiss:${proposal.id}`;
            const canPromote = proposal.status === "submitted_for_review";
            const canDismiss = proposal.status !== "promoted" && proposal.status !== "dismissed";
            return (
              <div className="grid gap-3 rounded-3xl bg-secondary/45 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]" key={proposal.id}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{proposal.title}</p>
                  <Badge variant={proposal.status === "submitted_for_review" ? "default" : "secondary"}>
                    {proposal.status === "submitted_for_review" ? "submitted" : proposal.status}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {proposal.targetKind} {proposal.targetId}
                  {proposal.model ? ` · ${proposal.model}` : ""}
                  {" · "}
                  {formatDateTime(proposal.createdAt)}
                </p>
                {proposal.contentPreview ? (
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{proposal.contentPreview}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {proposal.status === "private" ? (
                  <Button
                    disabled={submitting || promoting || dismissing}
                    onClick={() => onSubmitProposal(proposal.id)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {submitting ? <Spinner aria-hidden /> : <Send aria-hidden />}
                    Zur Review
                  </Button>
                ) : null}
                {canPromote ? (
                  <Button
                    disabled={promoting || dismissing}
                    onClick={() => onModerateProposal(proposal.id, "promote")}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {promoting ? <Spinner aria-hidden /> : <CheckCircle2 aria-hidden />}
                    Promote
                  </Button>
                ) : null}
                {canDismiss ? (
                  <Button
                    disabled={submitting || promoting || dismissing}
                    onClick={() => onModerateProposal(proposal.id, "dismiss")}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    {dismissing ? <Spinner aria-hidden /> : <AlertCircle aria-hidden />}
                    Dismiss
                  </Button>
                ) : null}
              </div>
            </div>
            );
          })}
        </section>
      ) : null}

      {reviewItems.length > 0 ? (
        <section className="grid gap-2">
          <ReviewSectionTitle icon={FileQuestion} title="Pipeline review" />
          {reviewItems.map((item) => (
            <div className="rounded-3xl bg-secondary/45 px-4 py-3" key={item.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                </div>
                <Badge variant="destructive">{item.state}</Badge>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {audit.length > 0 ? (
        <section className="grid gap-2">
          <ReviewSectionTitle icon={GitBranch} title="Audit trail" />
          <div className="grid gap-2">
            {audit.slice(0, 20).map((event) => (
              <div className="grid gap-2 rounded-3xl bg-secondary/45 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]" key={event.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{auditActionLabel(event.action)}</p>
                    <Badge variant="outline">{event.targetKind}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {event.targetId}
                    {event.sourceRunId ? ` · run ${shortId(event.sourceRunId)}` : ""}
                    {event.sourceArtifactId ? ` · ${event.sourceArtifactId}` : ""}
                  </p>
                  {event.message ? (
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{event.message}</p>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground md:text-right">{formatDateTime(event.createdAt)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReviewSectionTitle({ icon: Icon, title }: { icon: typeof FileQuestion; title: string }) {
  return (
    <div className="flex items-center gap-2 px-1 text-sm font-semibold text-foreground">
      <Icon aria-hidden className="size-4 text-muted-foreground" />
      {title}
    </div>
  );
}

function feedbackTypeLabel(type: string): string {
  switch (type) {
    case "task_missing":
      return "Task missing";
    case "image_missing":
      return "Image missing";
    case "solution_wrong":
      return "Solution wrong";
    case "ocr_bad":
      return "OCR bad";
    case "task_confusing":
      return "Task confusing";
    default:
      return "Other";
  }
}

function auditActionLabel(action: string): string {
  switch (action) {
    case "run.published":
      return "Run published";
    case "run.unpublished":
      return "Run unpublished";
    case "proposal.promoted":
      return "Proposal promoted";
    case "proposal.dismissed":
      return "Proposal dismissed";
    case "feedback.resolved":
      return "Feedback resolved";
    case "feedback.dismissed":
      return "Feedback dismissed";
    default:
      return action || "Audit event";
  }
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-secondary/45 px-4 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-3xl bg-secondary/45 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-2">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        {label}
      </span>
    </div>
  );
}

function EmptyInspectorState({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof FileQuestion;
  title: string;
}) {
  return (
    <div className="grid min-h-72 place-items-center rounded-3xl bg-secondary/45 px-6 py-10 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-background text-muted-foreground">
          <Icon aria-hidden className="size-5" />
        </span>
        <p className="mt-4 font-semibold text-foreground">{title}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function confidenceLabel(confidence: string): string {
  if (confidence === "high") {
    return "high confidence";
  }
  if (confidence === "medium") {
    return "medium confidence";
  }
  if (confidence === "low") {
    return "low confidence";
  }
  return confidence || "unknown confidence";
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
  const bundleResponse = await fetch(`/api/study-bundles/courses/${encodeURIComponent(courseId)}/task-view?${query}`, {
    cache: "no-store",
  });
  if (bundleResponse.ok) {
    return await bundleResponse.json() as TaskViewResponse;
  }
  try {
    return await studyPipelineRequest<TaskViewResponse>(courseId, `/task-view?${query}`);
  } catch (pipelineError) {
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

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "unknown time";
  }
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
}
