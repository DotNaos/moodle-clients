"use client";

import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  GraduationCap,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";

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
  heroImage?: string;
};

type Material = {
  id: string;
  name: string;
  url?: string;
  type?: string;
  courseId?: string;
  sectionId?: string;
  sectionName?: string;
  fileType?: string;
};

type SessionState = {
  apiKey: string;
  user: User | null;
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
    if (!apiKey) {
      return;
    }

    void loadDashboard(apiKey);
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
      const key = material.sectionName?.trim() || "Materialien";
      groups.set(key, [...(groups.get(key) ?? []), material]);
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

      setUser(userResponse);
      setCourses(courseList);
      setSelectedCourseId((current) => current ?? String(courseList[0]?.id ?? ""));
      if (courseList[0]) {
        await loadMaterials(key, String(courseList[0].id));
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

  const isConnected = Boolean(apiKey && user);

  return (
    <main className="min-h-screen px-4 py-4 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl flex-col gap-4">
        <header className="flex flex-col gap-4 rounded-[2rem] bg-surface px-5 py-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              <GraduationCap size={24} aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">Moodle</h1>
              <p className="truncate text-sm text-muted">
                Courses, materials, PDFs, and Moodle Services in one private dashboard.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              className="inline-flex h-10 items-center gap-2 rounded-full bg-surface-subtle px-4 text-sm font-medium text-foreground transition hover:bg-accent-soft"
              href={`${API_BASE_URL}/api/docs`}
              target="_blank"
              rel="noreferrer"
            >
              API Docs <ArrowUpRight size={16} aria-hidden />
            </a>
            {isConnected ? (
              <button
                className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90"
                type="button"
                onClick={handleDisconnect}
              >
                <LogOut size={16} aria-hidden /> Disconnect
              </button>
            ) : null}
          </div>
        </header>

        {!isConnected ? (
          <section className="grid flex-1 items-stretch gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="flex flex-col justify-between rounded-[2rem] bg-foreground p-7 text-background shadow-sm sm:p-10">
              <div>
                <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-full bg-white/12">
                  <ShieldCheck size={24} aria-hidden />
                </div>
                <h2 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-6xl">
                  Your hosted Moodle workspace.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-7 text-white/72">
                  The web app talks to Moodle Services. The mobile app stays independent and keeps its Moodle session locally.
                </p>
              </div>

              <div className="mt-10 grid gap-3 text-sm text-white/72 sm:grid-cols-3">
                <Feature icon={<KeyRound size={18} />} label="API-key login" />
                <Feature icon={<BookOpen size={18} />} label="Course browser" />
                <Feature icon={<FileText size={18} />} label="Material viewer" />
              </div>
            </div>

            <form
              className="flex flex-col justify-center rounded-[2rem] bg-surface p-6 shadow-sm sm:p-8"
              onSubmit={handleConnect}
            >
              <div className="mb-7">
                <h2 className="text-2xl font-semibold tracking-tight">Connect Moodle Services</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Paste your private API key. It is stored only in this browser.
                </p>
              </div>

              <label className="mb-2 text-sm font-medium" htmlFor="api-key">
                API key
              </label>
              <input
                id="api-key"
                className="h-14 w-full rounded-full bg-surface-subtle px-5 text-base outline-none ring-0 transition placeholder:text-muted/70 focus:bg-accent-soft"
                type="password"
                value={draftKey}
                onChange={(event) => setDraftKey(event.target.value)}
                placeholder="moodle_live_..."
                autoComplete="off"
              />

              {error ? (
                <p className="mt-4 rounded-3xl bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>
              ) : null}

              <button
                className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-strong"
                type="submit"
              >
                Connect <CheckCircle2 size={18} aria-hidden />
              </button>
            </form>
          </section>
        ) : (
          <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="flex min-h-[620px] flex-col rounded-[2rem] bg-surface p-4 shadow-sm">
              <div className="mb-4 rounded-[1.5rem] bg-surface-subtle p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Signed in</p>
                <p className="mt-1 truncate text-base font-semibold">{user?.displayName}</p>
                <p className="truncate text-xs text-muted">{user?.moodleSiteUrl}</p>
              </div>

              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} aria-hidden />
                <input
                  className="h-12 w-full rounded-full bg-surface-subtle pl-11 pr-4 text-sm outline-none focus:bg-accent-soft"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search courses"
                />
              </div>

              <div className="flex items-center justify-between px-2 pb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">
                <span>{filteredCourses.length} courses</span>
                <button
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 normal-case tracking-normal text-foreground hover:bg-surface-subtle"
                  type="button"
                  onClick={() => void loadDashboard(apiKey)}
                >
                  <RefreshCw size={14} aria-hidden /> Refresh
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto pr-1">
                {loading ? (
                  <LoadingRows label="Loading courses" />
                ) : (
                  <div className="grid gap-2">
                    {filteredCourses.map((course) => {
                      const active = String(course.id) === selectedCourseId;
                      return (
                        <button
                          key={course.id}
                          className={`rounded-[1.35rem] px-4 py-3 text-left transition ${
                            active ? "bg-foreground text-background" : "bg-transparent hover:bg-surface-subtle"
                          }`}
                          type="button"
                          onClick={() => void loadMaterials(apiKey, String(course.id))}
                        >
                          <span className="line-clamp-2 block text-sm font-semibold leading-5">
                            {courseTitle(course)}
                          </span>
                          <span className={`mt-1 block truncate text-xs ${active ? "text-white/65" : "text-muted"}`}>
                            {courseSubtitle(course)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>

            <div className="flex min-h-[620px] flex-col rounded-[2rem] bg-surface p-5 shadow-sm">
              <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Selected course</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">{selectedCourse ? courseTitle(selectedCourse) : "No course selected"}</h2>
                  <p className="mt-1 text-sm text-muted">{selectedCourse ? courseSubtitle(selectedCourse) : "Choose a course to load materials."}</p>
                </div>

                {selectedCourse?.viewUrl ? (
                  <a
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-surface-subtle px-4 text-sm font-medium transition hover:bg-accent-soft"
                    href={selectedCourse.viewUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Moodle <ExternalLink size={16} aria-hidden />
                  </a>
                ) : null}
              </div>

              {error ? (
                <p className="mt-4 rounded-3xl bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>
              ) : null}

              <div className="min-h-0 flex-1 overflow-auto py-4">
                {materialsLoading ? (
                  <LoadingRows label="Loading materials" />
                ) : materials.length === 0 ? (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-[1.5rem] bg-surface-subtle px-6 text-center">
                    <FileText className="mb-3 text-muted" size={34} aria-hidden />
                    <p className="text-base font-semibold">No materials loaded</p>
                    <p className="mt-1 max-w-sm text-sm text-muted">Pick a course on the left. Moodle folders, PDFs, links, and files will appear here.</p>
                  </div>
                ) : (
                  <div className="grid gap-5">
                    {materialsBySection.map(([section, sectionMaterials]) => (
                      <section key={section}>
                        <h3 className="mb-2 px-1 text-sm font-semibold text-muted">{section}</h3>
                        <div className="grid gap-2">
                          {sectionMaterials.map((material) => (
                            <MaterialRow key={material.id} material={material} />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Feature({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2">
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}

function LoadingRows({ label }: { label: string }) {
  return (
    <div className="grid gap-2 px-2 py-4 text-sm text-muted">
      <div className="flex items-center gap-2">
        <Loader2 className="animate-spin" size={16} aria-hidden />
        <span>{label}</span>
      </div>
      <div className="h-16 rounded-[1.35rem] bg-surface-subtle" />
      <div className="h-16 rounded-[1.35rem] bg-surface-subtle" />
      <div className="h-16 rounded-[1.35rem] bg-surface-subtle" />
    </div>
  );
}

function MaterialRow({ material }: { material: Material }) {
  const isPdf = material.fileType?.toLowerCase() === "pdf" || material.url?.toLowerCase().includes(".pdf");

  return (
    <a
      className="group grid gap-2 rounded-[1.35rem] bg-surface-subtle px-4 py-4 transition hover:bg-accent-soft sm:grid-cols-[1fr_auto] sm:items-center"
      href={material.url ?? "#"}
      target="_blank"
      rel="noreferrer"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isPdf ? "bg-red-100 text-danger" : "bg-white text-foreground"}`}>
          <FileText size={18} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{material.name}</p>
          <p className="truncate text-xs text-muted">{material.fileType?.toUpperCase() || material.type || "Resource"}</p>
        </div>
      </div>
      <span className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-white px-3 text-xs font-medium text-foreground transition group-hover:bg-foreground group-hover:text-background">
        Open <ExternalLink size={14} aria-hidden />
      </span>
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
