import { ArrowLeft, GitBranch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { BlueprintTraceStep } from "@/components/course-pipeline-trace";
import { cn } from "@/lib/utils";

export function SourceTracePanel({
  onSelectNode,
  steps,
}: {
  onSelectNode: (nodeId: string) => void;
  steps: BlueprintTraceStep[];
}) {
  if (steps.length <= 1) {
    return (
      <p className="rounded-2xl bg-background/70 px-3 py-3 text-sm leading-6 text-muted-foreground">
        No upstream source trace is available for this node yet.
      </p>
    );
  }
  const maxDepth = Math.max(...steps.map((step) => step.depth));
  return (
    <div className="grid gap-2">
      {steps.map((step) => (
        <button
          className={cn(
            "group grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl bg-background/80 px-3 py-2 text-left transition-colors hover:bg-background",
            step.depth === 0 ? "ring-1 ring-primary/20" : "",
          )}
          key={step.id}
          onClick={() => onSelectNode(step.id)}
          type="button"
        >
          <span className={cn("mt-0.5 grid size-8 place-items-center rounded-full", traceDotClass(step.tone))}>
            {step.depth === 0 ? <GitBranch aria-hidden className="size-3.5" /> : <ArrowLeft aria-hidden className="size-3.5" />}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-foreground">{step.title}</span>
              <Badge variant={step.status === "failed" ? "destructive" : "outline"}>{step.status ?? "unknown"}</Badge>
            </span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">{step.subtitle}</span>
            <span className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {step.depth === 0 ? "selected" : `${step.depth} step${step.depth === 1 ? "" : "s"} back`}
              </span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {traceKindLabel(step.stepKind)}
              </span>
              {step.depth === maxDepth ? (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  source
                </span>
              ) : null}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function traceDotClass(tone: BlueprintTraceStep["tone"]): string {
  if (tone === "warning") return "bg-destructive/10 text-destructive";
  if (tone === "output") return "bg-emerald-500/10 text-emerald-700";
  if (tone === "run") return "bg-primary/10 text-primary";
  if (tone === "resource") return "bg-amber-500/10 text-amber-700";
  return "bg-secondary text-muted-foreground";
}

function traceKindLabel(kind: BlueprintTraceStep["stepKind"]): string {
  if (kind === "collect") return "N -> 1";
  if (kind === "split") return "1 -> N";
  return "1 -> 1";
}
