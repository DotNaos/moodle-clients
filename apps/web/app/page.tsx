"use client";

import { Bot, RefreshCw } from "lucide-react";
import { Show, UserButton, useAuth } from "@clerk/nextjs";
import { useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FullPageLoading, SignedOutHome } from "@/components/home-states";
import { APIKeyMenu } from "@/components/api-key-menu";
import { CodexPanel } from "@/components/codex-panel";
import { CourseMainPanel } from "@/components/course-main-panel";
import { MobileBottomNav, type MobileMoodleTab } from "@/components/mobile-bottom-nav";
import { MoodleConnectCard } from "@/components/moodle-connect-card";
import { MoodleSidebar } from "@/components/moodle-sidebar";
import type { StudyMode } from "@/components/study-mode-actions";
import { Spinner } from "@/components/ui/spinner";
import { useCodexMoodleActions } from "@/hooks/use-codex-moodle-actions";
import { useWebexRecordings } from "@/hooks/use-webex-recordings";
import { clearDashboardCache, readDashboardCache, writeDashboardCache } from "@/lib/dashboard-cache";
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
import {
  apiRequest,
  getErrorMessage,
  getMoodleConnectionMessage,
  isMoodleNotConnected,
  pruneMaterialCache,
} from "@/lib/moodle-api";
import type { PDFScrollCommand, PDFViewState } from "@/lib/pdf-context";
import { EMPTY_STUDY_OUTLINE, type StudyOutline } from "@/lib/study-outline";
import { cn } from "@/lib/utils";

const MOODLE_SERVICES_URL = process.env.NEXT_PUBLIC_MOODLE_SERVICES_URL ?? "https://moodle-services.os-home.net";

export default function Home() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsByCourseId, setMaterialsByCourseId] = useState<Record<string, Material[]>>({});
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [studyMode, setStudyMode] = useState<StudyMode>("materials");
  const [navigationMode, setNavigationMode] = useState<"courses" | "materials">("courses");
  const [homeView, setHomeView] = useState<"courses" | "calendar">("courses");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [codexOpen, setCodexOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMaterialPreviewOpen, setMobileMaterialPreviewOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedScriptSectionId, setSelectedScriptSectionId] = useState<string | null>(null);
  const [studyOutline, setStudyOutline] = useState<StudyOutline>(EMPTY_STUDY_OUTLINE);
  const [pdfState, setPDFState] = useState<PDFViewState | null>(null);
  const [pdfScrollCommand, setPDFScrollCommand] = useState<PDFScrollCommand | null>(null);
  const materialsRequestId = useRef(0);
  const {
    loadRecordings,
    recordingsByCourseId,
    resetRecordings,
    signInWebexBrowser,
    selectRecording,
    selectedRecordingForCourse,
  } = useWebexRecordings();
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
      resetRecordings();
      setSelectedCourseId(null);
      setSelectedMaterialId(null);
      setStudyMode("materials");
      setSelectedTaskId(null);
      setSelectedScriptSectionId(null);
      setStudyOutline(EMPTY_STUDY_OUTLINE);
      setNavigationMode("courses");
      setHomeView("courses");
      setMobileMaterialPreviewOpen(false);
      setSelectedCategory("all");
      setError(null);
      setNeedsConnection(false);
      setConnectionMessage(null);
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
      setStudyMode("materials");
      setSelectedTaskId(null);
      setSelectedScriptSectionId(null);
      setStudyOutline(EMPTY_STUDY_OUTLINE);
      setNavigationMode(cached.selectedCourseId ? "materials" : "courses");
      setHomeView("courses");
      setMobileMaterialPreviewOpen(Boolean(cached.selectedMaterialId));
      setMaterials(cached.selectedCourseId ? cached.materialsByCourseId[cached.selectedCourseId] ?? [] : []);
      setNeedsConnection(false);
      setConnectionMessage(null);
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
    () => studyMode === "materials" ? materials.find((material) => material.id === selectedMaterialId) ?? null : null,
    [materials, selectedMaterialId, studyMode],
  );

  const selectedRecording = selectedRecordingForCourse(selectedCourseId);

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

  const mobileTab: MobileMoodleTab = codexOpen
    ? studyMode === "recordings"
      ? "recordings"
      : studyMode === "formula"
        ? "formula"
      : studyMode === "tasks"
        ? "tasks"
        : studyMode === "script"
          ? "script"
          : "materials"
    : studyMode === "tasks"
      ? "tasks"
      : studyMode === "script"
        ? "script"
        : studyMode === "formula"
          ? "formula"
        : studyMode === "recordings"
          ? "recordings"
          : "materials";
  const mobileShowsMaterialList =
    navigationMode === "materials" && mobileTab === "materials" && !mobileMaterialPreviewOpen;
  const mobileShowsMainPanel =
    mobileTab === "tasks" ||
    mobileTab === "script" ||
    mobileTab === "formula" ||
    studyMode === "recordings" ||
    (mobileTab === "materials" && mobileMaterialPreviewOpen);

  async function loadDashboard(options: { background?: boolean } = {}) {
    if (!userId) {
      return;
    }

    materialsRequestId.current += 1;
    setLoading(!options.background && courses.length === 0);
    setRefreshing(options.background || courses.length > 0);
    setMaterialsLoading(false);
    setError(null);
    setConnectionMessage(null);

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
      setConnectionMessage(null);
      setSelectedCourseId(nextSelectedCourseId);
      setSelectedMaterialId(nextSelectedMaterialId);
      setStudyMode("materials");
      setSelectedTaskId(null);
      setSelectedScriptSectionId(null);
      setNavigationMode((current) => (nextSelectedCourseId && current === "materials" ? "materials" : "courses"));
      setHomeView("courses");
      setMobileMaterialPreviewOpen(Boolean(nextSelectedMaterialId));
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
      if (isMoodleNotConnected(loadError)) {
        handleMoodleDisconnected(loadError);
      } else {
        setNeedsConnection(false);
        setConnectionMessage(null);
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
      setStudyMode("materials");
      setSelectedTaskId(null);
      setSelectedScriptSectionId(null);
      setNavigationMode("materials");
      setHomeView("courses");
      setMobileMaterialPreviewOpen(false);
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
    setStudyMode("materials");
    setSelectedTaskId(null);
    setSelectedScriptSectionId(null);
    setNavigationMode("materials");
    setHomeView("courses");
    setMobileMaterialPreviewOpen(false);
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
      if (isMoodleNotConnected(loadError)) {
        handleMoodleDisconnected(loadError);
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

  async function openRecordings(courseId: string, options: { refresh?: boolean } = {}) {
    setStudyMode("recordings");
    setSelectedMaterialId(null);
    setSelectedTaskId(null);
    setSelectedScriptSectionId(null);
    await loadRecordings(courseId, options);
  }

  function clearMoodleWorkspace() {
    setUser(null);
    setCourses([]);
    setMaterials([]);
    setMaterialsByCourseId({});
    resetRecordings();
    setSelectedCourseId(null);
    setSelectedMaterialId(null);
    setStudyMode("materials");
    setSelectedTaskId(null);
    setSelectedScriptSectionId(null);
    setStudyOutline(EMPTY_STUDY_OUTLINE);
    setNavigationMode("courses");
    setHomeView("courses");
    setMobileMaterialPreviewOpen(false);
    setSelectedCategory("all");
    setMaterialsLoading(false);
  }

  function handleMoodleDisconnected(disconnectError: unknown) {
    materialsRequestId.current += 1;
    if (userId) {
      clearDashboardCache(userId);
    }
    clearMoodleWorkspace();
    setNeedsConnection(true);
    setConnectionMessage(getMoodleConnectionMessage(disconnectError));
    setError(null);
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
        <main className="min-h-dvh overflow-x-hidden px-3 py-3 sm:px-6 sm:py-4 lg:h-dvh lg:max-h-dvh lg:overflow-hidden">
          <div className="mx-auto grid min-h-full w-full min-w-0 max-w-[1680px] gap-3 lg:h-full lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-4">
            <header className="flex min-h-0 w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="w-full min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-2xl">Moodle</h1>
                  <Badge>Signed in</Badge>
                </div>
                <p className="hidden truncate text-sm text-muted-foreground sm:block">
                  {needsConnection
                    ? "Moodle connection required"
                    : user ? `${user.displayName} · ${user.moodleSiteUrl}` : "Loading Moodle workspace"}
                </p>
                <p className="truncate text-xs text-muted-foreground sm:hidden">
                  {needsConnection ? "Connect Moodle" : user ? mobileWorkspaceLabel(user) : "Loading workspace"}
                </p>
              </div>

              <div className="flex w-full min-w-0 items-center gap-2 pb-1 sm:w-auto sm:flex-wrap sm:pb-0">
                <Button className="h-11 px-4" variant="secondary" onClick={() => void loadDashboard()} aria-label="Refresh Moodle">
                  {loading || refreshing ? <Spinner aria-hidden /> : <RefreshCw aria-hidden />}
                  <span className="hidden sm:inline">{refreshing ? "Updating" : "Refresh"}</span>
                </Button>
                <APIKeyMenu />
                <Button
                  className="h-11 px-4"
                  onClick={() => setCodexOpen((current) => !current)}
                  type="button"
                  variant={codexOpen ? "default" : "secondary"}
                >
                  <Bot aria-hidden />
                  <span className="hidden sm:inline">Codex</span>
                </Button>
                <UserButton />
              </div>
            </header>

            {error ? <DashboardNotice message={error} /> : null}

            {needsConnection ? (
              <section className="min-h-0 overflow-auto py-4">
                <MoodleConnectCard
                  reason={connectionMessage}
                  onConnected={() => {
                    setNeedsConnection(false);
                    setConnectionMessage(null);
                    void loadDashboard();
                  }}
                />
              </section>
            ) : (
              <section
                className={cn(
                  "grid min-h-0 w-full min-w-0 gap-3 pb-24 lg:gap-4 lg:pb-0",
                  codexOpen
                    ? sidebarCollapsed
                      ? "lg:grid-cols-[72px_minmax(0,1fr)_420px]"
                      : "lg:grid-cols-[380px_minmax(0,1fr)_420px]"
                    : sidebarCollapsed
                      ? "lg:grid-cols-[72px_minmax(0,1fr)]"
                      : "lg:grid-cols-[380px_minmax(0,1fr)]",
                )}
              >
                <MoodleSidebar
                  categoryOptionGroups={categoryOptionGroups}
                  courseListGroups={courseListGroups}
                  coursesCount={courses.length}
                  filteredCoursesCount={filteredCourses.length}
                  homeView={homeView}
                  loading={loading}
                  materials={materials}
                  materialsBySection={materialsBySection}
                  materialsLoading={materialsLoading}
                  mobileShowsMaterialList={mobileShowsMaterialList}
                  navigationMode={navigationMode}
                  query={query}
                  selectedCategory={selectedCategory}
                  selectedCourse={selectedCourse}
                  selectedCourseId={selectedCourseId}
                  selectedScriptSectionId={selectedScriptSectionId}
                  selectedMaterialId={selectedMaterialId}
                  selectedTaskId={selectedTaskId}
                  sidebarCollapsed={sidebarCollapsed}
                  studyMode={studyMode}
                  studyOutline={studyOutline}
                  onBackToCourses={() => {
                    setMobileMaterialPreviewOpen(false);
                    setNavigationMode("courses");
                    setHomeView("courses");
                  }}
                  onCategoryChange={(value) => {
                    materialsRequestId.current += 1;
                    setMaterialsLoading(false);
                    setSelectedCategory(value);
                    setSelectedCourseId(null);
                    setSelectedMaterialId(null);
                    setStudyMode("materials");
                    setNavigationMode("courses");
                    setHomeView("courses");
                    setMobileMaterialPreviewOpen(false);
                    setMaterials([]);
                  }}
                  onHomeViewChange={(value) => {
                    setCodexOpen(false);
                    setMobileMaterialPreviewOpen(false);
                    setHomeView(value);
                  }}
                  onQueryChange={setQuery}
                  onMaterials={() => {
                    setCodexOpen(false);
                    setMobileMaterialPreviewOpen(false);
                    setSelectedTaskId(null);
                    setSelectedScriptSectionId(null);
                    setStudyMode("materials");
                  }}
                  onFormula={() => {
                    setCodexOpen(false);
                    setSelectedMaterialId(null);
                    setSelectedTaskId(null);
                    setSelectedScriptSectionId(null);
                    setMobileMaterialPreviewOpen(false);
                    setStudyMode("formula");
                  }}
                  onRecordings={() => {
                    setCodexOpen(false);
                    setMobileMaterialPreviewOpen(false);
                    selectedCourseId && void openRecordings(selectedCourseId);
                  }}
                  onScript={() => {
                    setCodexOpen(false);
                    setSelectedMaterialId(null);
                    setSelectedTaskId(null);
                    setMobileMaterialPreviewOpen(false);
                    setStudyMode("script");
                  }}
                  onSelectCourse={(courseId) => void loadMaterials(courseId)}
                  onSelectMaterial={(material) => {
                    setCodexOpen(false);
                    setStudyMode("materials");
                    setSelectedTaskId(null);
                    setSelectedScriptSectionId(null);
                    setSelectedMaterialId(material.id);
                    setMobileMaterialPreviewOpen(true);
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
                  onTasks={() => {
                    setCodexOpen(false);
                    setSelectedMaterialId(null);
                    setSelectedScriptSectionId(null);
                    setMobileMaterialPreviewOpen(false);
                    setStudyMode("tasks");
                  }}
                  onSelectScriptSection={(sectionId) => {
                    setSelectedScriptSectionId(sectionId);
                    setStudyMode("script");
                  }}
                  onSelectTask={(taskId) => {
                    setSelectedTaskId(taskId);
                    setStudyMode("tasks");
                  }}
                  onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
                />

                <div
                  className={cn(
                    "min-w-0",
                    mobileShowsMainPanel ? "block" : "hidden",
                    "lg:block",
                  )}
                >
                  <CourseMainPanel
                    course={selectedCourse}
                    courseId={selectedCourseId}
                    materials={materials}
                    material={selectedMaterial}
                    recordingsState={selectedCourseId ? recordingsByCourseId[selectedCourseId] : undefined}
                    selectedScriptSectionId={selectedScriptSectionId}
                    selectedRecording={selectedRecording}
                    selectedTaskId={selectedTaskId}
                    studyMode={studyMode}
                    onOpenResource={(resourceId) => {
                      const material = materials.find((item) => item.id === resourceId);
                      if (!material) {
                        setError(`Could not find Moodle resource ${resourceId} in the loaded course materials.`);
                        return;
                      }
                      setSelectedMaterialId(material.id);
                      setStudyMode("materials");
                      setSelectedTaskId(null);
                      setSelectedScriptSectionId(null);
                      setNavigationMode("materials");
                      setMobileMaterialPreviewOpen(true);
                      setError(null);
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
                    onPDFStateChange={setPDFState}
                    onLoadRecordings={() => selectedCourseId && void openRecordings(selectedCourseId, { refresh: true })}
                    onPlayRecording={(recording) => {
                      if (!selectedCourseId) {
                        return;
                      }
                      selectRecording(selectedCourseId, recording);
                    }}
                    onSelectedScriptSectionIdChange={setSelectedScriptSectionId}
                    onSelectedTaskIdChange={setSelectedTaskId}
                    onSignInWebexBrowser={(credentials) => {
                      if (!selectedCourseId) {
                        return Promise.reject(new Error("Choose a course before signing in to Webex."));
                      }
                      return signInWebexBrowser(selectedCourseId, credentials);
                    }}
                    onStudyOutlineChange={setStudyOutline}
                    pdfScrollCommand={pdfScrollCommand}
                  />
                </div>
                {codexOpen ? (
                  <CodexPanel
                    courses={courses}
                    materials={materials}
                    onApplyActions={applyCodexActions}
                    pdfState={pdfState}
                    selectedCourse={selectedCourse}
                    selectedMaterial={selectedMaterial}
                    user={user}
                  />
                ) : null}
              </section>
            )}
            {!needsConnection && selectedCourseId && navigationMode === "materials" ? (
              <MobileBottomNav
                activeTab={mobileTab}
                onMaterials={() => {
                  setCodexOpen(false);
                  setMobileMaterialPreviewOpen(false);
                  setNavigationMode("materials");
                  setSelectedTaskId(null);
                  setSelectedScriptSectionId(null);
                  setStudyMode("materials");
                }}
                onTasks={() => {
                  setCodexOpen(false);
                  setMobileMaterialPreviewOpen(false);
                  setNavigationMode("materials");
                  setSelectedMaterialId(null);
                  setSelectedScriptSectionId(null);
                  setStudyMode("tasks");
                }}
                onScript={() => {
                  setCodexOpen(false);
                  setMobileMaterialPreviewOpen(false);
                  setNavigationMode("materials");
                  setSelectedMaterialId(null);
                  setSelectedTaskId(null);
                  setStudyMode("script");
                }}
                onFormula={() => {
                  setCodexOpen(false);
                  setMobileMaterialPreviewOpen(false);
                  setNavigationMode("materials");
                  setSelectedMaterialId(null);
                  setSelectedTaskId(null);
                  setSelectedScriptSectionId(null);
                  setStudyMode("formula");
                }}
                onRecordings={() => {
                  setCodexOpen(false);
                  setMobileMaterialPreviewOpen(false);
                  setNavigationMode("materials");
                  selectedCourseId && void openRecordings(selectedCourseId);
                }}
              />
            ) : null}
          </div>
        </main>
      </Show>
    </>
  );
}

function mobileWorkspaceLabel(user: User): string {
  return user.moodleSiteUrl.replace(/^https?:\/\//, "");
}

function DashboardNotice({ message }: { message: string }) {
  return (
    <div className="min-w-0">
      <Alert className="inline-flex max-w-3xl items-start rounded-2xl px-4 py-3 text-sm font-medium leading-6">
        {message}
      </Alert>
    </div>
  );
}
