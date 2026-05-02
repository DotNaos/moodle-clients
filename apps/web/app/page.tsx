"use client";

import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const API_BASE_URL =
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

const SESSION_STORAGE_KEY = "moodle-web-api-key";

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedKey = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (storedKey) {
      setApiKey(storedKey);
      setDraftKey(storedKey);
    }
  }, []);

  useEffect(() => {
    if (apiKey) {
      void loadDashboard(apiKey);
    }
  }, [apiKey]);

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

  async function loadDashboard(key: string) {
    setLoading(true);
    setError(null);

    try {
      const [userResponse, coursesResponse] = await Promise.all([
        apiRequest<User>("/api/me", key),
        apiRequest<{ courses?: Course[] } | Course[]>("/api/courses", key),
      ]);
      const courseList = normalizeCourses(coursesResponse);
      const firstCourseId = String(courseList[0]?.id ?? "");

      setUser(userResponse);
      setCourses(courseList);
      setSelectedCourseId((current) => current ?? firstCourseId);

      if (firstCourseId) {
        await loadMaterials(key, firstCourseId);
      }
    } catch (loadError) {
      setUser(null);
      setCourses([]);
      setMaterials([]);
      setSelectedCourseId(null);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function loadMaterials(key: string, courseId: string) {
    setMaterialsLoading(true);
    setError(null);
    setSelectedCourseId(courseId);

    try {
      const response = await apiRequest<{ materials?: Material[] } | Material[]>(
        `/api/courses/${encodeURIComponent(courseId)}/materials`,
        key,
      );
      setMaterials(normalizeMaterials(response));
    } catch (loadError) {
      setMaterials([]);
      setError(getErrorMessage(loadError));
    } finally {
      setMaterialsLoading(false);
    }
  }

  function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draftKey.trim();
    if (!trimmed) {
      setError("Enter your Moodle Services API key.");
      return;
    }

    window.localStorage.setItem(SESSION_STORAGE_KEY, trimmed);
    setApiKey(trimmed);
  }

  function handleDisconnect() {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setApiKey("");
    setDraftKey("");
    setUser(null);
    setCourses([]);
    setMaterials([]);
    setSelectedCourseId(null);
    setError(null);
  }

  const connectedUser = apiKey ? user : null;

  if (!connectedUser) {
    return (
      <main className="grid min-h-screen place-items-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader className="pb-4">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <BookOpen aria-hidden />
            </div>
            <CardTitle>Moodle</CardTitle>
            <CardDescription>
              Connect with your private Moodle Services API key.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleConnect}>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="api-key">
                  API key
                </label>
                <Input
                  id="api-key"
                  type="password"
                  value={draftKey}
                  onChange={(event) => setDraftKey(event.target.value)}
                  placeholder="moodle_live_..."
                  autoComplete="off"
                />
              </div>

              {error ? <Alert>{error}</Alert> : null}

              <Button className="w-full" size="lg" type="submit">
                Connect <CheckCircle2 aria-hidden />
              </Button>

              <Button asChild className="w-full" variant="ghost">
                <a href={`${API_BASE_URL}/api/docs`} target="_blank" rel="noreferrer">
                  API docs <ExternalLink aria-hidden />
                </a>
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl flex-col gap-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">Moodle</h1>
              <Badge>Connected</Badge>
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {connectedUser.displayName} · {connectedUser.moodleSiteUrl}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void loadDashboard(apiKey)}>
              {loading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
              Refresh
            </Button>
            <Button variant="ghost" onClick={handleDisconnect}>
              <LogOut aria-hidden />
              Disconnect
            </Button>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}

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
                        onClick={() => void loadMaterials(apiKey, String(course.id))}
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

async function apiRequest<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "X-Moodle-App-Key": apiKey,
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }

  return payload as T;
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
