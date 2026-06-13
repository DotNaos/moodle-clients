"use client";

import { CheckCircle2, ChevronRight, Circle, FileText, Video } from "lucide-react";
import type { ComponentType, MouseEvent, PointerEvent } from "react";

import { groupStudyTasksBySection, isDoneTaskStatus, taskStatusLabel } from "@/components/course-study-outline";
import { CourseSidebarRow } from "@/components/dashboard-ui";
import { CalendarEventsPanel, ChatSessionsPanel, COURSE_MODE_ITEMS } from "@/components/navigator-panels";
import type { CalendarEventSummary } from "@/hooks/use-calendar-events";
import type { Course, Material, WebexRecordingState } from "@/lib/dashboard-data";
import { HOME_NAV_ITEMS } from "@/lib/home-navigation";
import {
  navigatorBreadcrumbs,
  type NavigatorDocument,
  type NavigatorLabelResolvers,
  type NavigatorPath,
  type NavigatorState,
} from "@/lib/navigator";
import { taskDisplayTitle, type StudyOutline } from "@/lib/study-outline";
import { cn } from "@/lib/utils";

type CourseListGroup = {
  courses: Course[];
  key: string;
  label: string;
};

// The unified drilldown rendered as the sidebar while a document is open.
// It is the same navigator as the full-width panels, in compact form; drilling
// here never touches the open document.
export function NavigatorSidebar({
  activeDocument,
  calendarError,
  calendarEvents,
  calendarLoading,
  courseListGroups,
  coursesLoading,
  labelResolvers,
  materialsBySection,
  materialsLoading,
  onDrill,
  onOpenDocument,
  onOpenMaterialTask,
  onResizeBy,
  onResizeStart,
  onTaskStatusChange,
  path,
  recordingsState,
  studyOutline,
}: {
  activeDocument: NavigatorDocument | null;
  calendarError: string | null;
  calendarEvents: CalendarEventSummary[];
  calendarLoading: boolean;
  courseListGroups: CourseListGroup[];
  coursesLoading: boolean;
  labelResolvers: NavigatorLabelResolvers;
  materialsBySection: [string, Material[]][];
  materialsLoading: boolean;
  onDrill: (path: NavigatorPath) => void;
  onOpenDocument: (document: NavigatorDocument) => void;
  onOpenMaterialTask: (material: Material) => void;
  onResizeBy: (delta: number) => void;
  onResizeStart: (event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) => void;
  onTaskStatusChange: (taskId: string, status: "done" | "open") => void;
  path: NavigatorPath;
  recordingsState: WebexRecordingState | undefined;
  studyOutline: StudyOutline;
}) {
  const browseState: NavigatorState = { path, document: null };
  const crumbs = navigatorBreadcrumbs(browseState, labelResolvers);
  const currentCrumb = crumbs[crumbs.length - 1];

  return (
    <aside className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-r border-border bg-background">
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-3">
        <div className="min-w-0 px-1">
          <h2 className="truncate text-base font-semibold tracking-tight text-foreground">{currentCrumb.label}</h2>
        </div>

        <SidebarContent
          activeDocument={activeDocument}
          calendarError={calendarError}
          calendarEvents={calendarEvents}
          calendarLoading={calendarLoading}
          courseListGroups={courseListGroups}
          coursesLoading={coursesLoading}
          materialsBySection={materialsBySection}
          materialsLoading={materialsLoading}
          onDrill={onDrill}
          onOpenDocument={onOpenDocument}
          onOpenMaterialTask={onOpenMaterialTask}
          onTaskStatusChange={onTaskStatusChange}
          path={path}
          recordingsState={recordingsState}
          studyOutline={studyOutline}
        />
      </div>
      <SidebarResizeHandle onPointerDown={onResizeStart} onResizeBy={onResizeBy} />
    </aside>
  );
}

function SidebarContent({
  activeDocument,
  calendarError,
  calendarEvents,
  calendarLoading,
  courseListGroups,
  coursesLoading,
  materialsBySection,
  materialsLoading,
  onDrill,
  onOpenDocument,
  onOpenMaterialTask,
  onTaskStatusChange,
  path,
  recordingsState,
  studyOutline,
}: {
  activeDocument: NavigatorDocument | null;
  calendarError: string | null;
  calendarEvents: CalendarEventSummary[];
  calendarLoading: boolean;
  courseListGroups: CourseListGroup[];
  coursesLoading: boolean;
  materialsBySection: [string, Material[]][];
  materialsLoading: boolean;
  onDrill: (path: NavigatorPath) => void;
  onOpenDocument: (document: NavigatorDocument) => void;
  onOpenMaterialTask: (material: Material) => void;
  onTaskStatusChange: (taskId: string, status: "done" | "open") => void;
  path: NavigatorPath;
  recordingsState: WebexRecordingState | undefined;
  studyOutline: StudyOutline;
}) {
  switch (path.kind) {
    case "home":
      return (
        <div className="flex flex-col gap-1">
          {HOME_NAV_ITEMS.map((item) => (
            <SidebarRowButton
              key={item.id}
              icon={item.icon}
              label={item.label}
              onClick={() => onDrill({ kind: item.id === "courses" ? "courses" : item.id })}
            />
          ))}
        </div>
      );

    case "courses":
      return (
        <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
          {coursesLoading && courseListGroups.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">Kurse laden</p>
          ) : (
            courseListGroups.map((group) => (
              <section key={group.key}>
                {group.label ? (
                  <p className="mb-1.5 line-clamp-1 px-1 text-[11px] font-medium text-muted-foreground">{group.label}</p>
                ) : null}
                <div className="space-y-1">
                  {group.courses.map((course) => (
                    <CourseSidebarRow
                      active={documentCourseId(activeDocument) === String(course.id)}
                      course={course}
                      key={course.id}
                      onSelect={() => onDrill({ kind: "course", courseId: String(course.id) })}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      );

    case "course": {
      const activeMode =
        activeDocument && "courseId" in activeDocument && activeDocument.courseId === path.courseId
          ? modeOfDocument(activeDocument)
          : null;
      return (
        <div className="flex flex-col gap-1">
          {COURSE_MODE_ITEMS.map((item) => (
            <SidebarRowButton
              active={activeMode === item.mode}
              key={item.mode}
              icon={item.icon}
              label={item.label}
              onClick={() =>
                item.mode === "formula"
                  ? onOpenDocument({ kind: "formula", courseId: path.courseId })
                  : onDrill({ kind: "course-mode", courseId: path.courseId, mode: item.mode })
              }
            />
          ))}
        </div>
      );
    }

    case "course-mode":
      if (path.mode === "materials") {
        return (
          <MaterialDrillList
            activeMaterialId={activeDocument?.kind === "material" ? activeDocument.materialId : null}
            materialsBySection={materialsBySection}
            materialsLoading={materialsLoading}
            onOpenMaterial={(material) =>
              onOpenDocument({ kind: "material", courseId: path.courseId, materialId: material.id })
            }
            onOpenMaterialTask={onOpenMaterialTask}
          />
        );
      }
      if (path.mode === "tasks") {
        return (
          <TaskDrillList
            activeTaskId={activeDocument?.kind === "task" ? activeDocument.taskId : null}
            onOpenTask={(taskId) => onOpenDocument({ kind: "task", courseId: path.courseId, taskId })}
            onTaskStatusChange={onTaskStatusChange}
            tasks={studyOutline.tasks}
          />
        );
      }
      if (path.mode === "script") {
        return (
          <ScriptDrillList
            activeSectionId={activeDocument?.kind === "script-section" ? activeDocument.sectionId : null}
            onOpenSection={(sectionId) =>
              onOpenDocument({ kind: "script-section", courseId: path.courseId, sectionId })
            }
            sections={studyOutline.scriptSections}
          />
        );
      }
      if (path.mode === "pipeline") {
        return (
          <div className="min-h-0 flex-1 overflow-auto px-1">
            <div className="px-1 py-2">
              <p className="text-sm font-semibold text-foreground">Pipeline</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Inspector for resources, buckets, runs, blueprint, and review.
              </p>
            </div>
          </div>
        );
      }
      return (
        <RecordingDrillList
          activeRecordingId={activeDocument?.kind === "recording" ? activeDocument.recordingId : null}
          onOpenRecording={(recordingId) =>
            onOpenDocument({ kind: "recording", courseId: path.courseId, recordingId })
          }
          state={recordingsState}
        />
      );

    case "calendar":
      return (
        <CalendarEventsPanel
          activeEventUid={activeDocument?.kind === "calendar-event" ? activeDocument.eventUid : null}
          error={calendarError}
          events={calendarEvents}
          loading={calendarLoading}
          onOpenEvent={(eventUid) => onOpenDocument({ kind: "calendar-event", eventUid })}
          onOpenGrid={() => onOpenDocument({ kind: "calendar-grid" })}
          variant="sidebar"
        />
      );

    case "chat":
      return (
        <ChatSessionsPanel
          activeSessionId={activeDocument?.kind === "chat-session" ? activeDocument.sessionId : null}
          onNewChat={() => onOpenDocument({ kind: "chat-session", sessionId: null, courseId: null })}
          onOpenSession={(session) =>
            onOpenDocument({ kind: "chat-session", sessionId: session.id, courseId: session.courseId ?? null })
          }
          variant="sidebar"
        />
      );
  }
}

function documentCourseId(document: NavigatorDocument | null): string | null {
  if (!document) {
    return null;
  }
  return "courseId" in document ? document.courseId : null;
}

function modeOfDocument(document: NavigatorDocument): string | null {
  switch (document.kind) {
    case "material":
      return "materials";
    case "task":
      return "tasks";
    case "script-section":
      return "script";
    case "formula":
      return "formula";
    case "recording":
      return "recordings";
    default:
      return null;
  }
}

function SidebarRowButton({
  active = false,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "group flex min-h-11 w-full items-center gap-2.5 rounded-full px-4 py-2.5 text-left text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
      type="button"
      onClick={onClick}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronRight aria-hidden className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function MaterialDrillList({
  activeMaterialId,
  materialsBySection,
  materialsLoading,
  onOpenMaterial,
  onOpenMaterialTask,
}: {
  activeMaterialId: string | null;
  materialsBySection: [string, Material[]][];
  materialsLoading: boolean;
  onOpenMaterial: (material: Material) => void;
  onOpenMaterialTask: (material: Material) => void;
}) {
  const totalCount = materialsBySection.reduce((total, [, sectionMaterials]) => total + sectionMaterials.length, 0);

  if (materialsLoading && totalCount === 0) {
    return (
      <div className="space-y-2 pr-1">
        <div className="h-9 rounded-full bg-secondary" />
        <div className="h-9 rounded-full bg-secondary" />
        <div className="h-9 rounded-full bg-secondary" />
      </div>
    );
  }

  if (totalCount === 0) {
    return <p className="pr-2 text-xs leading-5 text-muted-foreground">Die Materialliste erscheint, sobald der Kurs geladen ist.</p>;
  }

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
      {materialsBySection.map(([section, sectionMaterials]) => (
        <section key={section}>
          <p className="mb-1.5 line-clamp-1 px-1 text-[11px] font-medium text-muted-foreground">{section}</p>
          <div className="space-y-1">
            {sectionMaterials.map((material) => {
              const active = activeMaterialId === material.id;
              const isTaskSheet =
                /aufgabenblatt\s*\d+/i.test(material.name) && !/lösung|loesung|solution/i.test(material.name);
              return (
                <div
                  className={cn(
                    "flex min-h-9 min-w-0 items-center gap-0.5 rounded-xl pr-1 transition-colors",
                    active ? "bg-secondary" : "hover:bg-secondary/60",
                  )}
                  key={material.id}
                >
                  <button
                    className="min-w-0 flex-1 px-2.5 py-2 text-left text-xs"
                    onClick={() => onOpenMaterial(material)}
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText aria-hidden className={cn("size-3.5 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
                      <span className={cn("block truncate font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                        {material.name}
                      </span>
                    </span>
                  </button>
                  {isTaskSheet ? (
                    <button
                      aria-label={`${material.name} als Aufgabe öffnen`}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                      onClick={() => onOpenMaterialTask(material)}
                      type="button"
                    >
                      <CheckCircle2 aria-hidden className="size-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function TaskDrillList({
  activeTaskId,
  onOpenTask,
  onTaskStatusChange,
  tasks,
}: {
  activeTaskId: string | null;
  onOpenTask: (taskId: string) => void;
  onTaskStatusChange: (taskId: string, status: "done" | "open") => void;
  tasks: StudyOutline["tasks"];
}) {
  const doneCount = tasks.filter((task) => isDoneTaskStatus(task.status)).length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const groups = groupStudyTasksBySection(tasks);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="pr-1">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{totalCount > 0 ? `${doneCount}/${totalCount} erledigt` : "Aufgaben laden"}</span>
          {totalCount > 0 ? <span>{progress}%</span> : null}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      </div>
      {totalCount > 0 ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
          {groups.map((group) => (
            <section key={group.title}>
              <p className="mb-1.5 line-clamp-1 px-1 text-xs font-semibold text-foreground">{group.title}</p>
              <div className="space-y-1">
                {group.sheets.flatMap((sheet) => sheet.tasks).map((task) => {
                  const done = isDoneTaskStatus(task.status);
                  const active = activeTaskId === task.id;
                  const displayTitle = taskDisplayTitle(task.sheetTitle, task.title);
                  return (
                    <div
                      className={cn(
                        "flex min-h-9 min-w-0 items-center gap-0.5 rounded-xl pr-1 transition-colors",
                        active ? "bg-secondary" : "hover:bg-secondary/60",
                      )}
                      key={task.id}
                    >
                      <button
                        aria-label={done ? `${displayTitle} als offen markieren` : `${displayTitle} als erledigt markieren`}
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
                          done
                            ? "text-emerald-600 hover:bg-emerald-500/10"
                            : "text-muted-foreground hover:bg-background hover:text-foreground",
                        )}
                        onClick={() => onTaskStatusChange(task.id, done ? "open" : "done")}
                        type="button"
                      >
                        {done ? <CheckCircle2 aria-hidden className="size-4" /> : <Circle aria-hidden className="size-4" />}
                      </button>
                      <button
                        className="min-w-0 flex-1 py-1.5 text-left text-xs"
                        onClick={() => onOpenTask(task.id)}
                        type="button"
                      >
                        <span
                          className={cn(
                            "block truncate font-medium",
                            active ? "text-foreground" : "text-muted-foreground",
                            done && !active && "line-through decoration-muted-foreground/40",
                          )}
                        >
                          {displayTitle}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {taskStatusLabel(task.status)}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="pr-2 text-xs leading-5 text-muted-foreground">Die Aufgabenliste erscheint, sobald die Aufgaben geladen sind.</p>
      )}
    </div>
  );
}

function ScriptDrillList({
  activeSectionId,
  onOpenSection,
  sections,
}: {
  activeSectionId: string | null;
  onOpenSection: (sectionId: string) => void;
  sections: StudyOutline["scriptSections"];
}) {
  if (sections.length === 0) {
    return <p className="pr-2 text-xs leading-5 text-muted-foreground">Die Kapitelliste erscheint, sobald das Script geladen ist.</p>;
  }

  return (
    <div className="min-h-0 flex-1 space-y-1 overflow-auto pr-1">
      {sections.map((section) => {
        const active = activeSectionId === section.id;
        return (
          <button
            className={cn(
              "min-h-9 w-full rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors",
              active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
            key={section.id}
            onClick={() => onOpenSection(section.id)}
            style={{ paddingLeft: `${12 + Math.max(0, section.level - 1) * 12}px` }}
            type="button"
          >
            <span className="block truncate">{section.title}</span>
          </button>
        );
      })}
    </div>
  );
}

function RecordingDrillList({
  activeRecordingId,
  onOpenRecording,
  state,
}: {
  activeRecordingId: string | null;
  onOpenRecording: (recordingId: string) => void;
  state: WebexRecordingState | undefined;
}) {
  if (!state || (state.loading && state.recordings.length === 0)) {
    return <p className="pr-2 text-xs leading-5 text-muted-foreground">Aufzeichnungen laden…</p>;
  }
  if (state.error && state.recordings.length === 0) {
    return <p className="pr-2 text-xs leading-5 text-muted-foreground">{state.error}</p>;
  }
  if (state.recordings.length === 0) {
    return <p className="pr-2 text-xs leading-5 text-muted-foreground">Keine Aufzeichnungen gefunden.</p>;
  }

  return (
    <div className="min-h-0 flex-1 space-y-1 overflow-auto pr-1">
      {state.recordings.map((recording) => {
        const active = activeRecordingId === recording.recordingUuid;
        return (
          <button
            className={cn(
              "w-full rounded-xl px-3 py-2.5 text-left transition-colors",
              active ? "bg-secondary" : "hover:bg-secondary/60",
            )}
            key={recording.recordingUuid}
            onClick={() => onOpenRecording(recording.recordingUuid)}
            type="button"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Video aria-hidden className={cn("size-3.5 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
              <span className="min-w-0">
                <span className={cn("block truncate text-xs font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                  {recording.sessionTitle || recording.recordingName}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">{recording.recordingDate}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SidebarResizeHandle({
  onPointerDown,
  onResizeBy,
}: {
  onPointerDown: (event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) => void;
  onResizeBy: (delta: number) => void;
}) {
  return (
    <button
      aria-label="Sidebar-Breite anpassen"
      className="group absolute right-0 top-0 h-full w-2 translate-x-1/2 cursor-col-resize touch-none"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onResizeBy(-16);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onResizeBy(16);
        }
      }}
      onMouseDown={onPointerDown}
      onPointerDown={onPointerDown}
      type="button"
    >
      <span className="mx-auto block h-full w-1 bg-transparent transition-all group-hover:bg-gradient-to-b group-hover:from-transparent group-hover:via-border group-hover:to-transparent" />
    </button>
  );
}
