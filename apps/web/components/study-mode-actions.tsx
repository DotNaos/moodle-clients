"use client";

import { BookOpenText, CheckCircle2, Files, Sigma, Video } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StudyMode = "materials" | "tasks" | "script" | "formula" | "recordings";

export function StudyModeActions({
  studyMode,
  onMaterials,
  onTasks,
  onScript,
  onFormula,
  onRecordings,
}: {
  studyMode: StudyMode;
  onMaterials: () => void;
  onTasks: () => void;
  onScript: () => void;
  onFormula?: () => void;
  onRecordings: () => void;
}) {
  return (
    <div className="-mx-1 flex w-full min-w-0 max-w-full gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
      <StudyModeButton
        active={studyMode === "materials"}
        icon={<Files aria-hidden />}
        label="Materialien"
        description="PDFs und Ressourcen"
        onClick={onMaterials}
      />
      <StudyModeButton
        active={studyMode === "tasks"}
        icon={<CheckCircle2 aria-hidden />}
        label="Alle Aufgaben"
        description="Aufgaben aus Blättern und Folien"
        onClick={onTasks}
      />
      <StudyModeButton
        active={studyMode === "script"}
        icon={<BookOpenText aria-hidden />}
        label="Script"
        description="KaTeX-fähiger Kurstext"
        onClick={onScript}
      />
      {onFormula ? (
        <StudyModeButton
          active={studyMode === "formula"}
          icon={<Sigma aria-hidden />}
          label="Formeln"
          description="Formelsammlung erstellen"
          onClick={onFormula}
        />
      ) : null}
      <StudyModeButton
        active={studyMode === "recordings"}
        icon={<Video aria-hidden />}
        label="Aufzeichnungen"
        description="Webex-Videos streamen"
        onClick={onRecordings}
      />
    </div>
  );
}

function StudyModeButton({
  active,
  icon,
  label,
  description,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex min-h-14 min-w-56 items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors lg:min-w-0",
        active ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground",
          active && "bg-primary-foreground/15 text-primary-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className={cn("block truncate text-xs", active ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {description}
        </span>
      </span>
    </button>
  );
}
