"use client";

import { ChevronLeft, ChevronRight, Columns2, FileCheck2, FileText } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PDFDocumentViewerMode } from "@/components/pdf-document-viewer-mode";
import { ResizableSplitPanel } from "@/components/resizable-split-panel";
import { ComparePlaceholder, GenericSplitActions, PDFMaterialPicker } from "@/components/split-pdf-generic-tools";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Material } from "@/lib/dashboard-data";
import { shouldHandleAppLinkClick } from "@/lib/link-events";
import type { findTaskSheetSolutionPair } from "@/lib/material-pairs";
import { isPdfMaterial } from "@/lib/material-filters";
import { buildNavigatorURL, homeState, openDocument } from "@/lib/navigator";
import type { PDFScrollCommand, PDFViewState } from "@/lib/pdf-context";
import { cn } from "@/lib/utils";

const SPLIT_PANEL_CLOSE_THRESHOLD_PERCENT = 16;

type TaskSheetPair = NonNullable<ReturnType<typeof findTaskSheetSolutionPair>>;
type TaskSheetPairRole = "sheet" | "solution";
type SplitPaneLabels = {
  left: string;
  right: string;
  leftReveal: string;
  rightReveal: string;
  leftFloating: string;
  rightFloating: string;
};

export function SplitPDFPairViewer({
  courseId,
  material,
  materials = [],
  onOpenMaterial,
  onPDFStateChange,
  onSplitOpenChange,
  pair,
  pdfScrollCommand,
  splitOpen,
}: {
  courseId: string;
  material: Material;
  materials?: Material[];
  onOpenMaterial?: (material: Material) => void;
  onPDFStateChange: (state: PDFViewState | null) => void;
  onSplitOpenChange: (open: boolean) => void;
  pair: TaskSheetPair | null;
  pdfScrollCommand: PDFScrollCommand | null;
  splitOpen: boolean;
}) {
  const [comparisonMaterial, setComparisonMaterial] = useState<Material | null>(null);
  const leftMaterial = pair ? pair.sheet : material;
  const rightMaterial = pair ? pair.solution : comparisonMaterial;
  const selectedOnLeft = material.id === leftMaterial.id;
  const selectedOnRight = Boolean(rightMaterial && material.id === rightMaterial.id);
  const [edgeHoverRole, setEdgeHoverRole] = useState<TaskSheetPairRole | null>(null);
  const [previewRole, setPreviewRole] = useState<TaskSheetPairRole | null>(null);
  const pdfCandidates = useMemo(
    () => materials.filter((candidate) => candidate.id !== material.id && isPdfMaterial(candidate)),
    [material.id, materials],
  );
  const labels: SplitPaneLabels = pair
    ? {
      left: "Aufgabenblatt",
      right: "Lösung",
      leftReveal: "Aufgabenblatt einblenden",
      rightReveal: "Lösung einblenden",
      leftFloating: "Show assignment",
      rightFloating: "Show solution",
    }
    : {
      left: material.name,
      right: comparisonMaterial?.name ?? "Zweites PDF",
      leftReveal: "Aktuelles PDF einblenden",
      rightReveal: "Zweites PDF auswählen",
      leftFloating: "Aktuelles PDF",
      rightFloating: "PDF vergleichen",
    };

  useEffect(() => {
    if (!pair) {
      setComparisonMaterial(null);
      setEdgeHoverRole(null);
      setPreviewRole(null);
      onSplitOpenChange(false);
    }
  }, [material.id, onSplitOpenChange, pair]);

  useEffect(() => {
    if (splitOpen) {
      setEdgeHoverRole(null);
      setPreviewRole(null);
    }
  }, [splitOpen]);

  const closeSplitTo = useCallback((role: TaskSheetPairRole) => {
    const target = role === "sheet" ? leftMaterial : rightMaterial;
    setEdgeHoverRole(null);
    setPreviewRole(null);
    onSplitOpenChange(false);
    if (target && target.id !== material.id) {
      onOpenMaterial?.(target);
    }
  }, [leftMaterial, material.id, onOpenMaterial, onSplitOpenChange, rightMaterial]);

  const openSplit = useCallback(() => {
    setEdgeHoverRole(null);
    setPreviewRole(null);
    onSplitOpenChange(true);
  }, [onSplitOpenChange]);

  return (
    <ResizableSplitPanel
      className={cn(
        "relative h-full min-h-0 overflow-hidden bg-border",
        splitOpen ? "flex flex-col gap-px md:flex-row md:gap-0" : "bg-muted",
      )}
      closeThresholdPercent={SPLIT_PANEL_CLOSE_THRESHOLD_PERCENT}
      onCollapseToLeft={() => closeSplitTo("sheet")}
      onCollapseToRight={() => closeSplitTo("solution")}
      splitEnabled={splitOpen && Boolean(rightMaterial)}
    >
      {({ resizeHandle }) => (
        <>
          <div
            className={getSplitPanelClass({
              previewing: previewRole === "sheet",
              role: "sheet",
              selected: selectedOnLeft,
              splitOpen,
            })}
            onFocusCapture={() => {
              if (!splitOpen && !selectedOnLeft) {
                setPreviewRole("sheet");
              }
            }}
            onMouseEnter={() => {
              if (!splitOpen && !selectedOnLeft) {
                setPreviewRole("sheet");
              }
            }}
            onMouseLeave={() => {
              if (!splitOpen && !selectedOnLeft) {
                setPreviewRole(null);
              }
            }}
          >
            <PDFDocumentViewerMode
              allowFloat={!splitOpen && selectedOnLeft}
              courseId={courseId}
              externalUrl={leftMaterial.url}
              materialId={leftMaterial.id}
              onStateChange={selectedOnLeft ? onPDFStateChange : noopPDFStateChange}
              scrollCommand={selectedOnLeft ? pdfScrollCommand : null}
              title={leftMaterial.name}
              toolbarExtra={selectedOnLeft ? (
                pair ? (
                  <TaskSheetPairActions
                    courseId={courseId}
                    onOpenMaterial={onOpenMaterial}
                    onSplitOpenChange={onSplitOpenChange}
                    pair={pair}
                    splitOpen={splitOpen}
                  />
                ) : (
                  <GenericSplitActions
                    hasComparison={Boolean(comparisonMaterial)}
                    onRepick={() => {
                      setComparisonMaterial(null);
                      onSplitOpenChange(true);
                    }}
                    onSplitOpenChange={onSplitOpenChange}
                    splitOpen={splitOpen}
                  />
                )
              ) : null}
              url={pdfPreviewUrl(courseId, leftMaterial)}
            />
            {!splitOpen && selectedOnLeft ? (
              <SplitEdgeHoverZone
                label={labels.rightReveal}
                onHoverChange={(hovering) => setPreviewRole(hovering ? "solution" : null)}
                onOpen={openSplit}
                role="solution"
              />
            ) : null}
            {!splitOpen && !selectedOnLeft ? (
              <SplitEdgeRevealButton
                active={edgeHoverRole === "sheet"}
                floatingLabel={labels.leftFloating}
                onHoverChange={(hovering) => {
                  setEdgeHoverRole(hovering ? "sheet" : null);
                  setPreviewRole(hovering ? "sheet" : null);
                }}
                onOpen={openSplit}
                opensLabel={labels.leftReveal}
                role="sheet"
              />
            ) : null}
          </div>
          {resizeHandle}
          <div
            className={getSplitPanelClass({
              previewing: previewRole === "solution",
              role: "solution",
              selected: selectedOnRight,
              splitOpen,
            })}
            onFocusCapture={() => {
              if (!splitOpen && !selectedOnRight) {
                setPreviewRole("solution");
              }
            }}
            onMouseEnter={() => {
              if (!splitOpen && !selectedOnRight) {
                setPreviewRole("solution");
              }
            }}
            onMouseLeave={() => {
              if (!splitOpen && !selectedOnRight) {
                setPreviewRole(null);
              }
            }}
          >
            {rightMaterial ? (
              <PDFDocumentViewerMode
                allowFloat={!splitOpen && selectedOnRight}
                courseId={courseId}
                externalUrl={rightMaterial.url}
                materialId={rightMaterial.id}
                onStateChange={selectedOnRight ? onPDFStateChange : noopPDFStateChange}
                scrollCommand={selectedOnRight ? pdfScrollCommand : null}
                title={rightMaterial.name}
                toolbarExtra={selectedOnRight && pair ? (
                  <TaskSheetPairActions
                    courseId={courseId}
                    onOpenMaterial={onOpenMaterial}
                    onSplitOpenChange={onSplitOpenChange}
                    pair={pair}
                    splitOpen={splitOpen}
                  />
                ) : null}
                url={pdfPreviewUrl(courseId, rightMaterial)}
              />
            ) : splitOpen ? (
              <PDFMaterialPicker
                candidates={pdfCandidates}
                onCancel={() => onSplitOpenChange(false)}
                onSelect={(candidate) => {
                  setComparisonMaterial(candidate);
                  onSplitOpenChange(true);
                }}
              />
            ) : (
              <ComparePlaceholder onOpen={openSplit} />
            )}
            {!splitOpen && selectedOnRight ? (
              <SplitEdgeHoverZone
                label={labels.leftReveal}
                onHoverChange={(hovering) => setPreviewRole(hovering ? "sheet" : null)}
                onOpen={openSplit}
                role="sheet"
              />
            ) : null}
            {!splitOpen && !selectedOnRight ? (
              <SplitEdgeRevealButton
                active={edgeHoverRole === "solution"}
                floatingLabel={labels.rightFloating}
                onHoverChange={(hovering) => {
                  setEdgeHoverRole(hovering ? "solution" : null);
                  setPreviewRole(hovering ? "solution" : null);
                }}
                onOpen={openSplit}
                opensLabel={labels.rightReveal}
                role="solution"
              />
            ) : null}
          </div>
        </>
      )}
    </ResizableSplitPanel>
  );
}

function getSplitPanelClass({
  previewing,
  role,
  selected,
  splitOpen,
}: {
  previewing: boolean;
  role: TaskSheetPairRole;
  selected: boolean;
  splitOpen: boolean;
}) {
  if (splitOpen) {
    return cn(
      "relative min-h-[420px] min-w-0 bg-muted md:min-h-0 md:shrink-0 md:grow-0",
      role === "sheet" ? "md:basis-[var(--left-panel-width)]" : "md:basis-[var(--right-panel-width)]",
    );
  }

  if (selected) {
    return "relative h-full min-h-[420px] min-w-0 bg-muted md:absolute md:inset-0 md:z-10 md:min-h-0 md:w-full";
  }

  if (role === "sheet") {
    return cn(
      "group hidden min-w-0 bg-muted md:absolute md:inset-y-0 md:left-0 md:z-20 md:block md:h-full md:w-[min(42rem,56%)] md:min-w-[280px] md:shadow-2xl md:transition-transform md:duration-200 md:ease-out",
      previewing ? "md:-translate-x-[calc(100%-9rem)]" : "md:-translate-x-full",
    );
  }

  return cn(
    "group hidden min-w-0 bg-muted md:absolute md:inset-y-0 md:right-0 md:z-20 md:block md:h-full md:w-[min(42rem,56%)] md:min-w-[280px] md:shadow-2xl md:transition-transform md:duration-200 md:ease-out",
    previewing ? "md:translate-x-[calc(100%-9rem)]" : "md:translate-x-full",
  );
}

function SplitEdgeHoverZone({
  label,
  onHoverChange,
  onOpen,
  role,
}: {
  label: string;
  onHoverChange: (hovering: boolean) => void;
  onOpen: () => void;
  role: TaskSheetPairRole;
}) {
  return (
    <button
      aria-label={label}
      className={cn("absolute top-0 z-40 hidden h-full w-12 bg-transparent p-0 md:block", role === "sheet" ? "left-0" : "right-0")}
      onClick={onOpen}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onMouseMove={() => onHoverChange(true)}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onPointerMove={() => onHoverChange(true)}
      tabIndex={-1}
      type="button"
    />
  );
}

function SplitEdgeRevealButton({
  active,
  floatingLabel,
  onHoverChange,
  onOpen,
  opensLabel,
  role,
}: {
  active: boolean;
  floatingLabel: string;
  onHoverChange: (hovering: boolean) => void;
  onOpen: () => void;
  opensLabel: string;
  role: TaskSheetPairRole;
}) {
  const Icon = role === "sheet" ? ChevronRight : ChevronLeft;
  const edgeClass = role === "sheet" ? "right-0" : "left-0";
  const gradientClass = role === "sheet"
    ? "bg-gradient-to-l from-background/90 via-background/45 to-transparent"
    : "bg-gradient-to-r from-background/90 via-background/45 to-transparent";
  const labelClass = role === "sheet" ? "left-full ml-3" : "right-full mr-3";

  return (
    <div className={cn("absolute top-0 z-30 hidden h-full w-36 md:block", role === "sheet" ? "right-0" : "left-0")}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={opensLabel}
              className={cn(
                "group/edge pointer-events-auto absolute inset-y-0 flex w-36 items-center justify-center opacity-90 backdrop-blur-[1px] transition",
                "text-muted-foreground/75 hover:text-foreground focus-visible:text-foreground",
                "hover:bg-muted-foreground/10 hover:opacity-100 focus-visible:bg-muted-foreground/10 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                "group-hover:opacity-90",
                active && "opacity-100 text-foreground",
                edgeClass,
                gradientClass,
              )}
              onBlur={() => onHoverChange(false)}
              onFocus={() => onHoverChange(true)}
              onMouseEnter={() => onHoverChange(true)}
              onMouseLeave={() => onHoverChange(false)}
              onPointerEnter={() => onHoverChange(true)}
              onPointerLeave={() => onHoverChange(false)}
              onClick={onOpen}
              type="button"
            >
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full bg-background/80 shadow-lg ring-1 ring-border/60 transition group-hover:bg-background/90 group-hover:ring-border group-hover/edge:scale-110 group-hover/edge:bg-foreground group-hover/edge:text-background group-hover/edge:ring-foreground/20",
                  active && "scale-110 bg-foreground text-background ring-foreground/20",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <FloatingEdgeLabel active={active} className={labelClass}>{floatingLabel}</FloatingEdgeLabel>
            </button>
          </TooltipTrigger>
          <TooltipContent side={role === "sheet" ? "right" : "left"}>{opensLabel}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function FloatingEdgeLabel({
  active,
  children,
  className,
}: {
  active: boolean;
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground opacity-0 shadow-lg ring-1 ring-border/60 transition group-hover/edge:opacity-100 group-focus-visible/edge:opacity-100",
        active && "opacity-100",
        className,
      )}
    >
      {children}
    </span>
  );
}

function TaskSheetPairActions({
  courseId,
  onOpenMaterial,
  onSplitOpenChange,
  pair,
  splitOpen,
}: {
  courseId: string;
  onOpenMaterial?: (material: Material) => void;
  onSplitOpenChange: (open: boolean) => void;
  pair: TaskSheetPair;
  splitOpen: boolean;
}) {
  const counterpartLabel = pair.role === "sheet" ? "Lösung" : "Aufgabenblatt";
  const SwitchIcon = pair.role === "sheet" ? FileCheck2 : FileText;
  const splitTooltip = splitOpen
    ? "Split View schließen"
    : "Aufgabenblatt und Lösung nebeneinander öffnen";
  const counterpartHref = buildNavigatorURL(openDocument(homeState(), {
    kind: "material",
    courseId,
    materialId: pair.counterpart.id,
  }));

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild aria-label={`${counterpartLabel} öffnen`} size="sm" variant="ghost">
            <a
              href={counterpartHref}
              onClick={(event) => {
                if (!onOpenMaterial || !shouldHandleAppLinkClick(event)) {
                  return;
                }
                event.preventDefault();
                onOpenMaterial(pair.counterpart);
              }}
            >
              <SwitchIcon aria-hidden />
              <span className="hidden lg:inline">{counterpartLabel}</span>
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{counterpartLabel} öffnen</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={splitTooltip}
            aria-pressed={splitOpen}
            className={splitOpen ? "bg-secondary text-foreground" : undefined}
            onClick={() => onSplitOpenChange(!splitOpen)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <SplitViewIcon activeRole={pair.role} splitOpen={splitOpen} />
            <span className="hidden lg:inline">{splitOpen ? "Einzeln" : "Side by side"}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{splitTooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SplitViewIcon({ activeRole, splitOpen }: { activeRole: TaskSheetPairRole; splitOpen: boolean }) {
  const sheetVisible = splitOpen || activeRole === "sheet";
  const solutionVisible = splitOpen || activeRole === "solution";

  return (
    <span className="relative inline-grid size-4 place-items-center" aria-hidden>
      <span
        className={cn(
          "absolute inset-y-0.5 left-0.5 w-[42%] rounded-[3px] transition-colors",
          sheetVisible ? activeRole === "sheet" ? "bg-sky-500/70" : "bg-sky-500/25" : "bg-transparent",
        )}
      />
      <span
        className={cn(
          "absolute inset-y-0.5 right-0.5 w-[42%] rounded-[3px] transition-colors",
          solutionVisible ? activeRole === "solution" ? "bg-amber-500/70" : "bg-amber-500/25" : "bg-transparent",
        )}
      />
      <Columns2 className="relative size-4" aria-hidden />
    </span>
  );
}

function noopPDFStateChange() {
  // Secondary split-view PDFs should not replace the active chat/PDF context.
}

function pdfPreviewUrl(courseId: string, material: Material): string {
  return `/api/moodle/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(material.id)}/pdf`;
}
