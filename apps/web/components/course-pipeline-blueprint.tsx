"use client";

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type NodeProps,
} from "@xyflow/react";
import { AlertCircle, CheckCircle2, Database, FileText, GitBranch, Layers, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  buildBlueprintGraph,
  type BlueprintGraphNode,
  type BlueprintNode,
  type BlueprintNodeTone,
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
    <div className="grid min-h-[640px] gap-4 md:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="h-[560px] overflow-hidden rounded-3xl bg-secondary/45">
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

      <aside className="min-h-[560px] rounded-3xl bg-secondary/45 px-4 py-4">
        {selectedNode ? (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={selectedNode.data.tone === "warning" ? "destructive" : "secondary"}>
                {selectedNode.data.tone}
              </Badge>
              {selectedNode.data.status ? <Badge variant="outline">{selectedNode.data.status}</Badge> : null}
              {selectedNode.data.active ? <Badge>active</Badge> : null}
            </div>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">{selectedNode.data.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{selectedNode.data.subtitle}</p>
            <p className="mt-4 text-sm leading-6 text-foreground/80">{selectedNode.data.detail}</p>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <MetricTile label="Step" value={stepKindLabel(selectedNode.data.stepKind)} />
              <MetricTile label="Inputs" value={String(selectedNode.data.inputs.length)} />
              <MetricTile label="Outputs" value={String(selectedNode.data.outputs.length)} />
            </div>

            <div className="mt-3 grid gap-3">
              <PortPanel items={selectedNode.data.inputs} title="Input" />
              <PortPanel items={selectedNode.data.outputs} title="Output" />
            </div>

            {selectedNode.data.problems?.length ? (
              <div className="mt-3 rounded-2xl bg-destructive/10 px-3 py-3">
                <p className="mb-2 text-xs font-medium text-destructive">Problems</p>
                <div className="grid gap-2">
                  {selectedNode.data.problems.map((problem) => (
                    <div className="rounded-2xl bg-background/70 px-3 py-2" key={`${problem.label}:${problem.detail}`}>
                      <p className="text-xs font-medium text-destructive">{problem.label}</p>
                      <p className="mt-1 text-xs leading-5 text-destructive/80">{problem.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 rounded-2xl bg-background/70 px-3 py-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Rendered / Stored Preview</p>
              <p className="max-h-48 overflow-auto whitespace-pre-wrap text-sm leading-6 text-foreground">
                {selectedNode.data.outputPreview || "No direct output preview is stored for this node yet."}
              </p>
            </div>

            {selectedNode.data.config?.length ? (
              <div className="mt-3 rounded-2xl bg-background/70 px-3 py-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Config</p>
                <div className="grid gap-2">
                  {selectedNode.data.config.map((item) => (
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-xs" key={`${selectedNode.id}:config:${item.label}`}>
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="break-words font-medium text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-3 rounded-2xl bg-background/70 px-3 py-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Evidence</p>
              {selectedNode.data.evidence?.length ? (
                <div className="grid gap-2">
                  {selectedNode.data.evidence.map((item) => (
                    <p className="rounded-2xl bg-secondary/60 px-3 py-2 text-xs leading-5 text-foreground" key={item}>
                      {item}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">No extra evidence was recorded.</p>
              )}
            </div>

            <div className="mt-3 rounded-2xl bg-background/70 px-3 py-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Artifacts</p>
              {selectedNode.data.artifacts?.length ? (
                <div className="grid gap-2">
                  {selectedNode.data.artifacts.map((artifact) => (
                    <p className="break-words rounded-2xl bg-secondary/60 px-3 py-2 text-xs leading-5 text-foreground" key={artifact}>
                      {artifact}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">No artifacts are attached to this node.</p>
              )}
            </div>

            <div className="mt-5 grid gap-2">
              {selectedNode.data.meta.map((item) => (
                <div className="rounded-2xl bg-background/70 px-3 py-2" key={`${selectedNode.id}:${item.label}`}>
                  <p className="text-[11px] text-muted-foreground">{item.label}</p>
                  <p className="mt-0.5 break-words text-xs font-medium text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a node to inspect its pipeline evidence.</p>
        )}
      </aside>
    </div>
  );
}

function BlueprintNodeCard({ data, id, selected }: NodeProps<BlueprintNode>) {
  const Icon = nodeIcon(data.tone);
  return (
    <div
      className={cn(
        "h-[178px] w-[240px] overflow-hidden rounded-3xl bg-background px-4 py-3 shadow-lg shadow-black/10 transition-shadow",
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
        <Badge variant="secondary">{stepKindLabel(data.stepKind)}</Badge>
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
  return (
    <div
      className="pointer-events-none rounded-[28px] border-0 bg-foreground/[0.035] shadow-inner"
      style={{ height: data.frame?.height ?? 240, width: data.frame?.width ?? 480 }}
    >
      <div className="flex items-center justify-between px-5 py-3">
        <p className="text-sm font-semibold text-foreground/70">{data.title}</p>
        <p className="text-xs font-medium text-muted-foreground">{data.subtitle}</p>
      </div>
    </div>
  );
}

function isBlueprintNode(node: BlueprintGraphNode): node is BlueprintNode {
  return node.type === "blueprint";
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-background/70 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}

function PortPanel({ items, title }: { items: Array<{ label: string; detail?: string; state?: string }>; title: string }) {
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

function stepKindLabel(kind: "collect" | "split" | "transform"): string {
  if (kind === "collect") return "N -> 1";
  if (kind === "split") return "1 -> N";
  return "1 -> 1";
}
