"use client";

import { ArrowLeft, Search, UserCircle } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { HeaderActionsMenu } from "@/components/header-actions-menu";
import { StudyModeActions, type StudyMode } from "@/components/study-mode-actions";
import type { Course, User } from "@/lib/dashboard-data";
import { courseImageUrl, courseSubtitle, courseTitle } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export function MobileCourseExperience({
  children,
  course,
  itemCount,
  loading,
  refreshing,
  searchPlaceholder,
  studyMode,
  user,
  onBackToCourses,
  onFormula,
  onMaterials,
  onRecordings,
  onRefresh,
  onScript,
  onTasks,
}: {
  children: ReactNode;
  course: Course;
  itemCount: number;
  loading: boolean;
  refreshing: boolean;
  searchPlaceholder: string;
  studyMode: StudyMode;
  user: User | null;
  onBackToCourses: () => void;
  onFormula: () => void;
  onMaterials: () => void;
  onRecordings: () => void;
  onRefresh: () => void;
  onScript: () => void;
  onTasks: () => void;
}) {
  const imageUrl = courseImageUrl(course);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [course.id]);

  return (
    <div className="min-h-dvh w-[100svw] max-w-[100svw] overflow-x-clip bg-background pb-24 lg:hidden">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex items-center justify-between gap-3 px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <button
          className="pointer-events-auto inline-flex h-10 max-w-[48vw] items-center gap-2 rounded-full bg-black/45 px-3 text-sm font-semibold text-white shadow-lg backdrop-blur"
          type="button"
          onClick={onBackToCourses}
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          <span className="truncate">Courses</span>
        </button>
        <div className="pointer-events-auto">
          <HeaderActionsMenu
            buttonClassName="h-10 w-10 rounded-full bg-black/35 p-0 text-white shadow-lg hover:bg-black/45"
            loading={loading}
            refreshing={refreshing}
            triggerContent={<UserCircle className="size-5" aria-hidden />}
            user={user}
            onRefresh={onRefresh}
          />
        </div>
      </div>

      <section className="relative isolate min-h-[300px] w-full max-w-[100svw] overflow-hidden bg-neutral-950 px-4 pb-10 pt-20 text-white">
        {imageUrl ? (
          <img
            alt=""
            className="absolute inset-0 -z-20 h-full w-full object-cover opacity-55"
            src={imageUrl}
          />
        ) : null}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.52)_52%,rgba(0,0,0,0.78)_100%)]" />

        <div className="mt-8 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/70">{courseSubtitle(course).replace(/[()]/g, "")}</p>
            <h2 className="mt-2 text-[clamp(1.85rem,8vw,2.25rem)] font-semibold leading-[1.05] tracking-tight">
              {courseTitle(course)}
            </h2>
          </div>
          <div className="mb-1 grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-black/40 text-center backdrop-blur">
            <span className="block text-lg font-semibold leading-none">{itemCount}</span>
            <span className="mt-0.5 block text-xs text-white/70">Items</span>
          </div>
        </div>
      </section>

      <section className="relative -mt-7 w-full max-w-[100svw] rounded-t-[1.75rem] bg-background px-4 pt-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            className="h-12 w-full rounded-[1.15rem] border border-border bg-card px-11 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            placeholder={searchPlaceholder}
            type="search"
          />
        </div>

        <div className="mt-4">
          <StudyModeActions
            studyMode={studyMode}
            onMaterials={onMaterials}
            onTasks={onTasks}
            onScript={onScript}
            onFormula={onFormula}
            onRecordings={onRecordings}
          />
        </div>

        <div
          className={cn(
            "mt-6 min-h-[420px]",
            studyMode === "tasks" || studyMode === "script" || studyMode === "formula" ? "-mx-4" : "",
          )}
        >
          {children}
        </div>
      </section>
    </div>
  );
}
