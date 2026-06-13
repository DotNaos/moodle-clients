"use client";

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type NodeProps,
} from "@xyflow/react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Database,
  Eye,
  FileText,
  GitBranch,
  Layers,
  Play,
  RotateCw,
  Search,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildBlueprintGraph,
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

export { buildBlueprintGraph };
export type { PipelineRunRecord, PipelineRunsResponse };

type CoursePipelineBlueprintProps = {
  extractedDocuments: ExtractedDocumentsResponse | null;
  inventory: CourseInventoryResponse | null;
  runs: PipelineRunsResponse | null;
  status: StudyPipelineStatusResponse | null;
  taskView: TaskViewResponse | null;
  unavailable?: {
    extractedDocuments?: string;
    taskView?: string;
  };
};

const nodeTypes = {
  blueprint: BlueprintNodeCard,
  frame: BlueprintGroupFrame,
};

export function CoursePipelineBlueprint({
  extractedDocuments,
  inventory,
  runs,
  status,
  taskView,
  unavailable,
}: CoursePipelineBlueprintProps) {
  const graph = useMemo(
    () => buildBlueprintGraph({ extractedDocuments, inventory, runs, status, taskView, unavailable }),
    [extractedDocuments, inventory, runs, status, taskView, unavailable],
  );
  const selectableNodes = useMemo(() => graph.nodes.filter(isBlueprintNode), [graph.nodes]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(selectableNodes[0]?.id ?? null);
  const selectedNode = selectableNodes.find((node) => node.id === selectedNodeId) ?? selectableNodes[0];
  const interactiveNodes = useMemo(
    () => graph.nodes.map((node) => ({
      ...node,
      data: node.type === "blueprint" ? { ...node.data, onSelect: setSelectedNodeId } : node.data,
      selected: node.id === selectedNode?.id,
    })),
    [graph.nodes, selectedNode?.id],
  );

  return (
    <div className="grid min-h-[720px] gap-4 md:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="relative h-[640px] overflow-hidden rounded-3xl bg-secondary/45">
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap gap-2 rounded-full bg-background/90 px-3 py-2 shadow-sm shadow-black/10">
          <LegendPill kind="transform" label="1 -> 1 Transform" />
          <LegendPill kind="split" label="1 -> N Split" />
          <LegendPill kind="collect" label="N -> 1 Collect" />
        </div>
        <ReactFlow
          className="pipeline-blueprint-flow"
          colorMode="light"
          defaultViewport={{ x: 20, y: -280, zoom: 0.72 }}
          edges={graph.edges}
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

      <aside className="min-h-[640px] rounded-3xl bg-secondary/45 px-4 py-4">
        {selectedNode ? <NodeInspector node={selectedNode} /> : <p className="text-sm text-muted-foreground">Select a node to inspect its pipeline evidence.</p>}
      </aside>
    </div>
  );
}

function NodeInspector({ node }: { node: BlueprintNode }) {
  const data = node.data;
  const problems = data.problems ?? [];
  const actions = inspectorActions(data);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", stepKindBadgeClass(data.stepKind))}>
          {stepKindLabel(data.stepKind)}
        </span>
        <Badge variant={data.tone === "warning" ? "destructive" : "secondary"}>{data.tone}</Badge>
        {data.status ? <Badge variant={data.status === "failed" ? "destructive" : "outline"}>{data.status}</Badge> : null}
        {data.active ? <Badge>active</Badge> : null}
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

      <InspectorSection icon={Eye} title="Preview">
        <p className="max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl bg-background/70 px-3 py-3 text-sm leading-6 text-foreground">
          {data.outputPreview || "No direct output preview is stored for this node yet."}
        </p>
      </InspectorSection>

      <InspectorSection icon={AlertCircle} title="Problems" tone={problems.length > 0 ? "warning" : "default"}>
        {problems.length > 0 ? (
          <div className="grid gap-2">
            {problems.map((problem) => (
              <div className="rounded-2xl bg-background/80 px-3 py-2" key={`${problem.label}:${problem.detail}`}>
                <p className="text-xs font-medium text-destructive">{problem.label}</p>
                <p className="mt-1 text-xs leading-5 text-destructive/80">{problem.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-background/70 px-3 py-3 text-sm leading-6 text-muted-foreground">No problems recorded for this node.</p>
        )}
      </InspectorSection>

      <InspectorSection icon={ClipboardList} title="Config">
        <KeyValuePanel items={data.config ?? []} emptyText="No engine or model config is attached to this node." />
      </InspectorSection>

      <InspectorSection icon={Search} title="Evidence">
        <StringList items={data.evidence ?? []} emptyText="No extra evidence was recorded." />
      </InspectorSection>

      <InspectorSection icon={FileText} title="Artifacts">
        <StringList items={data.artifacts ?? []} emptyText="No artifacts are attached to this node." />
      </InspectorSection>

      <InspectorSection icon={Database} title="Metadata">
        <KeyValuePanel items={data.meta} emptyText="No metadata is attached to this node." />
      </InspectorSection>

      <InspectorSection icon={Play} title="Actions">
        <div className="grid gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button className="h-9 justify-start rounded-full" disabled key={action.label} type="button" variant="secondary">
                <Icon aria-hidden className="size-4" />
                {action.label}
              </Button>
            );
          })}
          <p className="text-xs leading-5 text-muted-foreground">
            Actions are shown here so the workflow is visible; backend execution buttons will be wired in a later goal.
          </p>
        </div>
      </InspectorSection>
    </div>
  );
}

function BlueprintNodeCard({ data, id, selected }: NodeProps<BlueprintNode>) {
  const Icon = nodeIcon(data.tone);
  return (
    <div
      className={cn(
        "relative h-[178px] w-[240px] overflow-hidden rounded-3xl bg-background px-4 py-3 shadow-lg shadow-black/10 transition-shadow",
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
      <span aria-hidden className={cn("absolute inset-x-6 top-0 h-1 rounded-b-full", stepKindStripeClass(data.stepKind))} />
      {HANDLE_POSITIONS.map((top, index) => (
        <Handle
          className="opacity-0"
          id={`in-${index}`}
          key={`in-${index}`}
          position={Position.Left}
          style={{ top: `${top}%` }}
          type="target"
        />
      ))}
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
        {data.active ? <Badge>active</Badge> : null}
        {data.status ? <Badge variant={data.status === "failed" ? "destructive" : "outline"}>{data.status}</Badge> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <span className="truncate rounded-full bg-secondary/60 px-2 py-1">in {data.inputs.length}</span>
        <span className="truncate rounded-full bg-secondary/60 px-2 py-1 text-right">out {data.outputs.length}</span>
      </div>
      {HANDLE_POSITIONS.map((top, index) => (
        <Handle
          className="opacity-0"
          id={`out-${index}`}
          key={`out-${index}`}
          position={Position.Right}
          style={{ top: `${top}%` }}
          type="source"
        />
      ))}
    </div>
  );
}

const HANDLE_POSITIONS = [16, 30, 44, 58, 72, 86] as const;

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

function KeyValuePanel({ emptyText, items }: { emptyText: string; items: Array<{ label: string; value: string }> }) {
  if (items.length === 0) {
    return <p className="rounded-2xl bg-background/70 px-3 py-3 text-sm leading-6 text-muted-foreground">{emptyText}</p>;
  }
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

function StringList({ emptyText, items }: { emptyText: string; items: string[] }) {
  if (items.length === 0) {
    return <p className="rounded-2xl bg-background/70 px-3 py-3 text-sm leading-6 text-muted-foreground">{emptyText}</p>;
  }
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

function inspectorActions(data: BlueprintNode["data"]) {
  if (data.title === "Extraction Variants") {
    return [
      { icon: RotateCw, label: "Run another extraction" },
      { icon: Search, label: "Compare variants" },
      { icon: CheckCircle2, label: "Set active result" },
    ];
  }
  if (data.title === "Codex Transform") {
    return [
      { icon: RotateCw, label: "Rerun Codex" },
      { icon: Search, label: "Compare draft" },
      { icon: CheckCircle2, label: "Validate output" },
    ];
  }
  if (data.tone === "output" || data.subtitle.includes("website")) {
    return [
      { icon: Eye, label: "Open rendered output" },
      { icon: CheckCircle2, label: "Validate output" },
    ];
  }
  return [
    { icon: Search, label: "Inspect source" },
    { icon: RotateCw, label: "Rerun step" },
  ];
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
