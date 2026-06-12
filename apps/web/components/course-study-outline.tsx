"use client";

import { useMemo, useState } from "react";

import { EmptyState, LoadingRows, MaterialGridCard, MaterialRow } from "@/components/dashboard-ui";
import { GroupedItemsView, type GroupedItemsLayout } from "@/components/grouped-items-view";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ArrowRight, CheckCircle2, ChevronRight, Circle, Filter, Layers, Globe } from "lucide-react";
import { FileIcon } from "@dotnaos/react-ui/web";
import type { Material } from "@/lib/dashboard-data";
import {
  filterMaterialsBySection,
  type MaterialTypeFilter,
} from "@/lib/material-filters";
import { taskDisplayTitle, type ScriptSectionOutline, type StudyOutline, type StudyTaskOutline } from "@/lib/study-outline";
import { cn } from "@/lib/utils";

export function MaterialsOutline({
  materials,
  materialsBySection,
  materialsLoading,
  selectedMaterialId,
  taskIdForMaterial,
  onOpenTask,
  onSelectMaterial,
}: {
  materials: Material[];
  materialsBySection: [string, Material[]][];
  materialsLoading: boolean;
  selectedMaterialId: string | null;
  taskIdForMaterial?: (material: Material) => string | null;
  onOpenTask?: (taskId: string) => void;
  onSelectMaterial: (material: Material) => void;
}) {
  const [layout, setLayout] = useState<GroupedItemsLayout>("list");
  const [typeFilter, setTypeFilter] = useState<MaterialTypeFilter>("all");

  const filteredSections = useMemo(
    () => filterMaterialsBySection(materialsBySection, typeFilter),
    [materialsBySection, typeFilter],
  );
  const filteredCount = useMemo(
    () => filteredSections.reduce((total, [, sectionMaterials]) => total + sectionMaterials.length, 0),
    [filteredSections],
  );

  if (materialsLoading) {
    return <LoadingRows label="Loading materials" />;
  }
  if (materials.length === 0) {
    return <EmptyState title="No materials loaded" description="Go back and choose another course, or refresh Moodle." />;
  }

  const taskOpenerForMaterial = (material: Material) => {
    const taskId = taskIdForMaterial?.(material);
    return taskId && onOpenTask ? () => onOpenTask(taskId) : undefined;
  };

  return (
    <GroupedItemsView
      header={
        <MaterialTypeFilterSelect
          filter={typeFilter}
          onFilterChange={setTypeFilter}
        />
      }
      layout={layout}
      sections={filteredSections.map(([section, sectionMaterials]) => ({
        key: section,
        label: section,
        items: sectionMaterials,
      }))}
      getItemKey={(material) => material.id}
      onLayoutChange={setLayout}
      renderGridItem={(material) => (
        <MaterialGridCard
          active={material.id === selectedMaterialId}
          material={material}
          onOpenTask={taskOpenerForMaterial(material)}
          onSelect={() => onSelectMaterial(material)}
        />
      )}
      renderListItem={(material) => (
        <MaterialRow
          active={material.id === selectedMaterialId}
          material={material}
          onOpenTask={taskOpenerForMaterial(material)}
          onSelect={() => onSelectMaterial(material)}
        />
      )}
      emptyState={
        filteredCount === 0 ? (
          <EmptyState
            title={typeFilter === "pdf" ? "Keine PDFs gefunden" : "Keine Seiten & Ressourcen gefunden"}
            description="Probiere einen anderen Typ-Filter oder wähle „Alle Typen“."
          />
        ) : null
      }
    />
  );
}

function MaterialTypeFilterSelect({
  filter,
  onFilterChange,
}: {
  filter: MaterialTypeFilter;
  onFilterChange: (filter: MaterialTypeFilter) => void;
}) {
  return (
    <Select value={filter} onValueChange={(value) => onFilterChange(value as MaterialTypeFilter)}>
      <SelectTrigger
        aria-label="Materialtyp filtern"
        className={cn(
          "flex !h-11 !w-11 !min-w-[44px] !max-w-[44px] shrink-0 items-center justify-center rounded-full border-0 !p-0 shadow-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [&>svg]:hidden [&>span:last-child]:hidden",
          filter !== "all" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-transparent text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
        )}
      >
        <span className="flex items-center justify-center">
          <Filter className="size-5 text-current" aria-hidden />
        </span>
      </SelectTrigger>
      <SelectContent
        className="rounded-3xl border-0 bg-card p-2 text-card-foreground shadow-xl"
        position="popper"
        sideOffset={6}
      >
        <SelectItem className="rounded-2xl px-3 py-2.5" value="all">
          <div className="flex items-center gap-2">
            <Layers className="size-4" />
            <span>Alle Ressourcen</span>
          </div>
        </SelectItem>
        <SelectItem className="rounded-2xl px-3 py-2.5" value="pdf">
          <div className="flex items-center gap-2">
            <FileIcon filename="example.pdf" size={16} />
            <span>PDFs</span>
          </div>
        </SelectItem>
        <SelectItem className="rounded-2xl px-3 py-2.5" value="pages">
          <div className="flex items-center gap-2">
            <Globe className="size-4" />
            <span>Seiten & Ressourcen</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

export function TaskOutline({
  onTaskStatusChange,
  selectedTaskId,
  tasks,
  onSelectTask,
}: {
  onTaskStatusChange: (taskId: string, status: "done" | "open") => void;
  selectedTaskId: string | null;
  tasks: StudyOutline["tasks"];
  onSelectTask: (taskId: string) => void;
}) {
  if (tasks.length === 0) {
    return <LoadingRows label="Loading tasks" />;
  }
  const groups = groupStudyTasksBySection(tasks);
  const orderedTasks = groups.flatMap((group) => group.sheets.flatMap((sheet) => sheet.tasks));
  const doneCount = orderedTasks.filter((task) => isDoneTaskStatus(task.status)).length;
  const progress = Math.round((doneCount / orderedTasks.length) * 100);
  const nextTask = orderedTasks.find((task) => !isDoneTaskStatus(task.status)) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-3xl bg-secondary/60 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-2xl font-semibold tracking-tight">
              {doneCount}
              <span className="text-muted-foreground">/{orderedTasks.length} erledigt</span>
            </p>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {nextTask
                ? `Als Nächstes: ${taskDisplayTitle(nextTask.sheetTitle, nextTask.title)}`
                : "Du hast alle Aufgaben abgeschlossen."}
            </p>
          </div>
          {nextTask ? (
            <button
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              onClick={() => onSelectTask(nextTask.id)}
              type="button"
            >
              {doneCount > 0 ? "Weiter üben" : "Jetzt starten"}
              <ArrowRight aria-hidden className="size-4" />
            </button>
          ) : (
            <span className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-emerald-500/15 px-5 py-2 text-sm font-semibold text-emerald-600">
              <CheckCircle2 aria-hidden className="size-4" />
              Alles erledigt
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2.5">
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{progress}%</span>
        </div>
      </header>

      {groups.map((group) => {
        const groupTasks = group.sheets.flatMap((sheet) => sheet.tasks);
        const groupDone = groupTasks.filter((task) => isDoneTaskStatus(task.status)).length;
        const groupProgress = Math.round((groupDone / groupTasks.length) * 100);
        const groupComplete = groupDone === groupTasks.length;
        return (
          <section className="flex flex-col gap-1.5" key={group.title}>
            <div className="flex items-center justify-between gap-3 px-1">
              <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{group.title}</h3>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                  groupComplete ? "bg-emerald-500/15 text-emerald-600" : "bg-secondary text-muted-foreground",
                )}
              >
                {groupDone}/{groupTasks.length}
              </span>
            </div>
            <div className="mx-1 h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width]"
                style={{ width: `${groupProgress}%` }}
              />
            </div>
            <div className="mt-1 flex flex-col gap-0.5 rounded-2xl bg-secondary/40 p-1.5">
              {groupTasks.map((task) => {
                const done = isDoneTaskStatus(task.status);
                const active = selectedTaskId === task.id;
                const statusPill = !done && task.status !== "open" ? taskStatusLabel(task.status) : null;
                const displayTitle = taskDisplayTitle(task.sheetTitle, task.title);
                return (
                  <div
                    className={cn(
                      "group flex items-center gap-0.5 rounded-xl pr-2 transition-colors",
                      active ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
                    )}
                    key={task.id}
                  >
                    <button
                      aria-label={done ? `${displayTitle} als offen markieren` : `${displayTitle} als erledigt markieren`}
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-full transition-colors",
                        done
                          ? "text-emerald-500 hover:bg-emerald-500/10"
                          : active
                            ? "text-primary-foreground/80 hover:bg-primary-foreground/15"
                            : "text-muted-foreground hover:bg-background hover:text-foreground",
                      )}
                      onClick={() => onTaskStatusChange(task.id, done ? "open" : "done")}
                      type="button"
                    >
                      {done ? <CheckCircle2 className="size-[18px]" aria-hidden /> : <Circle className="size-[18px]" aria-hidden />}
                    </button>
                    <button
                      className="flex min-h-10 min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                      onClick={() => onSelectTask(task.id)}
                      type="button"
                    >
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm font-medium",
                          done && !active && "text-muted-foreground line-through decoration-muted-foreground/40",
                        )}
                      >
                        {displayTitle}
                      </span>
                      {statusPill ? (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                            active ? "bg-primary-foreground/15 text-primary-foreground" : "bg-background text-muted-foreground",
                          )}
                        >
                          {statusPill}
                        </span>
                      ) : null}
                      <ChevronRight
                        aria-hidden
                        className={cn(
                          "size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
                          active ? "text-primary-foreground/80" : "text-muted-foreground",
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ScriptOutline({
  scriptSections,
  selectedScriptSectionId,
  onSelectScriptSection,
}: {
  scriptSections: StudyOutline["scriptSections"];
  selectedScriptSectionId: string | null;
  onSelectScriptSection: (sectionId: string) => void;
}) {
  if (scriptSections.length === 0) {
    return <LoadingRows label="Loading sections" />;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {scriptSections.map((section) => (
        <button
          className={cn(
            "min-h-11 rounded-lg py-2 pr-3 text-left text-sm transition-colors",
            section.level > 1 ? "pl-6" : "pl-3",
            selectedScriptSectionId === section.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
          )}
          key={`${section.id}-${section.blockIndex}`}
          onClick={() => onSelectScriptSection(section.id)}
          type="button"
        >
          <span className="line-clamp-2 font-medium">{section.title}</span>
        </button>
      ))}
    </div>
  );
}

export function groupStudyTasksBySheet(tasks: StudyOutline["tasks"]) {
  const groups: Array<{ sheetTitle: string; tasks: StudyOutline["tasks"] }> = [];
  const sortedTasks = [...tasks].sort(compareStudyTasks);
  for (const task of sortedTasks) {
    const groupTitle = task.sectionTitle?.trim() || task.sheetTitle;
    const lastGroup = groups.at(-1);
    if (lastGroup?.sheetTitle === groupTitle) {
      lastGroup.tasks.push(task);
    } else {
      groups.push({ sheetTitle: groupTitle, tasks: [task] });
    }
  }
  return groups;
}

export function groupStudyTasksBySection(tasks: StudyOutline["tasks"]) {
  const sections: Array<{ title: string; sheets: Array<{ title: string; tasks: StudyOutline["tasks"] }> }> = [];
  for (const task of [...tasks].sort(compareStudyTasks)) {
    const sectionTitle = task.sectionTitle?.trim() || "Aufgaben";
    let section = sections.find((item) => item.title === sectionTitle);
    if (!section) {
      section = { title: sectionTitle, sheets: [] };
      sections.push(section);
    }
    let sheet = section.sheets.find((item) => item.title === task.sheetTitle);
    if (!sheet) {
      sheet = { title: task.sheetTitle, tasks: [] };
      section.sheets.push(sheet);
    }
    sheet.tasks.push(task);
  }
  return sections;
}

export function isDoneTaskStatus(status: string): boolean {
  return status === "done" || status === "correct";
}

export function taskStatusLabel(status: string): string {
  if (status === "done") {
    return "erledigt";
  }
  if (status === "needs_review") {
    return "review";
  }
  return status.replace("_", " ");
}

function compareStudyTasks(left: StudyTaskOutline, right: StudyTaskOutline): number {
  const sheetCompare = compareNaturalStudyTitles(left.sheetTitle, right.sheetTitle);
  if (sheetCompare !== 0) {
    return sheetCompare;
  }
  const taskCompare = compareNaturalStudyTitles(left.title, right.title);
  if (taskCompare !== 0) {
    return taskCompare;
  }
  return compareNaturalStudyTitles(left.sectionTitle ?? "", right.sectionTitle ?? "");
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

export function groupScriptSections(scriptSections: ScriptSectionOutline[]) {
  const groups: Array<{ children: ScriptSectionOutline[]; parent: ScriptSectionOutline }> = [];
  for (const section of scriptSections) {
    if (!isNumberedScriptSection(section.title)) {
      continue;
    }
    if (isTopLevelScriptSection(section.title) || groups.length === 0) {
      groups.push({ children: [], parent: section });
      continue;
    }
    groups[groups.length - 1].children.push(section);
  }
  return groups;
}

function isNumberedScriptSection(title: string): boolean {
  return /^\d+(?:\.\d+)*\.?\s+/.test(title);
}

function isTopLevelScriptSection(title: string): boolean {
  return /^\d+\.\s+/.test(title);
}
