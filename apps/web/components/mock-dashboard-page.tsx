"use client";

import { Bot, RefreshCw, SendHorizontal } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { CourseMainPanel } from "@/components/course-main-panel";
import { CourseThumbnail, MaterialRow } from "@/components/dashboard-ui";
import { MoodleConnectCard } from "@/components/moodle-connect-card";
import { StudyModeActions, type StudyMode } from "@/components/study-mode-actions";
import type { TaskViewResponse } from "@/components/task-study-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { mockCourses, mockMaterialsByCourseId, mockUser } from "@/lib/mock-moodle";
import { courseSubtitle, courseTitle } from "@/lib/dashboard-data";
import type { Material, WebexRecording } from "@/lib/dashboard-data";
import type { PDFScrollCommand, PDFViewState } from "@/lib/pdf-context";
import { EMPTY_STUDY_OUTLINE, type StudyOutline } from "@/lib/study-outline";
import { cn } from "@/lib/utils";

type MockMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const mockRecordings: WebexRecording[] = [
  {
    recordingDate: "2026-05-26",
    recordingName: "Mock Webex Recording",
    recordingUuid: "mock-webex-recording-1",
    sessionTitle: "High Performance Computing",
    streamUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  },
  {
    recordingDate: "2026-05-19",
    recordingName: "Mock Webex Recording",
    recordingUuid: "mock-webex-recording-2",
    sessionTitle: "Parallel workloads",
    streamUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  },
];

const mockRecordingState = {
  loading: false,
  loaded: true,
  error: null,
  recordings: mockRecordings,
};

const mockTaskView: TaskViewResponse = {
  courseId: "mock-hpc",
  generatedAt: "2026-06-07T00:00:00.000Z",
  source: "study-bundle",
  scriptMarkdown: [
    "# High Performance Computing Script",
    "",
    "# 1. Speicherzugriffe und Roofline",
    "Source: [Teil 04](moodle-resource:mock-hpc-wide-slide)",
    "",
    "## 1.1 Schönauer-Vektortriade",
    "Die Vektortriade verbindet Speicherzugriffe mit einer Multiplikation und Addition.",
  ].join("\n"),
  scriptSections: [
    {
      id: "mock-hpc-wide-slide",
      kind: "script-section",
      status: "machine-extracted",
      statusLabel: "Machine extracted",
      title: "High Performance Computing Script",
    },
  ],
  resources: [
    { resourceId: "mock-hpc-wide-slide", title: "Teil 04 (Update 23.04.26)", kind: "slides/pdf" },
    { resourceId: "mock-hpc-portrait", title: "Aufgabenblatt 09", kind: "task/pdf" },
  ],
  sheets: [
    {
      resourceId: "mock-hpc-portrait",
      title: "Aufgabenblatt 01",
      kind: "bundle-task",
      tasks: [
        {
          taskId: "mock-task-1",
          sourceResourceId: "mock-hpc-portrait",
          title: "Task 1",
          contentState: {
            id: "mock-hpc-portrait",
            kind: "task",
            status: "machine-extracted",
            statusLabel: "Machine extracted",
            title: "Aufgabenblatt 01",
          },
          status: "open",
          parts: [],
          promptMarkdown: [
            "# Task 1",
            "",
            "## Schönauer-Vektortriade und superskalare Architektur",
            "",
            "Betrachten Sie die Schönauer-Vektortriade:",
            "",
            "```pseudo",
            "for i <- 1 to N do",
            "  a(i) <- b(i) + c(i) * d(i)",
            "od",
            "```",
            "",
            "Die Schleife soll auf einer superskalaren Architektur ausgeführt werden, die gleichzeitig eine Multiplikation sowie eine Addition berechnen kann.",
            "",
            "Bestimmen Sie, wie viele Zyklen für eine vollständige Iteration nötig sind, wenn der Prozessor pro Zyklus zwei Worte laden und ein Wort speichern kann.",
            "",
            "Bestimmen Sie danach denselben Wert für eine Architektur, die vier Worte laden und zwei Worte speichern kann.",
            "",
            "## Vereinfachende Annahmen",
            "",
            "- Alle skalaren Grössen können in Registern vorgehalten werden.",
            "- Ergebnisse einer arithmetischen Operation werden direkt zurückgeschrieben.",
            "- Instruction Fetch und Decode werden für diese Analyse vernachlässigt.",
            "",
            "## Aufgabe 2",
            "",
            "Bestimmen Sie für dieselbe Vektortriade die Arbeit W, den Speicherverkehr Q und die arithmetische Intensität I = W / Q.",
            "",
            "Entscheiden Sie anhand des Roofline-Modells, ob die Anwendung durch den Speicher oder durch die Berechnung beschränkt wird.",
            "",
            "## Zusatz",
            "",
            "Formulieren Sie Ihre Antwort so, dass die einzelnen Lade-, Speicher- und Rechenoperationen nachvollziehbar sind. Begründen Sie auch, welche Annahme den Flaschenhals bestimmt.",
          ].join("\n"),
        },
      ],
    },
    {
      resourceId: "mock-hpc-wide-slide",
      title: "Aufgabenblatt 02",
      kind: "bundle-task",
      tasks: [
        {
          taskId: "mock-task-2",
          sourceResourceId: "mock-hpc-wide-slide",
          title: "Task 2",
          contentState: {
            id: "mock-hpc-wide-slide",
            kind: "task",
            status: "codex-improved",
            statusLabel: "Codex improved",
            model: "gpt5.3 Codex Spark",
            title: "Aufgabenblatt 02",
          },
          status: "open",
          parts: [],
          promptMarkdown: [
            "# Task 2",
            "",
            "Diskutieren Sie den Speed-up eines parallelen Programms mit seriellem Anteil und vergleichen Sie die Effizienz für mehrere Prozessorzahlen.",
          ].join("\n"),
        },
      ],
    },
  ],
  progress: {
    open: 2,
    done: 0,
    checked: 0,
    correct: 0,
    wrong: 0,
    needsReview: 0,
  },
};

export function MockDashboardPage() {
  useHideClerkDevOverlay();
  const [mockState, setMockState] = useState<string | null>(null);

  const [selectedCourseId, setSelectedCourseId] = useState(String(mockCourses[0]?.id ?? ""));
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [studyMode, setStudyMode] = useState<StudyMode>("materials");
  const [codexOpen, setCodexOpen] = useState(true);
  const [selectedRecording, setSelectedRecording] = useState<WebexRecording | null>(mockRecordings[0] ?? null);
  const [selectedScriptSectionId, setSelectedScriptSectionId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [studyOutline, setStudyOutline] = useState<StudyOutline>(EMPTY_STUDY_OUTLINE);
  const [courseHubOpen, setCourseHubOpen] = useState(false);
  const [pdfState, setPDFState] = useState<PDFViewState | null>(null);
  const [pdfScrollCommand, setPDFScrollCommand] = useState<PDFScrollCommand | null>(null);

  const selectedCourse = useMemo(
    () => mockCourses.find((course) => String(course.id) === selectedCourseId) ?? null,
    [selectedCourseId],
  );
  const materials = mockMaterialsByCourseId[selectedCourseId] ?? [];
  const materialsBySection = useMemo(() => {
    const groups = new Map<string, Material[]>();
    for (const material of materials) {
      const section = material.sectionName?.trim() || "Materialien";
      groups.set(section, [...(groups.get(section) ?? []), material]);
    }
    return [...groups.entries()];
  }, [materials]);
  const selectedMaterial = materials.find((material) => material.id === selectedMaterialId) ?? null;

  useEffect(() => {
    setMockState(new URLSearchParams(window.location.search).get("state"));
  }, []);

  function selectCourse(courseId: string) {
    setSelectedCourseId(courseId);
    setSelectedMaterialId(null);
    setStudyMode("materials");
  }

  function openMaterial(material: Material) {
    setSelectedMaterialId(material.id);
    setStudyMode("materials");
  }

  if (mockState === "disconnected") {
    return <MockDisconnectedDashboard />;
  }

  return (
    <main className="min-h-dvh overflow-x-hidden px-3 py-3 sm:px-6 sm:py-4 lg:h-dvh lg:max-h-dvh lg:overflow-hidden">
      <div className="mx-auto grid min-h-full w-full min-w-0 max-w-[1680px] gap-3 lg:h-full lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-4">
        <header className="flex min-h-0 w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">Moodle</h1>
              <Badge>Mock mode</Badge>
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {mockUser.displayName} · {mockUser.moodleSiteUrl}
            </p>
          </div>
          <Button className="h-11 w-full sm:w-auto" variant="secondary" type="button">
            <RefreshCw aria-hidden />
            Mock refresh
          </Button>
        </header>

        <section className="grid min-h-0 w-full min-w-0 gap-3 pb-8 lg:h-full lg:grid-cols-[360px_minmax(0,1fr)_400px] lg:gap-4 lg:overflow-hidden lg:pb-0">
          <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.5rem] bg-card lg:h-full lg:rounded-[2rem]">
            <div className="px-5 py-5">
              <h2 className="text-base font-semibold tracking-tight">Mock courses</h2>
              <p className="mt-1 text-sm text-muted-foreground">{mockCourses.length} local courses</p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-3 pb-4">
              <div className="flex flex-col gap-1">
                {mockCourses.map((course) => {
                  const active = String(course.id) === selectedCourseId;
                  return (
                    <button
                      key={course.id}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-3xl px-3 py-3 text-left transition-colors",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground",
                      )}
                      onClick={() => selectCourse(String(course.id))}
                      type="button"
                    >
                      <CourseThumbnail active={active} course={course} />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block text-sm font-medium leading-5">{courseTitle(course)}</span>
                        <span className={cn("mt-1 block truncate text-xs", active ? "text-primary-foreground/70" : "text-muted-foreground")}>
                          {courseSubtitle(course)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6">
                <StudyModeActions
                  studyMode={studyMode}
                  onMaterials={() => {
                    setCodexOpen(false);
                    setSelectedTaskId(null);
                    setSelectedScriptSectionId(null);
                    setStudyMode("materials");
                  }}
                  onTasks={() => {
                    setCodexOpen(false);
                    setSelectedMaterialId(null);
                    setSelectedScriptSectionId(null);
                    setStudyMode("tasks");
                  }}
                  onScript={() => {
                    setCodexOpen(false);
                    setSelectedMaterialId(null);
                    setSelectedTaskId(null);
                    setStudyMode("script");
                  }}
                  onFormula={() => {
                    setCodexOpen(false);
                    setSelectedMaterialId(null);
                    setSelectedTaskId(null);
                    setSelectedScriptSectionId(null);
                    setStudyMode("formula");
                  }}
                  onRecordings={() => {
                    setCodexOpen(false);
                    setSelectedMaterialId(null);
                    setStudyMode("recordings");
                  }}
                />
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <h3 className="px-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Materials</h3>
                {materials.map((material) => (
                  <MaterialRow
                    key={material.id}
                    active={material.id === selectedMaterialId}
                    material={material}
                    onSelect={() => openMaterial(material)}
                  />
                ))}
              </div>
            </div>
          </aside>

          <CourseMainPanel
            course={selectedCourse}
            courseHubOpen={courseHubOpen}
            courseId={selectedCourseId}
            materials={materials}
            materialsBySection={materialsBySection}
            materialsLoading={false}
            material={selectedMaterial}
            recordingsState={mockRecordingState}
            selectedRecording={selectedRecording}
            selectedScriptSectionId={selectedScriptSectionId}
            selectedTaskId={selectedTaskId}
            studyMode={studyMode}
            studyOutline={studyOutline}
            onEnterStudyMode={(mode) => {
              setCourseHubOpen(false);
              setStudyMode(mode);
            }}
            onSelectMaterial={openMaterial}
            onSelectScriptSection={setSelectedScriptSectionId}
            onSelectTask={setSelectedTaskId}
            onTaskStatusChange={() => undefined}
            onOpenResource={(resourceId) => {
              const material = materials.find((item) => item.id === resourceId);
              if (material) {
                openMaterial(material);
              }
            }}
            onPDFStateChange={setPDFState}
            onLoadRecordings={() => undefined}
            onPlayRecording={setSelectedRecording}
            onSelectedScriptSectionIdChange={setSelectedScriptSectionId}
            onSelectedTaskIdChange={setSelectedTaskId}
            onSignInWebexBrowser={async () => undefined}
            onStudyOutlineChange={setStudyOutline}
            pdfScrollCommand={pdfScrollCommand}
            taskViewOverride={selectedCourseId === "mock-hpc" ? mockTaskView : undefined}
          />

          <MockCodexPanel
            materials={materials}
            onOpenMaterial={openMaterial}
            onScrollPDF={(page) => setPDFScrollCommand({ id: Date.now(), page })}
            pdfState={pdfState}
            selectedCourseName={selectedCourse ? courseTitle(selectedCourse) : "No course"}
          />
        </section>
      </div>
    </main>
  );
}

function MockDisconnectedDashboard() {
  return (
    <main className="min-h-dvh overflow-x-hidden px-3 py-3 sm:px-6 sm:py-4">
      <div className="mx-auto grid min-h-full w-full min-w-0 max-w-[1680px] gap-4">
        <header className="flex min-h-0 w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">Moodle</h1>
              <Badge>Mock mode</Badge>
            </div>
            <p className="truncate text-sm text-muted-foreground">Moodle connection required</p>
          </div>
          <Button className="h-11 w-full sm:w-auto" variant="secondary" type="button">
            <RefreshCw aria-hidden />
            Mock refresh
          </Button>
        </header>
        <MoodleConnectCard
          reason="Your Moodle connection expired. Connect Moodle again to load fresh courses and materials."
          onConnected={() => undefined}
        />
      </div>
    </main>
  );
}

function useHideClerkDevOverlay() {
  useEffect(() => {
    function hideOverlay() {
      const element = document.getElementById("clerk-components");
      if (!element) {
        return;
      }
      element.style.display = "none";
      element.style.pointerEvents = "none";
    }

    hideOverlay();
    const observer = new MutationObserver(hideOverlay);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}

function MockCodexPanel({
  materials,
  onOpenMaterial,
  onScrollPDF,
  pdfState,
  selectedCourseName,
}: {
  materials: Material[];
  onOpenMaterial: (material: Material) => void;
  onScrollPDF: (page: number) => void;
  pdfState: PDFViewState | null;
  selectedCourseName: string;
}) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<MockMessage[]>([
    {
      id: "hello",
      role: "assistant",
      text: "Mock Codex is ready. Try: open the newest PDF, scroll to page 2, or explain the current page.",
    },
  ]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text) {
      return;
    }

    setPrompt("");
    const lower = text.toLowerCase();
    const pdf = materials.find((material) => material.fileType?.toLowerCase() === "pdf");
    let answer = `Mock response for ${selectedCourseName}.`;

    if (pdf && /(open|öffne|oeffne|pdf|newest|latest|neuste|neueste)/i.test(lower)) {
      onOpenMaterial(pdf);
      answer = `I opened "${pdf.name}" in the preview.`;
    }

    const pageMatch = lower.match(/page\s*(\d+)|seite\s*(\d+)/);
    const page = Number(pageMatch?.[1] ?? pageMatch?.[2] ?? 0);
    if (page > 0) {
      onScrollPDF(page);
      answer = `I scrolled the current PDF to page ${page}.`;
    }

    if (/explain|erkläre|erklaere/.test(lower) && pdfState) {
      const currentPageText = pdfState.pages.find((pageContext) => pageContext.page === pdfState.currentPage)?.text;
      answer = currentPageText
        ? `Current page ${pdfState.currentPage}: ${currentPageText.slice(0, 260)}`
        : `The current PDF is open on page ${pdfState.currentPage}, but page text has not been captured yet.`;
    }

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text },
      { id: crypto.randomUUID(), role: "assistant", text: answer },
    ]);
  }

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] bg-card">
      <div className="flex items-center justify-between gap-3 px-5 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot aria-hidden />
            <h2 className="truncate text-base font-semibold tracking-tight">Codex</h2>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">Mocked locally</p>
        </div>
        <Badge>Mock</Badge>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "rounded-[1.5rem] px-4 py-3 text-sm leading-6",
                message.role === "user" ? "self-end bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
              )}
            >
              <p className="whitespace-pre-wrap">{message.text}</p>
            </div>
          ))}
        </div>
      </div>

      <form className="flex flex-col gap-3 px-4 pb-4" onSubmit={submit}>
        <textarea
          className="min-h-28 w-full resize-none rounded-[1.5rem] bg-secondary px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask mock Codex..."
          value={prompt}
        />
        <Button disabled={prompt.trim().length === 0} type="submit">
          <SendHorizontal aria-hidden />
          Ask Mock Codex
        </Button>
      </form>
    </aside>
  );
}
