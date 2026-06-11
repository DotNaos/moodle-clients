"use client";

import { useMemo, useState } from "react";

import { EmptyState, LoadingRows, MaterialGridCard, MaterialRow } from "@/components/dashboard-ui";
import { GroupedItemsView, GroupedSectionHeader, type GroupedItemsLayout } from "@/components/grouped-items-view";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { CheckCircle2, Circle, Filter, Layers, Globe } from "lucide-react";
import { FileIcon } from "@dotnaos/react-ui/web";
import type { Material } from "@/lib/dashboard-data";
import {
  filterMaterialsBySection,
  type MaterialTypeFilter,
} from "@/lib/material-filters";
import type { ScriptSectionOutline, StudyOutline, StudyTaskOutline } from "@/lib/study-outline";
import { cn } from "@/lib/utils";

export function MaterialsOutline({
  materials,
  materialsBySection,
  materialsLoading,
  selectedMaterialId,
  onSelectMaterial,
}: {
  materials: Material[];
  materialsBySection: [string, Material[]][];
  materialsLoading: boolean;
  selectedMaterialId: string | null;
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
          onSelect={() => onSelectMaterial(material)}
        />
      )}
      renderListItem={(material) => (
        <MaterialRow
          active={material.id === selectedMaterialId}
          material={material}
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
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group, index) => (
        <section className={cn("flex flex-col gap-2", index > 0 && "border-t border-border pt-4")} key={group.title}>
          <GroupedSectionHeader label={group.title} />
          {group.sheets.map((sheet) => (
            <div className="flex flex-col gap-1" key={sheet.title}>
              <h3 className="px-3 pt-2 text-sm font-semibold text-foreground">{sheet.title}</h3>
              {sheet.tasks.map((task) => {
                const done = isDoneTaskStatus(task.status);
                return (
                  <div className="flex min-h-11 items-center gap-1" key={task.id}>
                    <button
                      className={cn(
                        "min-h-11 flex-1 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        selectedTaskId === task.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
                      )}
                      onClick={() => onSelectTask(task.id)}
                      type="button"
                    >
                      <span className="line-clamp-2 font-medium">{task.title}</span>
                      <span
                        className={cn(
                          "mt-1 block truncate text-xs",
                          selectedTaskId === task.id ? "text-primary-foreground/70" : "text-muted-foreground",
                        )}
                      >
                        {taskStatusLabel(task.status)}
                      </span>
                    </button>
                    <button
                      aria-label={done ? `${task.title} als offen markieren` : `${task.title} als erledigt markieren`}
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-full transition-colors",
                        done ? "text-emerald-500 hover:bg-emerald-500/10" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                      onClick={() => onTaskStatusChange(task.id, done ? "open" : "done")}
                      type="button"
                    >
                      {done ? <CheckCircle2 className="size-5" aria-hidden /> : <Circle className="size-5" aria-hidden />}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      ))}
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
