"use client";

import { ArrowLeft, CalendarDays, GraduationCap, Menu, Search } from "lucide-react";
import type { ReactNode } from "react";

import { CalendarPanel } from "@/components/course-calendar-panel";
import { CourseThumbnail, EmptyState, LoadingRows, MaterialRow } from "@/components/dashboard-ui";
import { StudyModeActions, type StudyMode } from "@/components/study-mode-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Course, Material } from "@/lib/dashboard-data";
import { courseSubtitle, courseTitle } from "@/lib/dashboard-data";
import type { ScriptSectionOutline, StudyOutline } from "@/lib/study-outline";
import { cn } from "@/lib/utils";

type CategoryOption = {
  count: number;
  key: string;
  label: string;
};

type CourseListGroup = {
  courses: Course[];
  key: string;
  label: string;
};

export function MoodleSidebar({
  categoryOptionGroups,
  courseListGroups,
  coursesCount,
  filteredCoursesCount,
  homeView,
  loading,
  materials,
  materialsBySection,
  materialsLoading,
  mobileShowsMaterialList,
  navigationMode,
  query,
  selectedCategory,
  selectedCourse,
  selectedCourseId,
  selectedScriptSectionId,
  selectedMaterialId,
  selectedTaskId,
  sidebarCollapsed,
  studyMode,
  studyOutline,
  onBackToCourses,
  onCategoryChange,
  onHomeViewChange,
  onMaterials,
  onQueryChange,
  onRecordings,
  onScript,
  onSelectCourse,
  onSelectMaterial,
  onSelectScriptSection,
  onSelectTask,
  onTasks,
  onToggleSidebar,
}: {
  categoryOptionGroups: { other: CategoryOption[]; semesters: CategoryOption[] };
  courseListGroups: CourseListGroup[];
  coursesCount: number;
  filteredCoursesCount: number;
  homeView: "courses" | "calendar";
  loading: boolean;
  materials: Material[];
  materialsBySection: [string, Material[]][];
  materialsLoading: boolean;
  mobileShowsMaterialList: boolean;
  navigationMode: "courses" | "materials";
  query: string;
  selectedCategory: string;
  selectedCourse: Course | null;
  selectedCourseId: string | null;
  selectedScriptSectionId: string | null;
  selectedMaterialId: string | null;
  selectedTaskId: string | null;
  sidebarCollapsed: boolean;
  studyMode: StudyMode;
  studyOutline: StudyOutline;
  onBackToCourses: () => void;
  onCategoryChange: (value: string) => void;
  onHomeViewChange: (value: "courses" | "calendar") => void;
  onMaterials: () => void;
  onQueryChange: (value: string) => void;
  onRecordings: () => void;
  onScript: () => void;
  onSelectCourse: (courseId: string) => void;
  onSelectMaterial: (material: Material) => void;
  onSelectScriptSection: (sectionId: string) => void;
  onSelectTask: (taskId: string) => void;
  onTasks: () => void;
  onToggleSidebar: () => void;
}) {
  return (
    <aside
      className={cn(
        "min-h-0 w-full min-w-0 flex-col rounded-[1.5rem] bg-card lg:flex lg:max-h-none lg:overflow-hidden lg:rounded-[2rem]",
        navigationMode === "courses" || mobileShowsMaterialList ? "flex max-h-none overflow-visible" : "hidden",
      )}
    >
      <CollapsedSidebarRail
        hidden={!sidebarCollapsed}
        navigationMode={navigationMode}
        selectedCourse={selectedCourse}
        onToggleSidebar={onToggleSidebar}
      />
      <div className={cn("min-h-0 flex-1 flex-col", sidebarCollapsed ? "lg:hidden" : "flex")}>
        <div className="flex flex-col gap-3 px-4 py-4 lg:px-5 lg:py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                className="hidden lg:inline-flex"
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Collapse sidebar"
                onClick={onToggleSidebar}
              >
                <Menu aria-hidden />
              </Button>
              <h2 className="truncate text-base font-semibold tracking-tight">
                {navigationMode === "courses" ? (homeView === "calendar" ? "Kalender" : "Courses") : courseModeTitle(studyMode)}
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {navigationMode === "courses"
                ? homeView === "courses" ? `${filteredCoursesCount} / ${coursesCount}` : "120 Tage"
                : materials.length}
            </span>
          </div>
          {navigationMode === "courses" ? (
            <>
              <HomeViewSwitch value={homeView} onChange={onHomeViewChange} />
              {homeView === "courses" ? (
                <CourseFilters
                  categoryOptionGroups={categoryOptionGroups}
                  query={query}
                  selectedCategory={selectedCategory}
                  onCategoryChange={onCategoryChange}
                  onQueryChange={onQueryChange}
                />
              ) : null}
            </>
          ) : selectedCourse ? (
            <button
              className="flex w-full min-w-0 items-center gap-3 rounded-3xl bg-secondary px-3 py-3 text-left"
              type="button"
              onClick={onBackToCourses}
            >
              <CourseThumbnail course={selectedCourse} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{courseTitle(selectedCourse)}</span>
                <span className="block truncate text-xs text-muted-foreground">{courseSubtitle(selectedCourse)}</span>
              </span>
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-visible px-3 pb-4 lg:overflow-auto">
          {navigationMode === "courses" && homeView === "courses" ? (
            <CourseList
              courseListGroups={courseListGroups}
              filteredCoursesCount={filteredCoursesCount}
              loading={loading}
              selectedCourseId={selectedCourseId}
              onSelectCourse={onSelectCourse}
            />
          ) : navigationMode === "courses" ? (
            <CalendarPanel compact scope="all" />
          ) : (
            <MaterialNavigation
              materials={materials}
              materialsBySection={materialsBySection}
              materialsLoading={materialsLoading}
              selectedMaterialId={selectedMaterialId}
              selectedScriptSectionId={selectedScriptSectionId}
              selectedTaskId={selectedTaskId}
              studyMode={studyMode}
              studyOutline={studyOutline}
              onBackToCourses={onBackToCourses}
              onMaterials={onMaterials}
              onRecordings={onRecordings}
              onScript={onScript}
              onSelectMaterial={onSelectMaterial}
              onSelectScriptSection={onSelectScriptSection}
              onSelectTask={onSelectTask}
              onTasks={onTasks}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

function HomeViewSwitch({
  value,
  onChange,
}: {
  value: "courses" | "calendar";
  onChange: (value: "courses" | "calendar") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1">
      <HomeViewButton
        active={value === "courses"}
        icon={<GraduationCap aria-hidden />}
        label="Kurse"
        onClick={() => onChange("courses")}
      />
      <HomeViewButton
        active={value === "calendar"}
        icon={<CalendarDays aria-hidden />}
        label="Kalender"
        onClick={() => onChange("calendar")}
      />
    </div>
  );
}

function HomeViewButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium transition-colors",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="[&>svg]:size-4">{icon}</span>
      {label}
    </button>
  );
}

function CollapsedSidebarRail({
  hidden,
  navigationMode,
  selectedCourse,
  onToggleSidebar,
}: {
  hidden: boolean;
  navigationMode: "courses" | "materials";
  selectedCourse: Course | null;
  onToggleSidebar: () => void;
}) {
  return (
    <div className={cn("hidden h-full flex-col items-center gap-3 px-2 py-4", !hidden && "lg:flex")}>
      <Button type="button" variant="ghost" size="icon" aria-label="Expand sidebar" onClick={onToggleSidebar}>
        <Menu aria-hidden />
      </Button>
      {navigationMode === "materials" && selectedCourse ? <CourseThumbnail course={selectedCourse} /> : null}
      <div className="mt-1 h-px w-8 bg-muted" />
    </div>
  );
}

function CourseFilters({
  categoryOptionGroups,
  query,
  selectedCategory,
  onCategoryChange,
  onQueryChange,
}: {
  categoryOptionGroups: { other: CategoryOption[]; semesters: CategoryOption[] };
  query: string;
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  onQueryChange: (value: string) => void;
}) {
  return (
    <>
      <Select value={selectedCategory} onValueChange={onCategoryChange}>
        <SelectTrigger
          aria-label="Course category"
          className="h-11 w-full rounded-full border-0 bg-secondary px-4 text-sm shadow-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SelectValue placeholder="All Moodle categories" />
        </SelectTrigger>
        <SelectContent
          className="max-h-[min(520px,var(--radix-select-content-available-height))] rounded-3xl border-0 bg-card p-2 text-card-foreground shadow-xl"
          position="popper"
          sideOffset={6}
        >
          <SelectGroup>
            <SelectItem className="rounded-2xl px-3 py-2.5" value="all">
              All Moodle categories
            </SelectItem>
          </SelectGroup>
          <CategorySelectGroup label="Semesters" options={categoryOptionGroups.semesters} />
          <CategorySelectGroup label="Other Moodle categories" options={categoryOptionGroups.other} />
        </SelectContent>
      </Select>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input className="pl-11" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search courses" />
      </div>
    </>
  );
}

function CategorySelectGroup({ label, options }: { label: string; options: CategoryOption[] }) {
  if (options.length === 0) {
    return null;
  }
  return (
    <>
      <SelectSeparator className="my-2" />
      <SelectGroup>
        <SelectLabel className="px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.14em]">
          {label}
        </SelectLabel>
        {options.map((category) => (
          <SelectItem key={category.key} className="rounded-2xl px-3 py-2.5" value={category.key}>
            {category.label} ({category.count})
          </SelectItem>
        ))}
      </SelectGroup>
    </>
  );
}

function CourseList({
  courseListGroups,
  filteredCoursesCount,
  loading,
  selectedCourseId,
  onSelectCourse,
}: {
  courseListGroups: CourseListGroup[];
  filteredCoursesCount: number;
  loading: boolean;
  selectedCourseId: string | null;
  onSelectCourse: (courseId: string) => void;
}) {
  if (loading) {
    return <LoadingRows label="Loading courses" />;
  }
  if (filteredCoursesCount === 0) {
    return <EmptyState title="No courses found" description="Try a different search." />;
  }
  return (
    <div className="flex flex-col gap-6">
      {courseListGroups.map((group) => (
        <section key={group.key} className="flex flex-col gap-1">
          {group.label ? (
            <h3 className="px-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {group.label}
            </h3>
          ) : null}
          {group.courses.map((course) => {
            const active = String(course.id) === selectedCourseId;
            return (
              <button
                key={course.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-3xl px-3 py-3 text-left transition-colors",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground",
                )}
                type="button"
                onClick={() => onSelectCourse(String(course.id))}
              >
                <CourseThumbnail course={course} active={active} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-sm font-medium leading-5">{courseTitle(course)}</span>
                  <span className={cn("mt-1 block truncate text-xs", active ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {courseSubtitle(course)}
                  </span>
                </span>
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function MaterialNavigation({
  materials,
  materialsBySection,
  materialsLoading,
  selectedMaterialId,
  selectedScriptSectionId,
  selectedTaskId,
  studyMode,
  studyOutline,
  onBackToCourses,
  onMaterials,
  onRecordings,
  onScript,
  onSelectMaterial,
  onSelectScriptSection,
  onSelectTask,
  onTasks,
}: {
  materials: Material[];
  materialsBySection: [string, Material[]][];
  materialsLoading: boolean;
  selectedMaterialId: string | null;
  selectedScriptSectionId: string | null;
  selectedTaskId: string | null;
  studyMode: StudyMode;
  studyOutline: StudyOutline;
  onBackToCourses: () => void;
  onMaterials: () => void;
  onRecordings: () => void;
  onScript: () => void;
  onSelectMaterial: (material: Material) => void;
  onSelectScriptSection: (sectionId: string) => void;
  onSelectTask: (taskId: string) => void;
  onTasks: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Button className="w-fit" type="button" variant="secondary" onClick={onBackToCourses}>
        <ArrowLeft aria-hidden />
        Courses
      </Button>
      <StudyModeActions
        studyMode={studyMode}
        onMaterials={onMaterials}
        onTasks={onTasks}
        onScript={onScript}
        onRecordings={onRecordings}
      />
      {studyMode === "materials" ? (
        <MaterialsOutline
          materials={materials}
          materialsBySection={materialsBySection}
          materialsLoading={materialsLoading}
          selectedMaterialId={selectedMaterialId}
          onSelectMaterial={onSelectMaterial}
        />
      ) : studyMode === "tasks" ? (
        <TaskOutline
          selectedTaskId={selectedTaskId}
          tasks={studyOutline.tasks}
          onSelectTask={onSelectTask}
        />
      ) : studyMode === "script" ? (
        <ScriptOutline
          scriptSections={studyOutline.scriptSections}
          selectedScriptSectionId={selectedScriptSectionId}
          onSelectScriptSection={onSelectScriptSection}
        />
      ) : (
        <RecordingOutline />
      )}
    </div>
  );
}

function MaterialsOutline({
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
  if (materialsLoading) {
    return <LoadingRows label="Loading materials" />;
  }
  if (materials.length === 0) {
    return <EmptyState title="No materials loaded" description="Go back and choose another course, or refresh Moodle." />;
  }
  return (
    <div className="flex flex-col gap-7">
      {materialsBySection.map(([section, sectionMaterials]) => (
        <section key={section} className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">{section}</h2>
          <div className="flex flex-col gap-1">
            {sectionMaterials.map((material) => (
              <MaterialRow
                key={material.id}
                active={material.id === selectedMaterialId}
                material={material}
                onSelect={() => onSelectMaterial(material)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TaskOutline({
  selectedTaskId,
  tasks,
  onSelectTask,
}: {
  selectedTaskId: string | null;
  tasks: StudyOutline["tasks"];
  onSelectTask: (taskId: string) => void;
}) {
  if (tasks.length === 0) {
    return <LoadingRows label="Loading tasks" />;
  }
  return (
    <div className="flex flex-col gap-1">
      {tasks.map((task) => (
        <button
          className={cn(
            "rounded-2xl px-3 py-2 text-left text-sm transition-colors",
            selectedTaskId === task.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
          )}
          key={task.id}
          onClick={() => onSelectTask(task.id)}
          type="button"
        >
          <span className="line-clamp-2 font-medium">{task.title}</span>
          <span className={cn("mt-1 block truncate text-xs", selectedTaskId === task.id ? "text-primary-foreground/70" : "text-muted-foreground")}>
            {task.sheetTitle} · {task.status.replace("_", " ")}
          </span>
        </button>
      ))}
    </div>
  );
}

function ScriptOutline({
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
    <div className="flex flex-col gap-1">
      {scriptSections.map((section) => (
        <button
          className={cn(
            "rounded-2xl py-2 pr-3 text-left text-sm transition-colors",
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

function RecordingOutline() {
  return (
    <div className="rounded-2xl bg-secondary px-4 py-3 text-sm leading-6 text-muted-foreground">
      Die Aufzeichnungen werden rechts geladen. Wähle dort ein Video aus, um es zu streamen.
    </div>
  );
}

function courseModeTitle(studyMode: StudyMode): string {
  if (studyMode === "tasks") return "Aufgaben";
  if (studyMode === "script") return "Script";
  if (studyMode === "recordings") return "Aufzeichnungen";
  return "Materialien";
}
