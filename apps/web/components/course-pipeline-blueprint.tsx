"use client";

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Database,
  Eye,
  FileText,
  GitCompareArrows,
  GitBranch,
  ImageOff,
  Layers,
  Maximize2,
  RotateCw,
  Search,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Spinner } from "@/components/ui/spinner";
import {
  buildBlueprintGraph,
  type BlueprintExtractionVariant,
  type BlueprintGraphNode,
  type BlueprintNode,
  type BlueprintNodeTone,
  type BlueprintPort,
  type PipelineRunRecord,
  type PipelineRunsResponse,
} from "@/components/course-pipeline-blueprint-model";
import type { ExtractedDocumentsResponse } from "@/components/extracted-document-inspector";
import type {
  CourseInventoryResponse,
  StudyPipelineStatusResponse,
} from "@/components/study-pipeline-preview";
import type { TaskViewResponse } from "@/components/task-study-panel";
import { cn } from "@/lib/utils";
import { preparePreviewMarkdown } from "@/components/course-pipeline-blueprint-preview";
import {
  LiveStatePanel,
  NodeLiveIndicator,
  PipelineStatusBadge,
  liveNodeClass,
} from "@/components/course-pipeline-live-ui";
import { buildUpstreamTrace, type BlueprintTraceStep } from "@/components/course-pipeline-trace";
import { SourceTracePanel } from "@/components/course-pipeline-trace-panel";
import { LossTracePanel } from "@/components/course-pipeline-loss-panel";
import { PipelineCableEdge } from "@/components/course-pipeline-blueprint-edge";

export { buildBlueprintGraph };
export type { PipelineRunRecord, PipelineRunsResponse };

type CoursePipelineBlueprintProps = {
  extractedDocuments: ExtractedDocumentsResponse | null;
  inventory: CourseInventoryResponse | null;
  runs: PipelineRunsResponse | null;
  status: StudyPipelineStatusResponse | null;
  taskView: TaskViewResponse | null;
  onRerunExtraction?: (engine: string) => void;
  onSelectRun?: (runId: string) => void;
  rerunningEngine?: string | null;
  selectingRunId?: string | null;
  unavailable?: {
    extractedDocuments?: string;
    inventory?: string;
    runs?: string;
    taskView?: string;
  };
};

const nodeTypes = {
  blueprint: BlueprintNodeCard,
  frame: BlueprintGroupFrame,
};

const edgeTypes = {
  pipeline: PipelineCableEdge,
};

export function CoursePipelineBlueprint({
  extractedDocuments,
  inventory,
  runs,
  status,
  taskView,
  onRerunExtraction,
  onSelectRun,
  rerunningEngine,
  selectingRunId,
  unavailable,
}: CoursePipelineBlueprintProps) {
  const [edgeStyle, setEdgeStyle] = useState<"rounded" | "square">("rounded");
  const graph = useMemo(
    () => buildBlueprintGraph({ extractedDocuments, inventory, runs, status, taskView, unavailable }),
    [extractedDocuments, inventory, runs, status, taskView, unavailable],
  );
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const visibleEdges = useMemo(
    () => graph.edges.map((edge) => {
      const stroke = edgeColor(edge, nodeById);
      return {
        ...edge,
        label: undefined,
        markerEnd: undefined,
        style: {
          ...edge.style,
          stroke,
          strokeLinecap: "round" as const,
          strokeWidth: edge.style?.strokeWidth ?? 2.5,
        },
        data: { ...edge.data, renderStyle: edgeStyle },
        type: "pipeline",
      };
    }),
    [edgeStyle, graph.edges, nodeById],
  );
  const selectableNodes = useMemo(() => graph.nodes.filter(isBlueprintNode), [graph.nodes]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(selectableNodes[0]?.id ?? null);
  const selectedNode = selectableNodes.find((node) => node.id === selectedNodeId) ?? selectableNodes[0];
  const selectedTrace = useMemo(
    () => buildUpstreamTrace({ edges: graph.edges, nodes: graph.nodes, selectedNodeId: selectedNode?.id }),
    [graph.edges, graph.nodes, selectedNode?.id],
  );
  const interactiveNodes = useMemo(
    () => graph.nodes.map((node) => ({
      ...node,
      data: node.type === "blueprint" ? { ...node.data, onSelect: setSelectedNodeId } : node.data,
      selected: node.id === selectedNode?.id,
    })),
    [graph.nodes, selectedNode?.id],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="relative h-[calc(100dvh-10.5rem)] min-h-[560px] overflow-hidden rounded-3xl bg-secondary/45">
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap gap-2 rounded-full bg-background/90 px-3 py-2 shadow-sm shadow-black/10">
          <LegendPill kind="transform" label="1 -> 1 Transform" />
          <LegendPill kind="split" label="1 -> N Split" />
          <LegendPill kind="collect" label="N -> 1 Collect" />
        </div>
        <div className="absolute right-4 top-4 z-10 flex rounded-full bg-background/90 p-1 shadow-sm shadow-black/10">
          <EdgeStyleButton active={edgeStyle === "rounded"} label="Rund" onClick={() => setEdgeStyle("rounded")} />
          <EdgeStyleButton active={edgeStyle === "square"} label="Eckig" onClick={() => setEdgeStyle("square")} />
        </div>
        <ReactFlow
          className="pipeline-blueprint-flow"
          colorMode="light"
          defaultViewport={{ x: 20, y: -280, zoom: 0.72 }}
          edges={visibleEdges}
          edgeTypes={edgeTypes}
          maxZoom={1.4}
          minZoom={0.2}
          nodeTypes={nodeTypes}
          nodes={interactiveNodes}
          nodesConnectable={false}
          nodesDraggable={false}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          panOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <Background className="pointer-events-none" color="#d4d4d4" gap={22} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <aside className="min-h-[560px] rounded-3xl bg-secondary/45 px-4 py-4 lg:h-[calc(100dvh-10.5rem)] lg:overflow-auto">
        {selectedNode ? (
          <NodeInspector
            node={selectedNode}
            onRerunExtraction={onRerunExtraction}
            onSelectRun={onSelectRun}
            onSelectTraceNode={setSelectedNodeId}
            rerunningEngine={rerunningEngine}
            selectingRunId={selectingRunId}
            trace={selectedTrace}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Select a node to inspect its pipeline evidence.</p>
        )}
      </aside>
    </div>
  );
}

function NodeInspector({
  node,
  onRerunExtraction,
  onSelectRun,
  onSelectTraceNode,
  rerunningEngine,
  selectingRunId,
  trace,
}: {
  node: BlueprintNode;
  onRerunExtraction?: (engine: string) => void;
  onSelectRun?: (runId: string) => void;
  onSelectTraceNode: (nodeId: string) => void;
  rerunningEngine?: string | null;
  selectingRunId?: string | null;
  trace: BlueprintTraceStep[];
}) {
  const data = node.data;
  const problems = data.problems ?? [];
  const lossProblems = problems.filter((problem) => problem.label.toLowerCase().includes("image"));
  const lossEvidence = (data.evidence ?? []).filter((item) => /image|asset/i.test(item));
  const extractionVariants = data.extractionVariants ?? [];
  const config = data.config ?? [];
  const evidence = data.evidence ?? [];
  const artifacts = data.artifacts ?? [];
  const metadata = data.meta ?? [];
  const showExtractionActions = data.title === "Extraction Variants" && onRerunExtraction;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", stepKindBadgeClass(data.stepKind))}>
          {stepKindLabel(data.stepKind)}
        </span>
        <Badge variant={data.tone === "warning" ? "destructive" : "secondary"}>{data.tone}</Badge>
        <PipelineStatusBadge active={data.active} live={data.live} status={data.status} />
      </div>

      <h2 className="mt-4 text-lg font-semibold tracking-tight">{data.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{data.subtitle}</p>
      <p className="mt-4 text-sm leading-6 text-foreground/80">{data.detail}</p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <MetricTile label="Inputs" value={String(data.inputs.length)} />
        <MetricTile label="Outputs" value={String(data.outputs.length)} />
        <MetricTile label="Problems" value={String(problems.length)} />
      </div>

      <InspectorSection icon={ArrowRight} title="Flow">
        <div className="grid gap-3">
          <PortPanel items={data.inputs} title="Input" />
          <PortPanel items={data.outputs} title="Output" />
        </div>
      </InspectorSection>

      <InspectorSection icon={GitBranch} title="Source trace">
        <SourceTracePanel onSelectNode={onSelectTraceNode} steps={trace} />
      </InspectorSection>

      {lossProblems.length > 0 ? (
        <InspectorSection icon={ImageOff} title="Loss trace" tone="warning">
          <LossTracePanel evidence={lossEvidence} problems={lossProblems} />
        </InspectorSection>
      ) : null}

      {data.live ? (
        <InspectorSection icon={Activity} title="Live state" tone={data.live.status === "failed" ? "warning" : "default"}>
          <LiveStatePanel live={data.live} />
        </InspectorSection>
      ) : null}

      <InspectorSection icon={Eye} title="Preview">
        <RenderedNodePreview node={node} />
      </InspectorSection>

      {extractionVariants.length > 0 ? (
        <InspectorSection icon={GitCompareArrows} title="Extraction variants">
          <ExtractionVariantPanel
            onSelectRun={onSelectRun}
            selectingRunId={selectingRunId}
            variants={extractionVariants}
          />
        </InspectorSection>
      ) : null}

      {problems.length > 0 ? (
        <InspectorSection icon={AlertCircle} title="Problems" tone="warning">
          <div className="grid gap-2">
            {problems.map((problem) => (
              <div className="rounded-2xl bg-background/80 px-3 py-2" key={`${problem.label}:${problem.detail}`}>
                <p className="text-xs font-medium text-destructive">{problem.label}</p>
                <p className="mt-1 text-xs leading-5 text-destructive/80">{problem.detail}</p>
              </div>
            ))}
          </div>
        </InspectorSection>
      ) : null}

      {showExtractionActions ? (
        <InspectorSection icon={RotateCw} title="Run extraction">
          <ExtractionActionButtons
            onRerunExtraction={onRerunExtraction}
            rerunningEngine={rerunningEngine}
            variants={extractionVariants}
          />
        </InspectorSection>
      ) : null}

      {evidence.length > 0 ? (
        <InspectorSection icon={Search} title="Evidence">
          <StringList items={evidence} />
        </InspectorSection>
      ) : null}

      {artifacts.length > 0 ? (
        <InspectorSection icon={FileText} title="Artifacts">
          <StringList items={artifacts} />
        </InspectorSection>
      ) : null}

      {config.length > 0 ? (
        <InspectorSection icon={ClipboardList} title="Config">
          <KeyValuePanel items={config} />
        </InspectorSection>
      ) : null}

      {metadata.length > 0 ? (
        <InspectorSection icon={Database} title="Metadata">
          <KeyValuePanel items={metadata} />
        </InspectorSection>
      ) : null}
    </div>
  );
}

function RenderedNodePreview({ node }: { node: BlueprintNode }) {
  const rawPreview = node.data.outputPreview ?? "";
  const { hiddenCount, markdown } = useMemo(() => preparePreviewMarkdown(rawPreview), [rawPreview]);
  if (!markdown.trim()) {
    return (
      <p className="rounded-2xl bg-background/70 px-3 py-3 text-sm leading-6 text-muted-foreground">
        No direct output preview is stored for this node yet.
      </p>
    );
  }
  return (
    <div className="max-h-[36rem] overflow-auto rounded-2xl bg-background/80 px-3 py-3">
      {hiddenCount > 0 ? (
        <p className="mb-3 rounded-2xl bg-secondary/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {hiddenCount} pipeline trace line{hiddenCount === 1 ? "" : "s"} hidden from this rendered preview.
        </p>
      ) : null}
      <MarkdownRenderer className="space-y-3 break-words text-sm leading-6 text-foreground" text={markdown} />
    </div>
  );
}

function ExtractionVariantPanel({
  onSelectRun,
  selectingRunId,
  variants,
}: {
  onSelectRun?: (runId: string) => void;
  selectingRunId?: string | null;
  variants: BlueprintExtractionVariant[];
}) {
  return (
    <div className="grid gap-2">
      {variants.map((variant) => {
        const selecting = selectingRunId === variant.runId;
        return (
          <div className="rounded-2xl bg-background/80 px-3 py-3" key={variant.engine}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{variant.engine}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{variant.configHash}</p>
              </div>
              <Badge variant={variantStatusBadge(variant.status)}>{variant.active ? "active" : variant.status}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MetricTile label="Chars" value={variant.chars === null ? "missing" : String(variant.chars)} />
              <MetricTile label="Artifacts" value={String(variant.artifactCount)} />
            </div>
            {variant.preview ? (
              <p className="mt-3 line-clamp-3 rounded-2xl bg-secondary/55 px-3 py-2 text-xs leading-5 text-foreground/80">
                {variant.preview}
              </p>
            ) : null}
            {variant.runId && onSelectRun ? (
              <Button
                className="mt-3 h-8 w-full justify-center rounded-full"
                disabled={variant.active || selecting}
                onClick={() => onSelectRun(variant.runId!)}
                type="button"
                variant={variant.active ? "secondary" : "default"}
              >
                {selecting ? <Spinner aria-hidden /> : <CheckCircle2 aria-hidden className="size-4" />}
                {variant.active ? "Active output" : "Use this output"}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ExtractionActionButtons({
  onRerunExtraction,
  rerunningEngine,
  variants,
}: {
  onRerunExtraction: (engine: string) => void;
  rerunningEngine?: string | null;
  variants: BlueprintExtractionVariant[];
}) {
  const engines = variants.length > 0 ? variants.map((variant) => variant.engine) : ["pdftotext", "docling", "marker"];
  return (
    <>
      {engines.map((engine) => {
        const running = rerunningEngine === engine;
        return (
          <Button
            className="h-9 justify-start rounded-full"
            disabled={Boolean(rerunningEngine)}
            key={engine}
            onClick={() => onRerunExtraction(engine)}
            type="button"
            variant="secondary"
          >
            {running ? <Spinner aria-hidden /> : <RotateCw aria-hidden className="size-4" />}
            Run {engine}
          </Button>
        );
      })}
      <p className="text-xs leading-5 text-muted-foreground">
        Runs create a new immutable extraction variant. Selecting a variant decides which output downstream steps use.
      </p>
    </>
  );
}

function BlueprintNodeCard({ data, id, selected }: NodeProps<BlueprintNode>) {
  const Icon = nodeIcon(data.tone);
  const preview = nodeBodyPreviewMarkdown(data.outputPreview);
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <div
      className={cn(
        "relative min-h-[286px] w-[320px] rounded-3xl bg-background shadow-lg shadow-black/10 transition-shadow",
        liveNodeClass(data.live),
        selected ? "outline outline-2 outline-primary/60" : "",
      )}
      onClick={(event) => {
        event.stopPropagation();
        data.onSelect?.(id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          data.onSelect?.(id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="relative z-10 h-full overflow-visible rounded-3xl px-4 py-3">
        <NodeLiveIndicator live={data.live} />
        <span aria-hidden className={cn("absolute inset-x-6 top-0 h-1 rounded-b-full", stepKindStripeClass(data.stepKind))} />
        <div className="flex items-start gap-3">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", nodeToneClass(data.tone))}>
            <Icon aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-5 text-foreground">{data.title}</p>
            <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted-foreground">{data.subtitle}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", stepKindBadgeClass(data.stepKind))}>
            {stepKindLabel(data.stepKind)}
          </span>
          <PipelineStatusBadge active={data.active} live={data.live} status={data.status} />
        </div>
        <ChannelRows inputs={data.inputs} outputs={data.outputs} />

        <div className="mt-3 rounded-2xl bg-secondary/45 px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">Output</span>
            <div className="flex items-center gap-1">
              {data.problems?.length ? (
                <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                  {data.problems.length}
                </span>
              ) : null}
              {preview ? (
                <button
                  aria-label="Open output preview"
                  className="grid size-6 place-items-center rounded-full bg-background/80 text-muted-foreground shadow-sm shadow-black/10 transition hover:text-foreground"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setPreviewOpen(true);
                  }}
                  type="button"
                >
                  <Maximize2 aria-hidden className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>
          {preview ? (
            <div
              className="max-h-[8.5rem] overflow-auto pr-1"
              onClick={(event) => event.stopPropagation()}
            >
              <MarkdownRenderer
                className="space-y-1 break-words text-[11px] leading-4 text-foreground/80 [&_.katex-display]:my-1 [&_code]:text-[10px] [&_h3]:!mt-0 [&_h3]:text-[12px] [&_h4]:!mt-0 [&_h4]:text-[11px] [&_ol]:ml-4 [&_pre]:rounded-xl [&_pre]:p-2 [&_pre]:text-[10px] [&_ul]:ml-4"
                text={preview}
              />
            </div>
          ) : (
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-[11px] leading-4 text-foreground/80">
              No preview stored yet.
            </p>
          )}
        </div>
        {data.hiddenItems?.length ? <HiddenItemsDisclosure items={data.hiddenItems} /> : null}
      </div>
      <NodePreviewDialog
        markdown={preview}
        onOpenChange={setPreviewOpen}
        open={previewOpen}
        title={data.title}
      />
    </div>
  );
}

function NodePreviewDialog({
  markdown,
  onOpenChange,
  open,
  title,
}: {
  markdown: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[88dvh] max-w-[min(96vw,980px)] flex-col gap-0 overflow-hidden rounded-[1.75rem] border-0 p-0 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader className="border-b border-border/50 px-5 py-4 pr-14">
          <DialogTitle className="truncate text-base">{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
          <MarkdownRenderer
            className="space-y-4 break-words text-sm leading-6 text-foreground [&_.katex-display]:overflow-auto [&_pre]:rounded-2xl [&_pre]:p-3"
            text={markdown}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HiddenItemsDisclosure({ items }: { items: string[] }) {
  return (
    <details
      className="mt-2 rounded-2xl bg-secondary/55 px-3 py-1.5 text-[11px] leading-4 text-foreground/80"
      onClick={(event) => event.stopPropagation()}
    >
      <summary className="cursor-pointer list-none truncate font-semibold text-foreground/75">
        {items.length} more task group{items.length === 1 ? "" : "s"}
      </summary>
      <div className="mt-1 grid max-h-14 gap-1 overflow-auto pr-1">
        {items.map((item) => (
          <label className="flex min-w-0 items-center gap-1.5" key={item}>
            <input className="size-3 accent-emerald-500" readOnly type="checkbox" />
            <span className="truncate">{item}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

const HANDLE_POSITIONS = [16, 30, 44, 58, 72, 86] as const;
const CHANNEL_SLOTS_BY_COUNT: Record<number, number[]> = {
  1: [2],
  2: [1, 4],
  3: [0, 2, 4],
  4: [0, 2, 3, 5],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
};

function ChannelRows({ inputs, outputs }: { inputs: BlueprintPort[]; outputs: BlueprintPort[] }) {
  const inputPorts = Array.from(portsBySlot(inputs).entries()).sort(([left], [right]) => left - right);
  const outputPorts = Array.from(portsBySlot(outputs).entries()).sort(([left], [right]) => left - right);
  const rowCount = Math.max(inputPorts.length, outputPorts.length);
  if (rowCount === 0) return null;

  return (
    <div className="-mx-4 mt-3 border-y border-foreground/[0.04] bg-secondary/20 py-1">
      {Array.from({ length: rowCount }, (_, rowIndex) => {
        const input = inputPorts[rowIndex];
        const output = outputPorts[rowIndex];
        return (
          <div
            className="relative grid min-h-6 grid-cols-2 items-center gap-3 px-6 text-[10px] font-semibold leading-4 text-foreground/70"
            key={`channel-row-${rowIndex}`}
          >
            {input ? <ChannelLabel direction="input" port={input[1]} slot={input[0]} /> : <span aria-hidden />}
            {output ? <ChannelLabel direction="output" port={output[1]} slot={output[0]} /> : <span aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}

function ChannelLabel({
  direction,
  port,
  slot,
}: {
  direction: "input" | "output";
  port: BlueprintPort;
  slot: number;
}) {
  return (
    <span
      className={cn(
        "relative min-w-0 truncate rounded-full px-2 py-0.5",
        direction === "output" ? "justify-self-end text-right" : "justify-self-start",
      )}
      title={[port.label, port.detail, port.state].filter(Boolean).join(" · ")}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 z-50 size-5 rounded-full border-4 border-background shadow-md shadow-black/25",
          portColorClass(port),
        )}
        style={direction === "input"
          ? { left: -16, transform: "translate(-50%, -50%)" }
          : { right: -16, transform: "translate(50%, -50%)" }}
      />
      <Handle
        className={cn(
          "pointer-events-auto !absolute !top-1/2 !z-40 !size-5 !rounded-full !border-0 !bg-transparent !opacity-0",
        )}
        id={`${direction === "input" ? "in" : "out"}-${slot}`}
        position={direction === "input" ? Position.Left : Position.Right}
        style={direction === "input"
          ? { left: -16, transform: "translate(-50%, -50%)" }
          : { right: -16, transform: "translate(50%, -50%)" }}
        type={direction === "input" ? "target" : "source"}
      />
      {port.label}
    </span>
  );
}

function portsBySlot(items: BlueprintPort[]): Map<number, BlueprintPort> {
  const slots = CHANNEL_SLOTS_BY_COUNT[Math.min(6, Math.max(1, items.length))] ?? CHANNEL_SLOTS_BY_COUNT[1];
  const map = new Map<number, BlueprintPort>();
  items.slice(0, 6).forEach((item, index) => {
    map.set(slots[index] ?? index, item);
  });
  return map;
}

function nodeBodyPreviewMarkdown(rawPreview: string | undefined): string {
  if (!rawPreview?.trim()) return "";
  const { markdown } = preparePreviewMarkdown(rawPreview);
  return markdown
    .split("\n")
    .filter((line) => !/^\s*(Source|Source task|Original Sources|Solution status|Solution page)\s*:/i.test(line))
    .join("\n")
    .replace(/<!--\s*source:[\s\S]*?-->/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 900);
}

function portColorClass(port: BlueprintPort): string {
  const value = `${port.label} ${port.detail ?? ""} ${port.state ?? ""}`.toLowerCase();
  if (/missing|failed|problem|review/.test(value)) return "!bg-destructive";
  if (/published|website|output|ready|task draft|task/.test(value)) return "!bg-emerald-500";
  if (/solution/.test(value)) return "!bg-rose-500";
  if (/extract|ocr|active extraction/.test(value)) return "!bg-blue-500";
  if (/script|section|block/.test(value)) return "!bg-violet-500";
  if (/page/.test(value)) return "!bg-sky-500";
  if (/pdf|file|resource|course/.test(value)) return "!bg-amber-500";
  return "!bg-muted-foreground";
}

function portColorHex(port: BlueprintPort | null | undefined): string {
  if (!port) return "#737373";
  const value = `${port.label} ${port.detail ?? ""} ${port.state ?? ""}`.toLowerCase();
  if (/missing|failed|problem|review/.test(value)) return "#dc2626";
  if (/published|website|output|ready|task draft|task/.test(value)) return "#10b981";
  if (/solution/.test(value)) return "#f43f5e";
  if (/extract|ocr|active extraction/.test(value)) return "#3b82f6";
  if (/script|section|block/.test(value)) return "#8b5cf6";
  if (/page/.test(value)) return "#0ea5e9";
  if (/pdf|file|resource|course/.test(value)) return "#f59e0b";
  return "#737373";
}

function edgeColor(edge: Pick<Edge, "label" | "source" | "sourceHandle">, nodeById: Map<string, BlueprintGraphNode>): string {
  const source = nodeById.get(edge.source);
  if (source?.type !== "blueprint") return "#737373";
  const semanticPort = source.data.outputs.find((port) => portMatchesEdgeLabel(port, edge.label));
  if (semanticPort) return portColorHex(semanticPort);
  const slot = Number(edge.sourceHandle?.replace("out-", ""));
  if (Number.isFinite(slot)) {
    return portColorHex(portForSlot(source.data.outputs, slot));
  }
  return portColorHex(source.data.outputs[0]);
}

function portForSlot(items: BlueprintPort[], slot: number): BlueprintPort | undefined {
  const slotPorts = portsBySlot(items);
  const exact = slotPorts.get(slot);
  if (exact) return exact;
  let nearest: { distance: number; port: BlueprintPort } | null = null;
  for (const [candidateSlot, port] of slotPorts.entries()) {
    const distance = Math.abs(candidateSlot - slot);
    if (!nearest || distance < nearest.distance) nearest = { distance, port };
  }
  return nearest?.port ?? items[0];
}

function portMatchesEdgeLabel(port: BlueprintPort, label: Edge["label"]): boolean {
  if (typeof label !== "string") return false;
  const edgeLabel = label.toLowerCase();
  const portLabel = port.label.toLowerCase();
  if (edgeLabel.includes("task") && portLabel.includes("task")) return true;
  if (edgeLabel.includes("script") && portLabel.includes("script")) return true;
  if (edgeLabel.includes("review") && portLabel.includes("review")) return true;
  if (edgeLabel.includes("sheet") && portLabel.includes("sheet")) return true;
  if (edgeLabel.includes("solution") && portLabel.includes("solution")) return true;
  if (edgeLabel.includes("pdf") && portLabel.includes("pdf")) return true;
  if (edgeLabel.includes("publish") && /output|task|script/.test(portLabel)) return true;
  return false;
}

function BlueprintGroupFrame({ data }: NodeProps<Extract<BlueprintGraphNode, { type: "frame" }>>) {
  const stage = data.frame?.variant === "stage";
  return (
    <div
      className={cn(
        "pointer-events-none border-0",
        stage
          ? "rounded-[24px] bg-background/40 ring-1 ring-foreground/[0.04]"
          : "rounded-[28px] bg-foreground/[0.035] shadow-inner",
      )}
      style={{ height: data.frame?.height ?? 240, width: data.frame?.width ?? 480 }}
    >
      <div className={cn("flex items-center justify-between", stage ? "px-4 py-4" : "px-5 py-3")}>
        <p className={cn("font-semibold", stage ? "text-[13px] text-foreground/55" : "text-sm text-foreground/70")}>
          {data.title}
        </p>
        <p className={cn("font-medium text-muted-foreground", stage ? "text-[11px]" : "text-xs")}>{data.subtitle}</p>
      </div>
    </div>
  );
}

function LegendPill({ kind, label }: { kind: "collect" | "split" | "transform"; label: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", stepKindBadgeClass(kind))}>
      {label}
    </span>
  );
}

function EdgeStyleButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function isBlueprintNode(node: BlueprintGraphNode): node is BlueprintNode {
  return node.type === "blueprint";
}

function InspectorSection({
  children,
  icon: Icon,
  title,
  tone = "default",
}: {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
  tone?: "default" | "warning";
}) {
  return (
    <section className={cn("mt-4 rounded-3xl px-3 py-3", tone === "warning" ? "bg-destructive/10" : "bg-background/50")}>
      <div className="mb-3 flex items-center gap-2">
        <span className={cn("grid size-7 place-items-center rounded-full", tone === "warning" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground")}>
          <Icon aria-hidden className="size-3.5" />
        </span>
        <h3 className={cn("text-sm font-semibold", tone === "warning" ? "text-destructive" : "text-foreground")}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-background/70 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}

function PortPanel({ items, title }: { items: BlueprintPort[]; title: string }) {
  return (
    <div className="rounded-2xl bg-background/70 px-3 py-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="grid gap-2">
        {items.map((item) => (
          <div className="rounded-2xl bg-secondary/60 px-3 py-2" key={`${title}:${item.label}:${item.detail ?? ""}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-xs font-medium text-foreground">{item.label}</p>
              {item.state ? <Badge variant={item.state === "missing" || item.state === "failed" ? "destructive" : "outline"}>{item.state}</Badge> : null}
            </div>
            {item.detail ? <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{item.detail}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function KeyValuePanel({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div className="rounded-2xl bg-background/70 px-3 py-2" key={`${item.label}:${item.value}`}>
          <p className="text-[11px] text-muted-foreground">{item.label}</p>
          <p className="mt-0.5 break-words text-xs font-medium text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function StringList({ items }: { items: string[] }) {
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <p className="break-words rounded-2xl bg-background/70 px-3 py-2 text-xs leading-5 text-foreground" key={item}>
          {item}
        </p>
      ))}
    </div>
  );
}

function variantStatusBadge(status: BlueprintExtractionVariant["status"]): "default" | "destructive" | "outline" | "secondary" {
  if (status === "active" || status === "ok") return "default";
  if (status === "failed") return "destructive";
  if (status === "missing") return "outline";
  return "secondary";
}

function nodeIcon(tone: BlueprintNodeTone) {
  if (tone === "source") return Database;
  if (tone === "process") return Layers;
  if (tone === "resource") return FileText;
  if (tone === "run") return Search;
  if (tone === "output") return CheckCircle2;
  if (tone === "warning") return AlertCircle;
  return GitBranch;
}

function nodeToneClass(tone: BlueprintNodeTone): string {
  if (tone === "warning") return "bg-destructive/10 text-destructive";
  if (tone === "run") return "bg-primary text-primary-foreground";
  if (tone === "output") return "bg-emerald-500/10 text-emerald-700";
  if (tone === "process") return "bg-sky-500/10 text-sky-700";
  if (tone === "resource") return "bg-amber-500/10 text-amber-700";
  return "bg-secondary text-muted-foreground";
}

function stepKindBadgeClass(kind: "collect" | "split" | "transform"): string {
  if (kind === "collect") return "bg-teal-500/10 text-teal-800";
  if (kind === "split") return "bg-amber-500/15 text-amber-800";
  return "bg-zinc-500/10 text-zinc-800";
}

function stepKindStripeClass(kind: "collect" | "split" | "transform"): string {
  if (kind === "collect") return "bg-teal-500/70";
  if (kind === "split") return "bg-amber-500/80";
  return "bg-zinc-500/55";
}

function stepKindLabel(kind: "collect" | "split" | "transform"): string {
  if (kind === "collect") return "N -> 1";
  if (kind === "split") return "1 -> N";
  return "1 -> 1";
}
