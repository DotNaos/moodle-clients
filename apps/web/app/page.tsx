"use client";

import {
  CheckCircle2,
  ExternalLink,
  Loader2,
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
import { APIKeyMenu } from "@/components/api-key-menu";
import { CourseThumbnail, EmptyState, LoadingRows, MaterialRow } from "@/components/dashboard-ui";
import { MoodleConnectCard } from "@/components/moodle-connect-card";
import type { Course, Material, User } from "@/lib/dashboard-data";
import {
  buildCategoryOptions,
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
  const { isLoaded, isSignedIn } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsByCourseId, setMaterialsByCourseId] = useState<Record<string, Material[]>>({});
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
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
      setSelectedCategory("all");
      setError(null);
      setNeedsConnection(false);
      return;
    }

    void loadDashboard();
  }, [isLoaded, isSignedIn]);

  const selectedCourse = useMemo(
    () => courses.find((course) => String(course.id) === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  const categoryOptions = useMemo(() => buildCategoryOptions(courses), [courses]);

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

  async function loadDashboard() {
    materialsRequestId.current += 1;
    setLoading(true);
    setMaterialsLoading(false);
    setError(null);

    try {
      const [userResponse, coursesResponse] = await Promise.all([
        apiRequest<User>("/me"),
        apiRequest<{ courses?: Course[] } | Course[]>("/courses"),
      ]);
      const courseList = normalizeCourses(coursesResponse);

      setUser(userResponse);
      setCourses(courseList);
      setMaterials([]);
      setMaterialsByCourseId({});
      setNeedsConnection(false);
      setSelectedCourseId((current) =>
        current && courseList.some((course) => String(course.id) === current)
          ? current
          : null,
      );
      setSelectedCategory((current) =>
        current === "all" || courseList.some((course) => courseCategoryKey(course) === current)
          ? current
          : "all",
      );
    } catch (loadError) {
      setUser(null);
      setCourses([]);
      setMaterials([]);
      setMaterialsByCourseId({});
      setSelectedCourseId(null);
      setSelectedCategory("all");
      if (isMoodleNotConnected(loadError)) {
        setNeedsConnection(true);
        setError(null);
      } else {
        setNeedsConnection(false);
        setError(getErrorMessage(loadError));
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadMaterials(courseId: string) {
    const cachedMaterials = materialsByCourseId[courseId];
    if (cachedMaterials) {
      materialsRequestId.current += 1;
      setMaterialsLoading(false);
      setSelectedCourseId(courseId);
      setMaterials(cachedMaterials);
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
      setMaterials(nextMaterials);
      setMaterialsByCourseId((current) => ({
        ...current,
        [courseId]: nextMaterials,
      }));
    } catch (loadError) {
      if (materialsRequestId.current !== requestId) {
        return;
      }
      setMaterials([]);
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
                  {loading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                  Refresh
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
                    <label className="sr-only" htmlFor="course-category">
                      Course category
                    </label>
                    <select
                      id="course-category"
                      className="h-11 w-full rounded-full bg-secondary px-4 text-sm text-foreground outline-none transition-colors focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                      value={selectedCategory}
                      onChange={(event) => {
                        materialsRequestId.current += 1;
                        setMaterialsLoading(false);
                        setSelectedCategory(event.target.value);
                        setSelectedCourseId(null);
                        setMaterials([]);
                      }}
                    >
                      <option value="all">All Moodle categories</option>
                      {categoryOptions.map((category) => (
                        <option key={category.key} value={category.key}>
                          {category.label} ({category.count})
                        </option>
                      ))}
                    </select>
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
                      <LoadingRows />
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

                <section className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] bg-card">
                  <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
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
                      <LoadingRows />
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
                                <MaterialRow key={material.id} material={material} />
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                  </div>
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
        <Loader2 className="animate-spin" aria-hidden />
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
