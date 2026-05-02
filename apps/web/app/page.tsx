"use client";

import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Show, SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MoodleConnectCard } from "@/components/moodle-connect-card";
import { cn } from "@/lib/utils";

const MOODLE_API_BASE_URL = "/api/moodle";
const MOODLE_SERVICES_URL =
  process.env.NEXT_PUBLIC_MOODLE_SERVICES_URL ??
  "https://moodle-services.os-home.net";

type User = {
  id: string;
  displayName: string;
  moodleSiteUrl: string;
  moodleUserId: number;
};

type Course = {
  id: number | string;
  fullname?: string;
  fullName?: string;
  shortname?: string;
  shortName?: string;
  category?: string;
  categoryName?: string;
  viewUrl?: string;
};

type Material = {
  id: string;
  name: string;
  url?: string;
  type?: string;
  sectionName?: string;
  fileType?: string;
};

export default function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      setUser(null);
      setCourses([]);
      setMaterials([]);
      setSelectedCourseId(null);
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

  const filteredCourses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return courses;
    }

    return courses.filter((course) =>
      [courseTitle(course), courseSubtitle(course), course.category, course.categoryName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [courses, query]);

  const materialsBySection = useMemo(() => {
    const groups = new Map<string, Material[]>();
    for (const material of materials) {
      const section = material.sectionName?.trim() || "Materialien";
      groups.set(section, [...(groups.get(section) ?? []), material]);
    }
    return [...groups.entries()];
  }, [materials]);

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const [userResponse, coursesResponse] = await Promise.all([
        apiRequest<User>("/me"),
        apiRequest<{ courses?: Course[] } | Course[]>("/courses"),
      ]);
      const courseList = normalizeCourses(coursesResponse);
      const firstCourseId = String(courseList[0]?.id ?? "");

      setUser(userResponse);
      setCourses(courseList);
      setNeedsConnection(false);
      setSelectedCourseId((current) => current ?? firstCourseId);

      if (firstCourseId) {
        await loadMaterials(firstCourseId);
      }
    } catch (loadError) {
      setUser(null);
      setCourses([]);
      setMaterials([]);
      setSelectedCourseId(null);
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
    setMaterialsLoading(true);
    setError(null);
    setSelectedCourseId(courseId);

    try {
      const response = await apiRequest<{ materials?: Material[] } | Material[]>(
        `/courses/${encodeURIComponent(courseId)}/materials`,
      );
      setMaterials(normalizeMaterials(response));
    } catch (loadError) {
      setMaterials([]);
      setError(getErrorMessage(loadError));
    } finally {
      setMaterialsLoading(false);
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
        <main className="min-h-screen px-4 py-4 sm:px-6">
          <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl flex-col gap-4">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                <UserButton />
              </div>
            </header>

            {error ? <Alert>{error}</Alert> : null}

            {needsConnection ? (
              <section className="grid flex-1 place-items-center py-8">
                <MoodleConnectCard
                  onConnected={() => {
                    setNeedsConnection(false);
                    void loadDashboard();
                  }}
                />
              </section>
            ) : (
            <section className="grid min-h-0 flex-1 gap-4 lg:h-[calc(100vh-6rem)] lg:grid-cols-[340px_minmax(0,1fr)]">
              <Card className="flex min-h-[420px] flex-col overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Courses</CardTitle>
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
                </CardHeader>
                <CardContent className="min-h-0 flex-1 overflow-auto px-3 pb-3">
                  {loading ? (
                    <LoadingRows />
                  ) : filteredCourses.length === 0 ? (
                    <EmptyState title="No courses found" description="Try a different search." />
                  ) : (
                    <div className="space-y-1">
                      {filteredCourses.map((course) => {
                        const active = String(course.id) === selectedCourseId;
                        return (
                          <button
                            key={course.id}
                            className={cn(
                              "w-full rounded-2xl px-3 py-3 text-left transition-colors",
                              active
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-accent hover:text-accent-foreground",
                            )}
                            type="button"
                            onClick={() => void loadMaterials(String(course.id))}
                          >
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
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="flex min-h-[520px] flex-col overflow-hidden">
                <CardHeader className="gap-4 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <CardDescription>Selected course</CardDescription>
                    <CardTitle className="mt-1 line-clamp-2">
                      {selectedCourse ? courseTitle(selectedCourse) : "No course selected"}
                    </CardTitle>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {selectedCourse ? courseSubtitle(selectedCourse) : "Choose a course to load materials."}
                    </p>
                  </div>

                  {selectedCourse?.viewUrl ? (
                    <Button asChild variant="secondary">
                      <a href={selectedCourse.viewUrl} target="_blank" rel="noreferrer">
                        Open Moodle <ExternalLink aria-hidden />
                      </a>
                    </Button>
                  ) : null}
                </CardHeader>

                <CardContent className="min-h-0 flex-1 overflow-auto">
                  {materialsLoading ? (
                    <LoadingRows />
                  ) : materials.length === 0 ? (
                    <EmptyState
                      title="No materials loaded"
                      description="Pick a course on the left. Files, PDFs, links, and folders appear here."
                    />
                  ) : (
                    <div className="space-y-6">
                      {materialsBySection.map(([section, sectionMaterials]) => (
                        <section key={section} className="space-y-2">
                          <h2 className="px-1 text-sm font-medium text-muted-foreground">{section}</h2>
                          <div className="space-y-2">
                            {sectionMaterials.map((material) => (
                              <MaterialRow key={material.id} material={material} />
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
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
        <CardContent className="space-y-3">
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

function LoadingRows() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-[260px] place-items-center rounded-2xl bg-muted px-6 text-center">
      <div>
        <FileText className="mx-auto mb-3 text-muted-foreground" aria-hidden />
        <p className="font-medium">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function MaterialRow({ material }: { material: Material }) {
  const isPdf = material.fileType?.toLowerCase() === "pdf" || material.url?.toLowerCase().includes(".pdf");
  const materialType = material.fileType?.toUpperCase() || material.type || "Resource";

  return (
    <a
      className="group flex items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-3 transition-colors hover:bg-accent hover:text-accent-foreground"
      href={material.url ?? "#"}
      target="_blank"
      rel="noreferrer"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground",
            isPdf && "text-destructive",
          )}
        >
          <FileText aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{material.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{materialType}</span>
        </span>
      </span>
      <ExternalLink className="shrink-0 text-muted-foreground transition-colors group-hover:text-current" aria-hidden />
    </a>
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

function normalizeCourses(response: { courses?: Course[] } | Course[]): Course[] {
  if (Array.isArray(response)) {
    return response;
  }
  return response.courses ?? [];
}

function normalizeMaterials(response: { materials?: Material[] } | Material[]): Material[] {
  if (Array.isArray(response)) {
    return response;
  }
  return response.materials ?? [];
}

function courseTitle(course: Course): string {
  return course.fullname ?? course.fullName ?? "Untitled course";
}

function courseSubtitle(course: Course): string {
  return course.shortname ?? course.shortName ?? course.category ?? course.categoryName ?? `Course ${course.id}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
