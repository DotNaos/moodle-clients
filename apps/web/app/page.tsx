"use client";

import {
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Show, SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CourseThumbnail, EmptyState, LoadingRows, MaterialRow } from "@/components/dashboard-ui";
import { FileViewer } from "@/components/file-viewer";
import { MoodleConnectCard } from "@/components/moodle-connect-card";
import { Spinner } from "@/components/ui/spinner";
import { readDashboardCache, writeDashboardCache } from "@/lib/dashboard-cache";
import type { Course, Material, User } from "@/lib/dashboard-data";
import {
  buildCategoryOptionGroups,
  courseCategoryKey,
  courseSubtitle,
  courseTitle,
  normalizeCourses,
  normalizeMaterials,
} from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

const MOODLE_API_BASE_URL = "/api/moodle";
const MOODLE_SERVICES_URL =
  process.env.NEXT_PUBLIC_MOODLE_SERVICES_URL ??
  "https://moodle-services.os-home.net";

export default function Home() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsByCourseId, setMaterialsByCourseId] = useState<Record<string, Material[]>>({});
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const materialsRequestId = useRef(0);

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

  async function loadMaterials(courseId: string) {
    const cachedMaterials = materialsByCourseId[courseId];
    if (cachedMaterials) {
      const nextSelectedMaterialId =
        selectedMaterialId && cachedMaterials.some((material) => material.id === selectedMaterialId)
          ? selectedMaterialId
          : cachedMaterials[0]?.id ?? null;
      materialsRequestId.current += 1;
      setMaterialsLoading(false);
      setSelectedCourseId(courseId);
      setMaterials(cachedMaterials);
      setSelectedMaterialId(nextSelectedMaterialId);
      if (userId) {
        writeDashboardCache(userId, {
          user,
          courses,
          materialsByCourseId,
          selectedCourseId: courseId,
          selectedCategory,
          selectedMaterialId: nextSelectedMaterialId,
        });
      }
      return;
    }

    setMaterialsLoading(true);
    setError(null);
    setSelectedCourseId(courseId);
    const requestId = materialsRequestId.current + 1;
    materialsRequestId.current = requestId;

    try {
      const response = await apiRequest<{ materials?: Material[] } | Material[]>(
        `/courses/${encodeURIComponent(courseId)}/materials`,
      );
      const nextMaterials = normalizeMaterials(response);
      if (materialsRequestId.current !== requestId) {
        return;
      }
      const nextSelectedMaterialId = nextMaterials[0]?.id ?? null;
      setMaterials(nextMaterials);
      setSelectedMaterialId(nextSelectedMaterialId);
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
          selectedMaterialId: nextSelectedMaterialId,
        });
      }
    } catch (loadError) {
      if (materialsRequestId.current !== requestId) {
        return;
      }
      setMaterials([]);
      setSelectedMaterialId(null);
      setError(getErrorMessage(loadError));
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
        <SignedOutHome />
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
              <section className="grid min-h-0 gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
                <aside className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] bg-card">
                  <div className="flex flex-col gap-3 px-5 py-5">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-base font-semibold tracking-tight">Courses</h2>
                      <span className="text-xs text-muted-foreground">
                        {filteredCourses.length} / {courses.length}
                      </span>
                    </div>
                    <Select
                      value={selectedCategory}
                      onValueChange={(value) => {
                        materialsRequestId.current += 1;
                        setMaterialsLoading(false);
                        setSelectedCategory(value);
                        setSelectedCourseId(null);
                        setSelectedMaterialId(null);
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
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto px-3 pb-4">
                    {loading ? (
                      <LoadingRows label="Loading courses" />
                    ) : filteredCourses.length === 0 ? (
                      <EmptyState title="No courses found" description="Try a different search." />
                    ) : (
                      <div className="flex flex-col gap-1">
                        {filteredCourses.map((course) => {
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
                      </div>
                    )}
                  </div>
                </aside>

                <section className="grid min-h-0 overflow-hidden rounded-[2rem] bg-card xl:grid-cols-[430px_minmax(0,1fr)]">
                  <div className="flex min-h-0 flex-col overflow-hidden">
                    <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-start sm:justify-between xl:flex-col">
                      <div className="flex min-w-0 items-start gap-4">
                        {selectedCourse ? <CourseThumbnail course={selectedCourse} size="large" /> : null}
                        <div className="min-w-0">
                          <p className="text-sm text-muted-foreground">Selected course</p>
                          <h2 className="mt-1 line-clamp-2 text-xl font-semibold tracking-tight">
                            {selectedCourse ? courseTitle(selectedCourse) : "No course selected"}
                          </h2>
                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {selectedCourse ? courseSubtitle(selectedCourse) : "Choose a course to load materials."}
                          </p>
                        </div>
                      </div>

                      {selectedCourse?.viewUrl ? (
                        <Button asChild variant="secondary">
                          <a href={selectedCourse.viewUrl} target="_blank" rel="noreferrer">
                            Open Moodle <ExternalLink aria-hidden />
                          </a>
                        </Button>
                      ) : null}
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
                      {materialsLoading ? (
                        <LoadingRows label="Loading materials" />
                      ) : materials.length === 0 ? (
                        <EmptyState
                          title="No materials loaded"
                          description="Pick a course on the left. Materials load only when you open a course."
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
                  </div>
                  <FileViewer courseId={selectedCourseId} material={selectedMaterial} />
                </section>
              </section>
            )}
          </div>
        </main>
      </Show>
    </>
  );
}

function SignedOutHome() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-4">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShieldCheck aria-hidden />
          </div>
          <CardTitle>Moodle</CardTitle>
          <CardDescription>
            Sign in to open your private Moodle workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <SignInButton mode="modal">
            <Button className="w-full" size="lg">
              Sign in <CheckCircle2 aria-hidden />
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button className="w-full" variant="secondary">
              Create account
            </Button>
          </SignUpButton>
          <Button asChild className="w-full" variant="ghost">
            <a href={`${MOODLE_SERVICES_URL}/api/docs`} target="_blank" rel="noreferrer">
              API docs <ExternalLink aria-hidden />
            </a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function FullPageLoading() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-hidden />
        Loading
      </div>
    </main>
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
