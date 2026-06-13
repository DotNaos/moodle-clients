import type { Edge } from "@xyflow/react";

import type {
  BlueprintGraphNode,
  BlueprintNode,
  BlueprintNodeTone,
  BlueprintStepKind,
} from "@/components/course-pipeline-blueprint-model";

export type BlueprintTraceStep = {
  depth: number;
  id: string;
  status?: string;
  stepKind: BlueprintStepKind;
  subtitle: string;
  title: string;
  tone: BlueprintNodeTone;
};

export function buildUpstreamTrace({
  edges,
  nodes,
  selectedNodeId,
}: {
  edges: Edge[];
  nodes: BlueprintGraphNode[];
  selectedNodeId?: string;
}): BlueprintTraceStep[] {
  if (!selectedNodeId) return [];
  const nodeById = new Map(nodes.filter(isBlueprintNode).map((node) => [node.id, node]));
  const incomingByTarget = new Map<string, string[]>();
  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    const incoming = incomingByTarget.get(edge.target) ?? [];
    incoming.push(edge.source);
    incomingByTarget.set(edge.target, incoming);
  }

  const queue: Array<{ depth: number; id: string }> = [{ depth: 0, id: selectedNodeId }];
  const depthById = new Map<string, number>();
  for (const item of queue) {
    if (!nodeById.has(item.id)) continue;
    const knownDepth = depthById.get(item.id);
    if (knownDepth !== undefined && knownDepth <= item.depth) continue;
    depthById.set(item.id, item.depth);
    for (const source of incomingByTarget.get(item.id) ?? []) {
      queue.push({ depth: item.depth + 1, id: source });
    }
  }

  return Array.from(depthById.entries())
    .map(([id, depth]) => {
      const node = nodeById.get(id)!;
      return {
        depth,
        id,
        status: node.data.status,
        stepKind: node.data.stepKind,
        subtitle: node.data.subtitle,
        title: node.data.title,
        tone: node.data.tone,
        y: node.position.y,
      };
    })
    .sort((a, b) => a.depth - b.depth || a.y - b.y)
    .map(({ y: _y, ...step }) => step);
}

function isBlueprintNode(node: BlueprintGraphNode): node is BlueprintNode {
  return node.type === "blueprint";
}
