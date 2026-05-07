"use client";

import { ArrowLeft, Bot, RefreshCw, Search } from "lucide-react";
import { Show, UserButton, useAuth } from "@clerk/nextjs";
import { useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FullPageLoading, SignedOutHome } from "@/components/home-states";
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
import { APIKeyMenu } from "@/components/api-key-menu";
import { CodexPanel } from "@/components/codex-panel";
import { CourseMainPanel } from "@/components/course-main-panel";
import { CourseThumbnail, EmptyState, LoadingRows, MaterialRow } from "@/components/dashboard-ui";
import { MoodleConnectCard } from "@/components/moodle-connect-card";
import { Spinner } from "@/components/ui/spinner";
import { useCodexMoodleActions } from "@/hooks/use-codex-moodle-actions";
import { readDashboardCache, writeDashboardCache } from "@/lib/dashboard-cache";
import type { Course, Material, User } from "@/lib/dashboard-data";
import {
  buildCategoryOptionGroups,
  buildCourseGroups,
  courseCategoryKey,
  courseSubtitle,
  courseTitle,
  normalizeCourses,
  normalizeMaterials,
} from "@/lib/dashboard-data";
import type { PDFScrollCommand, PDFViewState } from "@/lib/pdf-context";
import { cn } from "@/lib/utils";

const MOODLE_API_BASE_URL = "/api/moodle";
const MOODLE_SERVICES_URL = process.env.NEXT_PUBLIC_MOODLE_SERVICES_URL ?? "https://moodle-services.os-home.net";

export default function Home() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsByCourseId, setMaterialsByCourseId] = useState<Record<string, Material[]>>({});
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [navigationMode, setNavigationMode] = useState<"courses" | "materials">("courses");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [codexOpen, setCodexOpen] = useState(false);
  const [pdfState, setPDFState] = useState<PDFViewState | null>(null);
  const [pdfScrollCommand, setPDFScrollCommand] = useState<PDFScrollCommand | null>(null);
  const materialsRequestId = useRef(0);
  const { applyCodexActions } = useCodexMoodleActions({
    courses,
    materials,
    materialsByCourseId,
    selectedCategory,
    selectedCourseId,
    user,
    userId,
    pdfState,
    loadMaterials,
    setError,
    setNavigationMode,
    setPDFScrollCommand,
    setSelectedCourseId,
    setSelectedMaterialId,
  });

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      setUser(null);
      setCourses([]);
      setMaterials([]);
      setMaterialsByCourseId({});
      setSelectedCourseId(null);
      setSelectedMaterialId(null);
      setNavigationMode("courses");
      setSelectedCategory("all");
      setError(null);
      setNeedsConnection(false);
      return;
    }

    if (!userId) {
      return;
    }

    const cached = readDashboardCache(userId);
    if (cached) {
      setUser(cached.user);
      setCourses(cached.courses);
      setMaterialsByCourseId(cached.materialsByCourseId);
      setSelectedCourseId(cached.selectedCourseId);
      setSelectedCategory(cached.selectedCategory);
      setSelectedMaterialId(cached.selectedMaterialId);
      setNavigationMode(cached.selectedCourseId ? "materials" : "courses");
      setMaterials(cached.selectedCourseId ? cached.materialsByCourseId[cached.selectedCourseId] ?? [] : []);
      setNeedsConnection(false);
      setError(null);
    }

    void loadDashboard({ background: Boolean(cached) });
  }, [isLoaded, isSignedIn, userId]);

  const selectedCourse = useMemo(
    () => courses.find((course) => String(course.id) === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  const categoryOptionGroups = useMemo(() => buildCategoryOptionGroups(courses), [courses]);

  const selectedMaterial = useMemo(
    () => materials.find((material) => material.id === selectedMaterialId) ?? null,
    [materials, selectedMaterialId],
  );

  const filteredCourses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const categoryFiltered =
      selectedCategory === "all"
        ? courses
        : courses.filter((course) => courseCategoryKey(course) === selectedCategory);

    if (!normalizedQuery) {
      return categoryFiltered;
    }

    return categoryFiltered.filter((course) =>
      [courseTitle(course), courseSubtitle(course), course.category, course.categoryName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [courses, query, selectedCategory]);

  const courseListGroups = useMemo(() => {
    if (selectedCategory === "all" && query.trim().length === 0) {
      return buildCourseGroups(filteredCourses).map((group) => ({
        key: group.key,
        label: group.label,
        courses: group.courses,
      }));
    }

    return [{ key: "filtered-courses", label: "", courses: filteredCourses }];
  }, [filteredCourses, query, selectedCategory]);

  const materialsBySection = useMemo(() => {
    const groups = new Map<string, Material[]>();
    for (const material of materials) {
      const section = material.sectionName?.trim() || "Materialien";
      groups.set(section, [...(groups.get(section) ?? []), material]);
    }
    return [...groups.entries()];
  }, [materials]);

  async function loadDashboard(options: { background?: boolean } = {}) {
    if (!userId) {
      return;
    }

    materialsRequestId.current += 1;
    setLoading(!options.background && courses.length === 0);
    setRefreshing(options.background || courses.length > 0);
    setMaterialsLoading(false);
    setError(null);

    try {
      const [userResponse, coursesResponse] = await Promise.all([
        apiRequest<User>("/me"),
        apiRequest<{ courses?: Course[] } | Course[]>("/courses"),
      ]);
      const courseList = normalizeCourses(coursesResponse);
      const nextMaterialsByCourseId = pruneMaterialCache(materialsByCourseId, courseList);
      const nextSelectedCourseId =
        selectedCourseId && courseList.some((course) => String(course.id) === selectedCourseId)
          ? selectedCourseId
          : null;
      const nextMaterials = nextSelectedCourseId ? nextMaterialsByCourseId[nextSelectedCourseId] ?? [] : [];
      const nextSelectedMaterialId =
        selectedMaterialId && nextMaterials.some((material) => material.id === selectedMaterialId)
          ? selectedMaterialId
          : nextMaterials[0]?.id ?? null;
      const nextSelectedCategory =
        selectedCategory === "all" || courseList.some((course) => courseCategoryKey(course) === selectedCategory)
          ? selectedCategory
          : "all";

      setUser(userResponse);
      setCourses(courseList);
      setMaterials(nextMaterials);
      setMaterialsByCourseId(nextMaterialsByCourseId);
      setNeedsConnection(false);
      setSelectedCourseId(nextSelectedCourseId);
      setSelectedMaterialId(nextSelectedMaterialId);
      setNavigationMode((current) => (nextSelectedCourseId && current === "materials" ? "materials" : "courses"));
      setSelectedCategory(nextSelectedCategory);
      writeDashboardCache(userId, {
        user: userResponse,
        courses: courseList,
        materialsByCourseId: nextMaterialsByCourseId,
        selectedCourseId: nextSelectedCourseId,
        selectedCategory: nextSelectedCategory,
        selectedMaterialId: nextSelectedMaterialId,
      });
    } catch (loadError) {
      if (!options.background) {
        setUser(null);
        setCourses([]);
        setMaterials([]);
        setMaterialsByCourseId({});
        setSelectedCourseId(null);
        setSelectedMaterialId(null);
        setNavigationMode("courses");
        setSelectedCategory("all");
      }
      if (isMoodleNotConnected(loadError)) {
        setNeedsConnection(true);
        setError(null);
      } else {
        setNeedsConnection(false);
        setError(getErrorMessage(loadError));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadMaterials(courseId: string): Promise<Material[]> {
    const cachedMaterials = materialsByCourseId[courseId];
    if (cachedMaterials) {
      materialsRequestId.current += 1;
      setMaterialsLoading(false);
      setSelectedCourseId(courseId);
      setMaterials(cachedMaterials);
      setSelectedMaterialId(null);
      setNavigationMode("materials");
      if (userId) {
        writeDashboardCache(userId, {
          user,
          courses,
          materialsByCourseId,
          selectedCourseId: courseId,
          selectedCategory,
          selectedMaterialId: null,
        });
      }
      return cachedMaterials;
    }

    setMaterialsLoading(true);
    setError(null);
    setSelectedCourseId(courseId);
    setNavigationMode("materials");
    const requestId = materialsRequestId.current + 1;
    materialsRequestId.current = requestId;

    try {
      const response = await apiRequest<{ materials?: Material[] } | Material[]>(
        `/courses/${encodeURIComponent(courseId)}/materials`,
      );
      const nextMaterials = normalizeMaterials(response);
      if (materialsRequestId.current !== requestId) {
        return [];
      }
      setMaterials(nextMaterials);
      setSelectedMaterialId(null);
      setMaterialsByCourseId((current) => ({
        ...current,
        [courseId]: nextMaterials,
      }));
      if (userId) {
        writeDashboardCache(userId, {
          user,
          courses,
          materialsByCourseId: {
            ...materialsByCourseId,
            [courseId]: nextMaterials,
          },
          selectedCourseId: courseId,
          selectedCategory,
          selectedMaterialId: null,
        });
      }
      return nextMaterials;
    } catch (loadError) {
      if (materialsRequestId.current !== requestId) {
        return [];
      }
      setMaterials([]);
      setSelectedMaterialId(null);
      setError(getErrorMessage(loadError));
      return [];
    } finally {
      if (materialsRequestId.current === requestId) {
        setMaterialsLoading(false);
      }
    }
  }

  if (!isLoaded) {
    return <FullPageLoading />;
  }

  return (
    <>
      <Show when="signed-out">
        <SignedOutHome moodleServicesUrl={MOODLE_SERVICES_URL} />
      </Show>

      <Show when="signed-in">
        <main className="h-dvh max-h-dvh overflow-hidden px-4 py-4 sm:px-6">
          <div className="mx-auto grid h-full max-w-[1680px] grid-rows-[auto_minmax(0,1fr)] gap-4">
            <header className="flex min-h-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">Moodle</h1>
                  <Badge>Signed in</Badge>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {user ? `${user.displayName} · ${user.moodleSiteUrl}` : "Loading Moodle workspace"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => void loadDashboard()}>
                  {loading || refreshing ? <Spinner aria-hidden /> : <RefreshCw aria-hidden />}
                  {refreshing ? "Updating" : "Refresh"}
                </Button>
                <Button
                  variant={codexOpen ? "default" : "secondary"}
                  onClick={() => setCodexOpen((current) => !current)}
                  type="button"
                >
                  <Bot aria-hidden />
                  Codex
                </Button>
                <APIKeyMenu />
                <UserButton />
              </div>
            </header>

            {error ? <Alert>{error}</Alert> : null}

            {needsConnection ? (
              <section className="min-h-0 overflow-auto py-4">
                <MoodleConnectCard
                  onConnected={() => {
                    setNeedsConnection(false);
                    void loadDashboard();
                  }}
                />
              </section>
            ) : (
              <section
                className={cn(
                  "grid min-h-0 gap-4",
                  codexOpen
                    ? "lg:grid-cols-[380px_minmax(0,1fr)_420px]"
                    : "lg:grid-cols-[380px_minmax(0,1fr)]",
                )}
              >
                <aside className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] bg-card">
                  <div className="flex flex-col gap-3 px-5 py-5">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-base font-semibold tracking-tight">
                        {navigationMode === "courses" ? "Courses" : "Materials"}
                      </h2>
                      <span className="text-xs text-muted-foreground">
                        {navigationMode === "courses" ? `${filteredCourses.length} / ${courses.length}` : materials.length}
                      </span>
                    </div>
                    {navigationMode === "courses" ? (
                      <>
                        <Select
                          value={selectedCategory}
                          onValueChange={(value) => {
                            materialsRequestId.current += 1;
                            setMaterialsLoading(false);
                            setSelectedCategory(value);
                            setSelectedCourseId(null);
                            setSelectedMaterialId(null);
                            setNavigationMode("courses");
                            setMaterials([]);
                          }}
                        >
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
                            {categoryOptionGroups.semesters.length > 0 ? (
                              <>
                                <SelectSeparator className="my-2" />
                                <SelectGroup>
                                  <SelectLabel className="px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.14em]">
                                    Semesters
                                  </SelectLabel>
                                  {categoryOptionGroups.semesters.map((category) => (
                                    <SelectItem
                                      key={category.key}
                                      className="rounded-2xl px-3 py-2.5"
                                      value={category.key}
                                    >
                                      {category.label} ({category.count})
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </>
                            ) : null}
                            {categoryOptionGroups.other.length > 0 ? (
                              <>
                                <SelectSeparator className="my-2" />
                                <SelectGroup>
                                  <SelectLabel className="px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.14em]">
                                    Other Moodle categories
                                  </SelectLabel>
                                  {categoryOptionGroups.other.map((category) => (
                                    <SelectItem
                                      key={category.key}
                                      className="rounded-2xl px-3 py-2.5"
                                      value={category.key}
                                    >
                                      {category.label} ({category.count})
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </>
                            ) : null}
                          </SelectContent>
                        </Select>
                        <div className="relative">
                          <Search
                            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                            aria-hidden
                          />
                          <Input
                            className="pl-11"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search courses"
                          />
                        </div>
                      </>
                    ) : selectedCourse ? (
                      <button
                        className="flex items-center gap-3 rounded-3xl bg-secondary px-3 py-3 text-left"
                        type="button"
                        onClick={() => setNavigationMode("courses")}
                      >
                        <CourseThumbnail course={selectedCourse} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{courseTitle(selectedCourse)}</span>
                          <span className="block truncate text-xs text-muted-foreground">{courseSubtitle(selectedCourse)}</span>
                        </span>
                      </button>
                    ) : null}
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto px-3 pb-4">
                    {navigationMode === "courses" ? (
                      loading ? (
                        <LoadingRows label="Loading courses" />
                      ) : filteredCourses.length === 0 ? (
                        <EmptyState title="No courses found" description="Try a different search." />
                      ) : (
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
                                      active
                                        ? "bg-primary text-primary-foreground"
                                        : "hover:bg-accent hover:text-accent-foreground",
                                    )}
                                    type="button"
                                    onClick={() => void loadMaterials(String(course.id))}
                                  >
                                    <CourseThumbnail course={course} active={active} />
                                    <span className="min-w-0 flex-1">
                                      <span className="line-clamp-2 block text-sm font-medium leading-5">
                                        {courseTitle(course)}
                                      </span>
                                      <span
                                        className={cn(
                                          "mt-1 block truncate text-xs",
                                          active ? "text-primary-foreground/70" : "text-muted-foreground",
                                        )}
                                      >
                                        {courseSubtitle(course)}
                                      </span>
                                    </span>
                                  </button>
                                );
                              })}
                            </section>
                          ))}
                        </div>
                      )
                    ) : (
                      <div className="flex flex-col gap-4">
                        <Button className="w-fit" type="button" variant="secondary" onClick={() => setNavigationMode("courses")}>
                          <ArrowLeft aria-hidden />
                          Courses
                        </Button>
                        {materialsLoading ? (
                          <LoadingRows label="Loading materials" />
                        ) : materials.length === 0 ? (
                          <EmptyState
                            title="No materials loaded"
                            description="Go back and choose another course, or refresh Moodle."
                          />
                        ) : (
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
                                      onSelect={() => {
                                        setSelectedMaterialId(material.id);
                                        if (userId) {
                                          writeDashboardCache(userId, {
                                            user,
                                            courses,
                                            materialsByCourseId,
                                            selectedCourseId,
                                            selectedCategory,
                                            selectedMaterialId: material.id,
                                          });
                                        }
                                      }}
                                    />
                                  ))}
                                </div>
                              </section>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </aside>

                <CourseMainPanel
                  course={selectedCourse}
                  courseId={selectedCourseId}
                  material={selectedMaterial}
                  onPDFStateChange={setPDFState}
                  pdfScrollCommand={pdfScrollCommand}
                />
                {codexOpen ? (
                  <CodexPanel
                    courses={courses}
                    materials={materials}
                    onApplyActions={(actions) => void applyCodexActions(actions)}
                    pdfState={pdfState}
                    selectedCourse={selectedCourse}
                    selectedMaterial={selectedMaterial}
                    user={user}
                  />
                ) : null}
              </section>
            )}
          </div>
        </main>
      </Show>
    </>
  );
}

async function apiRequest<T>(path: string): Promise<T> {
  const response = await fetch(`${MOODLE_API_BASE_URL}${path}`);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new APIRequestError(payload?.error ?? `Request failed with ${response.status}`, response.status, payload?.code);
  }

  return payload as T;
}

class APIRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

function isMoodleNotConnected(error: unknown): boolean {
  return error instanceof APIRequestError && error.status === 409 && error.code === "moodle_not_connected";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function pruneMaterialCache(
  materialsByCourseId: Record<string, Material[]>,
  courses: Course[],
): Record<string, Material[]> {
  const courseIds = new Set(courses.map((course) => String(course.id)));
  return Object.fromEntries(
    Object.entries(materialsByCourseId).filter(([courseId]) => courseIds.has(courseId)),
  );
}
