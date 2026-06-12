"use client";

import { AlertCircle, BookOpenText, CheckCircle2, ChevronDown, FileQuestion, FileText, Layers, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ExtractedDocumentInspector, type ExtractedDocumentsResponse } from "@/components/extracted-document-inspector";
import type { Course } from "@/lib/dashboard-data";
import { courseTitle } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export type StudyPipelineStage = "raw" | "extracted" | "curated";

export type StudyPipelineStatusResponse = {
  courseId: string;
  status: string;
  stage?: string;
  createdAt: string;
  summary: {
    totalResources: number;
    slides: number;
    scripts: number;
    tasks: number;
    solutions: number;
    other: number;
    linkedSolutions: number;
    missingSolutions: number;
  };
  materials: StudyPipelineMaterial[];
  taskLinks: StudyPipelineTaskLink[];
  missingSolutions: StudyPipelineMaterial[];
};

export type StudyPipelineMaterial = {
  id: string;
  name: string;
  type: string;
  resourceType?: string;
  fileType?: string;
  sectionId?: string;
  sectionName?: string;
};

type StudyPipelineTaskLink = {
  task: StudyPipelineMaterial;
  solution?: StudyPipelineMaterial;
  status: string;
};

export type CourseInventoryResponse = {
  courseId: string;
  generatedAt: string;
  artifactRoot?: string;
  summary: {
    totalResources: number;
    lectureMaterial: number;
    taskGroups: number;
    pairedTaskGroups: number;
    missingSolutionGroups: number;
    ambiguousTaskGroups: number;
    references: number;
    interactions: number;
    unknown: number;
  };
  lectureMaterial: CourseInventoryNode[];
  taskGroups: CourseInventoryTaskGroup[];
  references: CourseInventoryNode[];
  interactions: CourseInventoryNode[];
  unknown: CourseInventoryNode[];
};

export type CourseInventoryNode = {
  id: string;
  name: string;
  url?: string;
  type: string;
  resourceType?: string;
  fileType?: string;
  sectionId?: string;
  sectionName?: string;
  bucket: string;
  role: string;
  reason: string;
  confidence: string;
};

export type CourseInventoryTaskGroup = {
  id: string;
  title: string;
  sheet: CourseInventoryNode;
  solution?: CourseInventoryNode;
  solutionCandidates?: CourseInventoryNode[];
  pairingStatus: "paired" | "missing_solution" | "ambiguous_solution" | string;
  pairingReason: string;
  pairingConfidence: string;
};

type StudyPipelinePreviewProps = {
  course: Course;
  extractedDocuments: ExtractedDocumentsResponse | null;
  extractedError: string | null;
  extractedLoading: boolean;
  inventory: CourseInventoryResponse | null;
  inventoryError: string | null;
  inventoryLoading: boolean;
  loading: boolean;
  mode: "tasks" | "script";
  runningStage: StudyPipelineStage | null;
  status: StudyPipelineStatusResponse | null;
  onLoadExtractedDocuments: () => void;
  onRefreshInventory: () => void;
  onRunStage: (stage: StudyPipelineStage) => void;
};

export function StudyPipelinePreview({
  course,
  extractedDocuments,
  extractedError,
  extractedLoading,
  inventory,
  inventoryError,
  inventoryLoading,
  loading,
  mode,
  onLoadExtractedDocuments,
  onRefreshInventory,
  runningStage,
  status,
  onRunStage,
}: StudyPipelinePreviewProps) {
  const sections = useMemo(() => buildStudyPipelinePreviewSections(status), [status]);
  const groupedInventory = useMemo(() => buildInventorySections(inventory), [inventory]);
  const summary = status?.summary;
  const resourceCount = sections.reduce((total, section) => total + section.items.length, 0);
  const busy = loading || Boolean(runningStage);

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10 md:px-6 md:py-14">
        <header className="flex flex-col items-center text-center">
          <span className="grid size-14 place-items-center rounded-full bg-secondary text-muted-foreground">
            {mode === "script" ? (
              <BookOpenText aria-hidden className="size-6" />
            ) : (
              <CheckCircle2 aria-hidden className="size-6" />
            )}
          </span>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">
            {mode === "script" ? "Noch kein Script erstellt" : "Noch keine Aufgaben erstellt"}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {loading
              ? "Moodle-Ressourcen werden geprüft…"
              : mode === "script"
                ? `Aus den Materialien von ${courseTitle(course)} wird ein durchsuchbares Script mit Quellenverweisen erstellt.`
                : `Aus den Aufgabenblättern von ${courseTitle(course)} werden übbare Aufgaben mit Lösungs-Check erstellt.`}
          </p>
          <div className="mt-5">
            <StageButton
              disabled={busy}
              label={mode === "script" ? "Script erstellen" : "Aufgaben erstellen"}
              primary
              running={runningStage === "curated"}
              stage="curated"
              onRunStage={onRunStage}
            />
          </div>
          {runningStage ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner aria-hidden className="size-3.5" />
              Das kann ein paar Minuten dauern – die Ansicht aktualisiert sich danach automatisch.
            </p>
          ) : null}
        </header>

        {summary ? (
          <div className="flex flex-wrap justify-center gap-2">
            <StatChip label="Ressourcen" value={summary.totalResources} />
            <StatChip label="Aufgabenblätter" value={summary.tasks} />
            <StatChip label="Lösungen verknüpft" value={summary.linkedSolutions} />
          </div>
        ) : null}

        <section className="rounded-3xl bg-secondary/40 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FileQuestion aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                Kurs-Mapping
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Erste Zuordnung der Moodle-Ressourcen, bevor Extracted oder Codex daraus Aufgaben baut.
              </p>
            </div>
            <Button
              className="w-fit"
              disabled={busy || inventoryLoading}
              onClick={onRefreshInventory}
              type="button"
              variant="secondary"
            >
              {inventoryLoading ? <Spinner aria-hidden /> : <RefreshCw aria-hidden />}
              Aktualisieren
            </Button>
          </div>

          {inventoryLoading && !inventory ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner aria-hidden className="size-4" />
              Inventory wird geladen…
            </p>
          ) : null}

          {inventoryError ? (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{inventoryError}</span>
            </p>
          ) : null}

          {inventory ? (
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <StatChip label="Vorlesung" value={inventory.summary.lectureMaterial} />
                <StatChip label="Aufgabengruppen" value={inventory.summary.taskGroups} />
                <StatChip label="mit Lösung" value={inventory.summary.pairedTaskGroups} />
                <StatChip label="ohne Lösung" value={inventory.summary.missingSolutionGroups} />
                <StatChip label="unklar" value={inventory.summary.ambiguousTaskGroups + inventory.summary.unknown} />
              </div>

              <div className="flex flex-col gap-2">
                {inventory.taskGroups.slice(0, 10).map((group) => (
                  <TaskGroupRow group={group} key={group.id} />
                ))}
                {inventory.taskGroups.length > 10 ? (
                  <p className="px-1 text-xs text-muted-foreground">
                    +{inventory.taskGroups.length - 10} weitere Aufgabengruppen
                  </p>
                ) : null}
              </div>

              {groupedInventory.length > 0 ? (
                <details className="group rounded-2xl bg-background/60 px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    <Layers aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">Weitere Buckets</span>
                    <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    {groupedInventory.map((section) => (
                      <InventoryBucket key={section.id} section={section} />
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
        </section>

        <ExtractedDocumentInspector
          courseId={String(course.id)}
          documents={extractedDocuments}
          error={extractedError}
          loading={extractedLoading}
          onLoad={onLoadExtractedDocuments}
        />

        {sections.length > 0 ? (
          <details className="group rounded-3xl bg-secondary/40 px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
              <Layers aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">Gefundene Ressourcen ({resourceCount})</span>
              <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {sections.map((section) => (
                <div key={section.id}>
                  <p className="mb-1.5 line-clamp-1 text-xs font-medium text-muted-foreground">
                    {section.name} · {section.items.length}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {section.items.slice(0, 8).map((item) => (
                      <span
                        className={cn(
                          "inline-flex max-w-64 items-center gap-1 rounded-full px-2.5 py-1 text-xs",
                          item.kind === "task"
                            ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                            : item.kind === "solution"
                              ? "bg-sky-500/12 text-sky-700 dark:text-sky-300"
                              : "bg-background text-muted-foreground",
                        )}
                        key={item.id}
                      >
                        <FileText aria-hidden className="size-3 shrink-0" />
                        <span className="truncate">{item.name}</span>
                      </span>
                    ))}
                    {section.items.length > 8 ? (
                      <span className="rounded-full bg-background px-2.5 py-1 text-xs text-muted-foreground">
                        +{section.items.length - 8}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </details>
        ) : null}

        <details className="group rounded-3xl bg-secondary/40 px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
            <Sparkles aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">Erweiterte Schritte</span>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Die Erstellung läuft in Stufen. Normalerweise reicht der Button oben – hier kannst du einzelne Stufen
            gezielt neu ausführen.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StageButton
              disabled={busy}
              label="Rohdaten holen"
              running={runningStage === "raw"}
              stage="raw"
              onRunStage={onRunStage}
            />
            <StageButton
              disabled={busy}
              label="Texte extrahieren"
              running={runningStage === "extracted"}
              stage="extracted"
              onRunStage={onRunStage}
            />
          </div>
        </details>
      </div>
    </div>
  );
}

function TaskGroupRow({ group }: { group: CourseInventoryTaskGroup }) {
  const missing = group.pairingStatus === "missing_solution";
  const ambiguous = group.pairingStatus === "ambiguous_solution";
  return (
    <div className="rounded-2xl bg-background/70 px-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{group.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{group.sheet.name}</p>
        </div>
        <Badge variant={missing || ambiguous ? "destructive" : "secondary"}>
          {missing ? "Lösung fehlt" : ambiguous ? "Mehrdeutig" : "Lösung verknüpft"}
        </Badge>
      </div>
      {group.solution ? (
        <p className="mt-2 truncate text-xs text-muted-foreground">Lösung: {group.solution.name}</p>
      ) : null}
      {missing || ambiguous ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{group.pairingReason}</p>
      ) : null}
    </div>
  );
}

function InventoryBucket({ section }: { section: { id: string; label: string; items: CourseInventoryNode[] } }) {
  return (
    <div>
      <p className="mb-1.5 line-clamp-1 text-xs font-medium text-muted-foreground">
        {section.label} · {section.items.length}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {section.items.slice(0, 10).map((item) => (
          <span className="inline-flex max-w-64 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground" key={item.id}>
            <FileText aria-hidden className="size-3 shrink-0" />
            <span className="truncate">{item.name}</span>
          </span>
        ))}
        {section.items.length > 10 ? (
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
            +{section.items.length - 10}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1.5 text-xs">
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function StageButton({
  disabled = false,
  label,
  onRunStage,
  primary = false,
  running,
  stage,
}: {
  disabled?: boolean;
  label: string;
  onRunStage: (stage: StudyPipelineStage) => void;
  primary?: boolean;
  running: boolean;
  stage: StudyPipelineStage;
}) {
  return (
    <Button
      disabled={disabled || running}
      onClick={() => onRunStage(stage)}
      type="button"
      variant={primary ? "default" : "secondary"}
    >
      {running ? <Loader2 aria-hidden className="animate-spin" /> : <Sparkles aria-hidden />}
      {label}
    </Button>
  );
}

export function buildStudyPipelinePreviewSections(status: StudyPipelineStatusResponse | null) {
  const sections = new Map<string, { id: string; name: string; items: Array<{ id: string; kind: string; name: string }> }>();
  for (const material of status?.materials ?? []) {
    const id = material.sectionId || material.sectionName || "general";
    if (!sections.has(id)) {
      sections.set(id, { id, name: material.sectionName || "Allgemein", items: [] });
    }
    sections.get(id)?.items.push({
      id: material.id,
      kind: material.type,
      name: material.name,
    });
  }
  for (const link of status?.taskLinks ?? []) {
    markKind(sections, link.task.id, "task");
    if (link.solution?.id) {
      markKind(sections, link.solution.id, "solution");
    }
  }
  return [...sections.values()];
}

export function buildInventorySections(inventory: CourseInventoryResponse | null) {
  if (!inventory) {
    return [];
  }
  return [
    { id: "lecture", label: "Vorlesungsmaterial", items: inventory.lectureMaterial },
    { id: "references", label: "Referenzen", items: inventory.references },
    { id: "interactions", label: "Interaktionen", items: inventory.interactions },
    { id: "unknown", label: "Unbekannt", items: inventory.unknown },
  ].filter((section) => section.items.length > 0);
}

function markKind(
  sections: Map<string, { id: string; name: string; items: Array<{ id: string; kind: string; name: string }> }>,
  id: string,
  kind: string,
) {
  for (const section of sections.values()) {
    const item = section.items.find((candidate) => candidate.id === id);
    if (item) {
      item.kind = kind;
      return;
    }
  }
}
