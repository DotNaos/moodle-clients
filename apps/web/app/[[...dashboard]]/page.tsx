"use client";

import { AlertCircle, MessageSquare, X } from "lucide-react";
import { Show, useAuth } from "@clerk/nextjs";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FullPageLoading, SignedOutHome } from "@/components/home-states";
import { HeaderActionsMenu } from "@/components/header-actions-menu";
import { CalendarPanel } from "@/components/course-calendar-panel";
import { ChatPage } from "@/components/chat-page";
import { CourseMainPanel } from "@/components/course-main-panel";
import { CoursesHomePanel } from "@/components/courses-home-panel";
import { MobileQuickChat } from "@/components/mobile-quick-chat";
import { MoodleConnectCard } from "@/components/moodle-connect-card";
import {
  CalendarEventDetailPanel,
  CalendarEventsPanel,
  ChatSessionsPanel,
  CourseModesPanel,
  LandingPanel,
} from "@/components/navigator-panels";
import { NavigatorSidebar } from "@/components/navigator-sidebar";
import { TopBar } from "@/components/top-bar";
import type { StudyMode } from "@/components/study-mode-actions";
import type { TaskViewResponse } from "@/components/task-study-panel";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import { useCodexMoodleActions } from "@/hooks/use-codex-moodle-actions";
import { useNavigator } from "@/hooks/use-navigator";
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
import type { HomeView } from "@/lib/home-navigation";
import {
  navigatorBreadcrumbs,
  type CourseMode,
  type NavigatorLabelResolvers,
  type NavigatorPath,
} from "@/lib/navigator";
import {
  apiRequest,
  getErrorMessage,
  getMoodleConnectionMessage,
  isMoodleNotConnected,
  pruneMaterialCache,
} from "@/lib/moodle-api";
import type { PDFScrollCommand, PDFViewState } from "@/lib/pdf-context";
import type { StudyChatContext, StudyTestContext } from "@/lib/codex-chat";
import { readRecentChats } from "@/lib/recent-chat-storage";
import { EMPTY_STUDY_OUTLINE, taskDisplayTitle, type StudyOutline } from "@/lib/study-outline";
import { buildTaskLinksByResourceId, taskIdForMaterial } from "@/lib/task-material-links";
import { cn } from "@/lib/utils";

const MOODLE_SERVICES_URL = process.env.NEXT_PUBLIC_MOODLE_SERVICES_URL ?? "https://moodle-services.os-home.net";
const SIDEBAR_WIDTH_STORAGE_KEY = "moodle.dashboard.sidebarWidth";
const SIDEBAR_DEFAULT_WIDTH = 280;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 420;
const CHAT_SIDEBAR_WIDTH_STORAGE_KEY = "moodle.dashboard.chatSidebarWidth";
const CHAT_SIDEBAR_DEFAULT_WIDTH = 400;
const CHAT_SIDEBAR_MIN_WIDTH = 320;
const CHAT_SIDEBAR_MAX_WIDTH = 640;

export default function Home() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const navigator = useNavigator();
  const { path, document: activeDocument } = navigator.state;

  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [materialsByCourseId, setMaterialsByCourseId] = useState<Record<string, Material[]>>({});
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") {
      return SIDEBAR_DEFAULT_WIDTH;
    }
    const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return clampSidebarWidth(Number.isFinite(stored) ? stored : SIDEBAR_DEFAULT_WIDTH);
  });
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);
  // Mobile chat overlay: the chat opens as a bottom sheet over the current
  // screen, so getting back to the task is a single dismiss. The sheet stays
  // mounted after the first open so the conversation survives closing it.
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [mobileChatMounted, setMobileChatMounted] = useState(false);
  const [chatSidebarWidth, setChatSidebarWidth] = useState(() => {
    if (typeof window === "undefined") {
      return CHAT_SIDEBAR_DEFAULT_WIDTH;
    }
    const stored = Number(window.localStorage.getItem(CHAT_SIDEBAR_WIDTH_STORAGE_KEY));
    return clampChatSidebarWidth(Number.isFinite(stored) ? stored : CHAT_SIDEBAR_DEFAULT_WIDTH);
  });
  const [testActivity, setTestActivity] = useState<StudyTestContext | null>(null);
  const [studyOutline, setStudyOutline] = useState<StudyOutline>(EMPTY_STUDY_OUTLINE);
  const [taskView, setTaskView] = useState<TaskViewResponse | null>(null);
  const [pdfState, setPDFState] = useState<PDFViewState | null>(null);
  const [pdfScrollCommand, setPDFScrollCommand] = useState<PDFScrollCommand | null>(null);
  const dashboardBootstrappedUserIdRef = useRef<string | null>(null);
  const pendingMaterialsRef = useRef(new Set<string>());

  const {
    loadRecordings,
    recordingsByCourseId,
    resetRecordings,
    signInWebexBrowser,
    selectRecording,
    selectedRecordingForCourse,
  } = useWebexRecordings();

  // Navigation-derived values: the navigator is the single source of truth,
  // everything the legacy panels expect is computed from it.
  const activeCourseId = useMemo(() => {
    if (activeDocument && "courseId" in activeDocument) {
      return activeDocument.courseId;
    }
    if (path.kind === "course" || path.kind === "course-mode") {
      return path.courseId;
    }
    return null;
  }, [activeDocument, path]);

  const studyMode: StudyMode =
    activeDocument?.kind === "material"
      ? "materials"
      : activeDocument?.kind === "task"
        ? "tasks"
        : activeDocument?.kind === "script-section"
          ? "script"
          : activeDocument?.kind === "formula"
            ? "formula"
            : activeDocument?.kind === "recording"
              ? "recordings"
              : path.kind === "course-mode"
                ? path.mode
                : "materials";

  const selectedMaterialId = activeDocument?.kind === "material" ? activeDocument.materialId : null;
  const selectedTaskId = activeDocument?.kind === "task" ? activeDocument.taskId : null;
  const selectedScriptSectionId = activeDocument?.kind === "script-section" ? activeDocument.sectionId : null;

  const materials = useMemo(
    () => (activeCourseId ? materialsByCourseId[activeCourseId] ?? [] : []),
    [activeCourseId, materialsByCourseId],
  );
  const selectedCourse = useMemo(
    () => courses.find((course) => String(course.id) === activeCourseId) ?? null,
    [courses, activeCourseId],
  );
  const selectedMaterial = useMemo(
    () => (selectedMaterialId ? materials.find((material) => material.id === selectedMaterialId) ?? null : null),
    [materials, selectedMaterialId],
  );
  const selectedRecording = activeDocument?.kind === "recording" ? selectedRecordingForCourse(activeCourseId) : null;

  const calendarEnabled =
    Boolean(isSignedIn) &&
    !needsConnection &&
    (path.kind === "home" ||
      path.kind === "calendar" ||
      activeDocument?.kind === "calendar-grid" ||
      activeDocument?.kind === "calendar-event");
  const calendar = useCalendarEvents(calendarEnabled);

  const dataRef = useRef({ courses, materialsByCourseId, selectedCategory, user });
  dataRef.current = { courses, materialsByCourseId, selectedCategory, user };

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(CHAT_SIDEBAR_WIDTH_STORAGE_KEY, String(chatSidebarWidth));
  }, [chatSidebarWidth]);

  const handleChatSidebarResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = chatSidebarWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const handlePointerMove = (moveEvent: PointerEvent) => {
        setChatSidebarWidth(clampChatSidebarWidth(startWidth - (moveEvent.clientX - startX)));
      };
      const handlePointerUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [chatSidebarWidth],
  );

  const handleSidebarResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = sidebarWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const handlePointerMove = (moveEvent: PointerEvent) => {
        setSidebarWidth(clampSidebarWidth(startWidth + moveEvent.clientX - startX));
      };
      const handlePointerUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [sidebarWidth],
  );

  const resizeSidebarBy = useCallback((delta: number) => {
    setSidebarWidth((current) => clampSidebarWidth(current + delta));
  }, []);

  function handleMoodleDisconnected(disconnectError: unknown) {
    if (userId) {
      clearDashboardCache(userId);
    }
    pendingMaterialsRef.current.clear();
    setUser(null);
    setCourses([]);
    setMaterialsByCourseId({});
    resetRecordings();
    setStudyOutline(EMPTY_STUDY_OUTLINE);
    setTaskView(null);
    setSelectedCategory("all");
    setMaterialsLoading(false);
    setNeedsConnection(true);
    setConnectionMessage(getMoodleConnectionMessage(disconnectError));
    setError(null);
  }

  const ensureCourseMaterials = useCallback(
    async (courseId: string): Promise<Material[]> => {
      const cached = dataRef.current.materialsByCourseId[courseId];
      if (cached) {
        return cached;
      }
      if (pendingMaterialsRef.current.has(courseId)) {
        return [];
      }
      pendingMaterialsRef.current.add(courseId);
      setMaterialsLoading(true);
      try {
        const response = await apiRequest<{ materials?: Material[] } | Material[]>(
          `/courses/${encodeURIComponent(courseId)}/materials`,
        );
        const nextMaterials = normalizeMaterials(response);
        setMaterialsByCourseId((current) => ({ ...current, [courseId]: nextMaterials }));
        if (userId) {
          writeDashboardCache(userId, {
            user: dataRef.current.user,
            courses: dataRef.current.courses,
            materialsByCourseId: { ...dataRef.current.materialsByCourseId, [courseId]: nextMaterials },
            selectedCourseId: courseId,
            selectedCategory: dataRef.current.selectedCategory,
            selectedMaterialId: null,
          });
        }
        return nextMaterials;
      } catch (loadError) {
        if (isMoodleNotConnected(loadError)) {
          handleMoodleDisconnected(loadError);
        } else {
          setError(getErrorMessage(loadError));
        }
        return [];
      } finally {
        pendingMaterialsRef.current.delete(courseId);
        setMaterialsLoading(false);
      }
    },
    // handleMoodleDisconnected is stable enough: it only touches setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );

  async function loadDashboard(options: { background?: boolean } = {}) {
    if (!userId) {
      return;
    }
    setLoading(!options.background && courses.length === 0);
    setRefreshing(options.background || courses.length > 0);
    setError(null);
    setConnectionMessage(null);

    try {
      const [userResponse, coursesResponse] = await Promise.all([
        apiRequest<User>("/me"),
        apiRequest<{ courses?: Course[] } | Course[]>("/courses"),
      ]);
      const courseList = normalizeCourses(coursesResponse);
      const nextMaterialsByCourseId = pruneMaterialCache(materialsByCourseId, courseList);
      const nextSelectedCategory =
        selectedCategory === "all" || courseList.some((course) => courseCategoryKey(course) === selectedCategory)
          ? selectedCategory
          : "all";

      setUser(userResponse);
      setCourses(courseList);
      setMaterialsByCourseId(nextMaterialsByCourseId);
      setNeedsConnection(false);
      setConnectionMessage(null);
      setSelectedCategory(nextSelectedCategory);
      writeDashboardCache(userId, {
        user: userResponse,
        courses: courseList,
        materialsByCourseId: nextMaterialsByCourseId,
        selectedCourseId: activeCourseId,
        selectedCategory: nextSelectedCategory,
        selectedMaterialId,
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

  // Bootstrap on sign-in, reset on sign-out.
  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    if (!isSignedIn) {
      dashboardBootstrappedUserIdRef.current = null;
      pendingMaterialsRef.current.clear();
      setUser(null);
      setCourses([]);
      setMaterialsByCourseId({});
      resetRecordings();
      setStudyOutline(EMPTY_STUDY_OUTLINE);
      setTaskView(null);
      setSelectedCategory("all");
      setError(null);
      setNeedsConnection(false);
      setConnectionMessage(null);
      return;
    }
    if (!userId || dashboardBootstrappedUserIdRef.current === userId) {
      return;
    }
    dashboardBootstrappedUserIdRef.current = userId;

    const cached = readDashboardCache(userId);
    if (cached) {
      setUser(cached.user);
      setCourses(cached.courses);
      setMaterialsByCourseId(cached.materialsByCourseId);
      setSelectedCategory(cached.selectedCategory);
      setNeedsConnection(false);
      setConnectionMessage(null);
      setError(null);
    }
    void loadDashboard({ background: Boolean(cached) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, userId]);

  // Load materials whenever the navigator references a course.
  useEffect(() => {
    if (!isSignedIn || !userId || needsConnection || !activeCourseId) {
      return;
    }
    void ensureCourseMaterials(activeCourseId);
  }, [activeCourseId, ensureCourseMaterials, isSignedIn, needsConnection, userId]);

  // Load recordings when browsing the recordings list or opening a recording.
  const recordingsCourseId = studyMode === "recordings" ? activeCourseId : null;
  useEffect(() => {
    if (!isSignedIn || needsConnection || !recordingsCourseId) {
      return;
    }
    void loadRecordings(recordingsCourseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingsCourseId, isSignedIn, needsConnection]);

  // Restore the selected recording for deep links.
  const recordingDocKey =
    activeDocument?.kind === "recording" ? `${activeDocument.courseId} ${activeDocument.recordingId}` : null;
  useEffect(() => {
    if (!recordingDocKey || !isSignedIn || needsConnection) {
      return;
    }
    const [courseId, recordingId] = recordingDocKey.split(" ");
    void loadRecordings(courseId).then((recordings) => {
      const recording = recordings.find((item) => item.recordingUuid === recordingId);
      if (recording) {
        selectRecording(courseId, recording);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingDocKey, isSignedIn, needsConnection]);

  // Deep links to unknown courses bounce back to the course list.
  const guardCourseId = activeDocument?.kind === "chat-session" ? null : activeCourseId;
  useEffect(() => {
    if (courses.length === 0 || !guardCourseId) {
      return;
    }
    if (!courses.some((course) => String(course.id) === guardCourseId)) {
      navigator.navigate({ path: { kind: "courses" }, document: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, guardCourseId]);

  // Study data belongs to one course at a time.
  useEffect(() => {
    setStudyOutline(EMPTY_STUDY_OUTLINE);
    setTaskView(null);
  }, [activeCourseId]);

  const { applyCodexActions } = useCodexMoodleActions({
    courses,
    materials,
    materialsByCourseId,
    selectedCategory,
    selectedCourseId: activeCourseId,
    user,
    userId,
    pdfState,
    loadMaterials: ensureCourseMaterials,
    onOpenMaterial: (courseId, materialId) => {
      const targetCourseId = courseId ?? activeCourseId;
      if (targetCourseId) {
        navigator.open({ kind: "material", courseId: targetCourseId, materialId });
      }
    },
    onSetTaskStatus: async (taskId, status) => {
      const title = taskTitleForId(taskId, studyOutline, taskView) ?? taskId;
      const question =
        status === "done"
          ? `Codex schlägt vor, "${title}" als erledigt zu markieren. Übernehmen?`
          : `Codex schlägt vor, "${title}" wieder zu öffnen. Übernehmen?`;
      if (window.confirm(question)) {
        await updateTaskStatus(taskId, status);
      }
    },
    setError,
    setPDFScrollCommand,
  });

  async function updateTaskStatus(taskId: string, status: "done" | "open") {
    if (!activeCourseId) {
      return;
    }
    try {
      const response = await fetch(
        `/api/study-pipeline/courses/${encodeURIComponent(activeCourseId)}/study-pipeline/tasks/${encodeURIComponent(taskId)}/status`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Task status failed with ${response.status}.`);
      }
      setStudyOutline((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, status } : task)),
      }));
      setTaskView((current) => {
        if (!current) {
          return current;
        }
        const sheets = current.sheets.map((sheet) => ({
          ...sheet,
          tasks: sheet.tasks.map((task) => (task.taskId === taskId ? { ...task, status } : task)),
        }));
        return { ...current, sheets, progress: summarizeTaskViewProgress(sheets) };
      });
      setError(null);
    } catch (statusError) {
      setError(getErrorMessage(statusError));
    }
  }

  // Derived lists for panels.
  const categoryOptionGroups = useMemo(() => buildCategoryOptionGroups(courses), [courses]);
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

  const taskLinksByResourceId = useMemo(
    () => buildTaskLinksByResourceId(studyOutline.tasks, taskView),
    [studyOutline.tasks, taskView],
  );

  const studyChatContext = useMemo<StudyChatContext>(() => {
    const context: NonNullable<StudyChatContext> = {
      mode: studyMode,
      selectedTask: null,
      selectedScriptSection: null,
      test: studyMode === "tasks" ? testActivity : null,
    };
    if (studyMode === "tasks" && selectedTaskId) {
      const sheet = taskView?.sheets.find((candidate) => candidate.tasks.some((task) => task.taskId === selectedTaskId));
      const task = sheet?.tasks.find((candidate) => candidate.taskId === selectedTaskId) ?? null;
      const source = task
        ? materials.find((material) => material.id === task.sourceResourceId || material.id === sheet?.resourceId)
        : null;
      context.selectedTask = {
        taskId: selectedTaskId,
        title: task?.title ?? studyOutline.tasks.find((item) => item.id === selectedTaskId)?.title ?? selectedTaskId,
        sheetTitle: sheet?.title ?? studyOutline.tasks.find((item) => item.id === selectedTaskId)?.sheetTitle,
        sourceResourceId: task?.sourceResourceId ?? sheet?.resourceId,
        sourceTitle: source?.name ?? sheet?.title,
        status: task?.status ?? studyOutline.tasks.find((item) => item.id === selectedTaskId)?.status,
        promptMarkdown: task
          ? [
              task.promptMarkdown,
              ...task.parts.map((part) => [`### ${part.label ?? "Teilaufgabe"}`, part.promptMarkdown].join("\n\n")),
            ].filter(Boolean).join("\n\n")
          : undefined,
      };
    }
    if (studyMode === "script" && selectedScriptSectionId) {
      const section = studyOutline.scriptSections.find((item) => item.id === selectedScriptSectionId);
      context.selectedScriptSection = {
        sectionId: selectedScriptSectionId,
        title: section?.title ?? selectedScriptSectionId,
      };
    }
    return context;
  }, [materials, selectedScriptSectionId, selectedTaskId, studyMode, studyOutline, taskView, testActivity]);

  const labelResolvers = useMemo<NavigatorLabelResolvers>(
    () => ({
      courseTitle: (courseId) => {
        const course = courses.find((candidate) => String(candidate.id) === courseId);
        return course ? courseTitle(course) : null;
      },
      materialName: (courseId, materialId) =>
        materialsByCourseId[courseId]?.find((material) => material.id === materialId)?.name,
      taskTitle: (_courseId, taskId) => taskTitleForId(taskId, studyOutline, taskView),
      scriptSectionTitle: (_courseId, sectionId) =>
        studyOutline.scriptSections.find((section) => section.id === sectionId)?.title,
      recordingTitle: (courseId, recordingId) =>
        recordingsByCourseId[courseId]?.recordings.find((recording) => recording.recordingUuid === recordingId)
          ?.sessionTitle,
      calendarEventTitle: (eventUid) => calendar.events.find((event) => event.uid === eventUid)?.summary,
      chatSessionTitle: (sessionId) => readRecentChats().find((chat) => chat.id === sessionId)?.title,
    }),
    [calendar.events, courses, materialsByCourseId, recordingsByCourseId, studyOutline, taskView],
  );

  const breadcrumbs = useMemo(
    () => navigatorBreadcrumbs(navigator.state, labelResolvers),
    [labelResolvers, navigator.state],
  );

  function openCourseMode(courseId: string, mode: CourseMode) {
    if (mode === "formula") {
      navigator.open({ kind: "formula", courseId });
    } else {
      navigator.drill({ kind: "course-mode", courseId, mode });
    }
  }

  function openMaterialTask(material: Material) {
    if (!activeCourseId) {
      return;
    }
    const taskId = taskIdForMaterial(material, taskLinksByResourceId);
    if (taskId) {
      navigator.open({ kind: "task", courseId: activeCourseId, taskId });
    }
  }

  const upcomingEventCount = useMemo(
    () => calendar.events.filter((event) => Date.parse(event.end ?? event.start) >= Date.now()).length,
    [calendar.events],
  );

  if (!isLoaded) {
    return <FullPageLoading />;
  }

  const showSplitSidebar = Boolean(activeDocument) && !sidebarHidden;

  const courseMainPanel = (
    <CourseMainPanel
      course={selectedCourse}
      courseHubOpen={false}
      courseId={activeCourseId}
      materials={materials}
      materialsBySection={materialsBySection}
      materialsLoading={materialsLoading}
      material={selectedMaterial}
      recordingsState={activeCourseId ? recordingsByCourseId[activeCourseId] : undefined}
      selectedScriptSectionId={selectedScriptSectionId}
      selectedRecording={selectedRecording}
      selectedTaskId={selectedTaskId}
      studyMode={studyMode}
      studyOutline={studyOutline}
      onEnterStudyMode={(mode) => activeCourseId && openCourseMode(activeCourseId, mode)}
      onSelectMaterial={(material) =>
        activeCourseId && navigator.open({ kind: "material", courseId: activeCourseId, materialId: material.id })
      }
      onSelectScriptSection={(sectionId) =>
        activeCourseId && navigator.open({ kind: "script-section", courseId: activeCourseId, sectionId })
      }
      onSelectTask={(taskId) => activeCourseId && navigator.open({ kind: "task", courseId: activeCourseId, taskId })}
      onTaskStatusChange={(taskId, status) => void updateTaskStatus(taskId, status)}
      onOpenResource={(resourceId) => {
        const material = materials.find((item) => item.id === resourceId);
        if (!material || !activeCourseId) {
          setError(`Could not find Moodle resource ${resourceId} in the loaded course materials.`);
          return;
        }
        setError(null);
        navigator.open({ kind: "material", courseId: activeCourseId, materialId: material.id });
      }}
      onPDFStateChange={setPDFState}
      onLoadRecordings={() => activeCourseId && void loadRecordings(activeCourseId, { refresh: true })}
      onPlayRecording={(recording) => {
        if (!activeCourseId) {
          return;
        }
        selectRecording(activeCourseId, recording);
        navigator.open({ kind: "recording", courseId: activeCourseId, recordingId: recording.recordingUuid });
      }}
      onSelectedScriptSectionIdChange={(sectionId) => {
        if (sectionId && activeCourseId) {
          navigator.open({ kind: "script-section", courseId: activeCourseId, sectionId });
        }
      }}
      onSelectedTaskIdChange={(taskId) => {
        if (taskId && activeCourseId) {
          navigator.open({ kind: "task", courseId: activeCourseId, taskId });
        }
      }}
      onSignInWebexBrowser={(credentials) => {
        if (!activeCourseId) {
          return Promise.reject(new Error("Choose a course before signing in to Webex."));
        }
        return signInWebexBrowser(activeCourseId, credentials);
      }}
      onStudyOutlineChange={setStudyOutline}
      onTaskViewChange={setTaskView}
      onTestActivityChange={setTestActivity}
      pdfScrollCommand={pdfScrollCommand}
    />
  );

  const mainContent: ReactNode = activeDocument
    ? activeDocument.kind === "calendar-grid"
      ? (
        <section className="flex min-h-0 flex-1 flex-col overflow-auto md:h-full">
          <div className="mx-auto w-full max-w-5xl px-4 py-4 md:px-6 md:py-5">
            <CalendarPanel compact scope="all" />
          </div>
        </section>
      )
      : activeDocument.kind === "calendar-event"
        ? (
          <CalendarEventDetailPanel
            error={calendar.error}
            event={calendar.events.find((event) => event.uid === activeDocument.eventUid) ?? null}
            loading={calendar.loading}
            onOpenCourse={(courseName) => {
              const course = courses.find((candidate) => courseTitle(candidate) === courseName);
              if (course) {
                navigator.navigate({ path: { kind: "course", courseId: String(course.id) }, document: null });
              }
            }}
          />
        )
        : activeDocument.kind === "chat-session"
          ? (
            <ChatPage
              courses={courses}
              loadMaterials={ensureCourseMaterials}
              materials={materials}
              pdfState={pdfState}
              selectedCourseId={activeDocument.courseId}
              selectedMaterial={selectedMaterial}
              studyContext={studyChatContext}
              user={user}
              onApplyActions={applyCodexActions}
              onCourseChange={(courseId) =>
                navigator.navigate({
                  path: { kind: "chat" },
                  document: { ...activeDocument, courseId },
                })
              }
            />
          )
          : courseMainPanel
    : path.kind === "home"
      ? (
        <LandingPanel
          courseCount={courses.length > 0 ? courses.length : null}
          eventCount={calendar.events.length > 0 ? upcomingEventCount : null}
          onOpenSection={(section) => navigator.drill(sectionToPath(section))}
        />
      )
      : path.kind === "courses"
        ? (
          <CoursesHomePanel
            categoryOptionGroups={categoryOptionGroups}
            courseListGroups={courseListGroups}
            filteredCoursesCount={filteredCourses.length}
            homeView="courses"
            loading={loading}
            query={query}
            selectedCategory={selectedCategory}
            selectedCourseId={activeCourseId}
            onCategoryChange={setSelectedCategory}
            onQueryChange={setQuery}
            onSelectCourse={(courseId) => navigator.drill({ kind: "course", courseId })}
          />
        )
        : path.kind === "course"
          ? (
            <CourseModesPanel
              course={selectedCourse}
              courseId={path.courseId}
              materialsCount={materialsByCourseId[path.courseId] ? materialsByCourseId[path.courseId].length : null}
              onSelectMode={(mode) => openCourseMode(path.courseId, mode)}
            />
          )
          : path.kind === "course-mode"
            ? courseMainPanel
            : path.kind === "calendar"
              ? (
                <CalendarEventsPanel
                  activeEventUid={null}
                  error={calendar.error}
                  events={calendar.events}
                  loading={calendar.loading}
                  onOpenEvent={(eventUid) => navigator.open({ kind: "calendar-event", eventUid })}
                  onOpenGrid={() => navigator.open({ kind: "calendar-grid" })}
                  variant="full"
                />
              )
              : (
                <ChatSessionsPanel
                  activeSessionId={null}
                  onNewChat={() => navigator.open({ kind: "chat-session", sessionId: null, courseId: null })}
                  onOpenSession={(session) =>
                    navigator.open({ kind: "chat-session", sessionId: session.id, courseId: session.courseId ?? null })
                  }
                  variant="full"
                />
              );

  return (
    <>
      <Show when="signed-out">
        <SignedOutHome moodleServicesUrl={MOODLE_SERVICES_URL} />
      </Show>

      <Show when="signed-in">
        {/* data-mobile-chat lets fixed HUD controls hide themselves via CSS
            while the quick chat overlay is active. */}
        <main
          className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-background"
          data-mobile-chat={mobileChatOpen ? "open" : "closed"}
        >
          <TopBar
            actions={
              <div className="ml-1 flex items-center gap-1">
                {activeDocument?.kind !== "chat-session" ? (
                  // Mobile has the floating chat button instead.
                  <Button
                    aria-label={chatSidebarOpen ? "Chat schließen" : "Chat öffnen"}
                    className={cn("hidden shrink-0 md:inline-flex", chatSidebarOpen ? "bg-secondary text-foreground" : "")}
                    onClick={() => setChatSidebarOpen((current) => !current)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <MessageSquare aria-hidden />
                  </Button>
                ) : null}
                <HeaderActionsMenu
                  loading={loading}
                  refreshing={refreshing}
                  user={user}
                  onRefresh={() => void loadDashboard()}
                />
              </div>
            }
            breadcrumbs={breadcrumbs}
            canGoBack={navigator.canGoBack}
            canGoForward={navigator.canGoForward}
            onBack={navigator.back}
            onForward={navigator.forward}
            onNavigate={navigator.navigate}
            onToggleSidebar={() => setSidebarHidden((current) => !current)}
            showSidebarToggle={Boolean(activeDocument)}
          />

          {error ? <DashboardToast message={error} onDismiss={() => setError(null)} /> : null}

          {/* Global mobile chat button: always at the thumb, on every screen.
              Opens the chat as an overlay sheet, never the dedicated page. */}
          {!needsConnection && activeDocument?.kind !== "chat-session" ? (
            <>
              {!mobileChatOpen ? (
                <button
                  aria-label="Chat öffnen"
                  className="fixed bottom-[max(env(safe-area-inset-bottom),1rem)] right-4 z-30 grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform active:scale-95 md:hidden"
                  onClick={() => {
                    setMobileChatMounted(true);
                    setMobileChatOpen(true);
                  }}
                  type="button"
                >
                  <MessageSquare aria-hidden className="size-5" />
                </button>
              ) : null}
              {mobileChatMounted ? (
                <MobileQuickChat
                  courses={courses}
                  materials={materials}
                  open={mobileChatOpen}
                  pdfState={pdfState}
                  selectedCourseId={activeCourseId}
                  selectedMaterial={selectedMaterial}
                  studyContext={studyChatContext}
                  user={user}
                  onApplyActions={applyCodexActions}
                  onClose={() => setMobileChatOpen(false)}
                />
              ) : null}
            </>
          ) : null}

          {needsConnection ? (
            <section className="min-h-0 flex-1 overflow-auto px-4 py-4">
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
            <div className="flex min-h-0 w-full flex-1">
              {showSplitSidebar ? (
                <div className="hidden shrink-0 md:block md:h-full" style={{ width: sidebarWidth }}>
                  <NavigatorSidebar
                    activeDocument={activeDocument}
                    calendarError={calendar.error}
                    calendarEvents={calendar.events}
                    calendarLoading={calendar.loading}
                    courseListGroups={courseListGroups}
                    coursesLoading={loading}
                    labelResolvers={labelResolvers}
                    materialsBySection={materialsBySection}
                    materialsLoading={materialsLoading}
                    onDrill={navigator.drill}
                    onOpenDocument={navigator.open}
                    onOpenMaterialTask={openMaterialTask}
                    onResizeBy={resizeSidebarBy}
                    onResizeStart={handleSidebarResizeStart}
                    onTaskStatusChange={(taskId, status) => void updateTaskStatus(taskId, status)}
                    path={path}
                    recordingsState={activeCourseId ? recordingsByCourseId[activeCourseId] : undefined}
                    studyOutline={studyOutline}
                  />
                </div>
              ) : null}

              <div className="flex min-h-0 min-w-0 flex-1">
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)] md:overflow-hidden md:pb-0">
                  {mainContent}
                </div>
                {chatSidebarOpen && activeDocument?.kind !== "chat-session" ? (
                  <div
                    className="relative hidden shrink-0 border-l border-border md:block md:h-full"
                    style={{ width: chatSidebarWidth }}
                  >
                    <button
                      aria-label="Chat-Breite anpassen"
                      className="group absolute left-0 top-0 z-10 h-full w-2 -translate-x-1/2 cursor-col-resize touch-none"
                      onKeyDown={(event) => {
                        if (event.key === "ArrowLeft") {
                          event.preventDefault();
                          setChatSidebarWidth((current) => clampChatSidebarWidth(current + 16));
                        }
                        if (event.key === "ArrowRight") {
                          event.preventDefault();
                          setChatSidebarWidth((current) => clampChatSidebarWidth(current - 16));
                        }
                      }}
                      onMouseDown={handleChatSidebarResizeStart}
                      onPointerDown={handleChatSidebarResizeStart}
                      type="button"
                    >
                      <span className="mx-auto block h-full w-1 bg-transparent transition-all group-hover:bg-gradient-to-b group-hover:from-transparent group-hover:via-border group-hover:to-transparent" />
                    </button>
                    <ChatPage
                      courses={courses}
                      loadMaterials={ensureCourseMaterials}
                      materials={materials}
                      pdfState={pdfState}
                      selectedCourseId={activeCourseId}
                      selectedMaterial={selectedMaterial}
                      studyContext={studyChatContext}
                      user={user}
                      variant="sidebar"
                      onApplyActions={applyCodexActions}
                      onClose={() => setChatSidebarOpen(false)}
                      onCourseChange={(courseId) => navigator.drill({ kind: "course", courseId })}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          )}

        </main>
      </Show>
    </>
  );
}

function sectionToPath(section: HomeView): NavigatorPath {
  if (section === "calendar") {
    return { kind: "calendar" };
  }
  if (section === "chat") {
    return { kind: "chat" };
  }
  return { kind: "courses" };
}

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function clampChatSidebarWidth(width: number): number {
  return Math.min(CHAT_SIDEBAR_MAX_WIDTH, Math.max(CHAT_SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function summarizeTaskViewProgress(sheets: TaskViewResponse["sheets"]): TaskViewResponse["progress"] {
  const progress: TaskViewResponse["progress"] = {
    checked: 0,
    correct: 0,
    done: 0,
    needsReview: 0,
    open: 0,
    wrong: 0,
  };
  for (const task of sheets.flatMap((sheet) => sheet.tasks)) {
    switch (task.status) {
      case "done":
        progress.done++;
        progress.checked++;
        break;
      case "checked":
        progress.checked++;
        break;
      case "correct":
        progress.correct++;
        progress.checked++;
        break;
      case "wrong":
        progress.wrong++;
        progress.checked++;
        break;
      case "needs_review":
        progress.needsReview++;
        progress.checked++;
        break;
      default:
        progress.open++;
    }
  }
  return progress;
}

function taskTitleForId(taskId: string, studyOutline: StudyOutline, taskView: TaskViewResponse | null): string | null {
  const sheet = taskView?.sheets.find((candidate) =>
    candidate.tasks.some((task) => task.taskId === taskId || taskId.startsWith(`${task.taskId}-`)),
  );
  const task = sheet?.tasks.find((candidate) => candidate.taskId === taskId || taskId.startsWith(`${candidate.taskId}-`));
  if (task && sheet) {
    return task.title === sheet.title ? sheet.title : taskDisplayTitle(sheet.title, task.title);
  }
  const outlineTask = studyOutline.tasks.find(
    (candidate) => candidate.id === taskId || taskId.startsWith(`${candidate.id}-`),
  );
  return outlineTask ? taskDisplayTitle(outlineTask.sheetTitle, outlineTask.title) : null;
}

function DashboardToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-3 bottom-4 z-40 flex justify-center md:inset-x-auto md:right-4 md:justify-end">
        <div
          role="status"
          className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-full bg-foreground px-3 py-2 text-background shadow-xl"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-background/15">
            <AlertCircle aria-hidden className="size-4" />
          </span>
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{message}</p>
          <Button
            className="h-8 rounded-full bg-background/15 px-3 text-background hover:bg-background/25"
            onClick={() => setDetailsOpen(true)}
            type="button"
            variant="ghost"
          >
            Details
          </Button>
          <button
            aria-label="Meldung schließen"
            className="grid size-8 shrink-0 place-items-center rounded-full text-background/80 transition-colors hover:bg-background/15 hover:text-background"
            onClick={onDismiss}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      </div>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="rounded-3xl border-0 p-5 shadow-2xl ring-0 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fehlerdetails</DialogTitle>
            <DialogDescription>Die vollständige Meldung aus der letzten Anfrage.</DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-auto rounded-2xl bg-secondary px-4 py-3 text-sm leading-6 text-foreground">
            {message}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
