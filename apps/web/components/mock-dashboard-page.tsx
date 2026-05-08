"use client";

import { Bot, RefreshCw, SendHorizontal } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { CourseMainPanel } from "@/components/course-main-panel";
import { CourseThumbnail, MaterialRow } from "@/components/dashboard-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { mockCourses, mockMaterialsByCourseId, mockUser } from "@/lib/mock-moodle";
import { courseSubtitle, courseTitle } from "@/lib/dashboard-data";
import type { Material } from "@/lib/dashboard-data";
import type { PDFScrollCommand, PDFViewState } from "@/lib/pdf-context";
import { cn } from "@/lib/utils";

type MockMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export function MockDashboardPage() {
  useHideClerkDevOverlay();

  const [selectedCourseId, setSelectedCourseId] = useState(String(mockCourses[0]?.id ?? ""));
  const [selectedMaterialId, setSelectedMaterialId] = useState(mockMaterialsByCourseId[selectedCourseId]?.[0]?.id ?? null);
  const [pdfState, setPDFState] = useState<PDFViewState | null>(null);
  const [pdfScrollCommand, setPDFScrollCommand] = useState<PDFScrollCommand | null>(null);

  const selectedCourse = useMemo(
    () => mockCourses.find((course) => String(course.id) === selectedCourseId) ?? null,
    [selectedCourseId],
  );
  const materials = mockMaterialsByCourseId[selectedCourseId] ?? [];
  const selectedMaterial = materials.find((material) => material.id === selectedMaterialId) ?? null;

  function selectCourse(courseId: string) {
    const nextMaterials = mockMaterialsByCourseId[courseId] ?? [];
    setSelectedCourseId(courseId);
    setSelectedMaterialId(nextMaterials[0]?.id ?? null);
  }

  function openMaterial(material: Material) {
    setSelectedMaterialId(material.id);
  }

  return (
    <main className="h-dvh max-h-dvh overflow-hidden px-4 py-4 sm:px-6">
      <div className="mx-auto grid h-full max-w-[1680px] grid-rows-[auto_minmax(0,1fr)] gap-4">
        <header className="flex min-h-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">Moodle</h1>
              <Badge>Mock mode</Badge>
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {mockUser.displayName} · {mockUser.moodleSiteUrl}
            </p>
          </div>
          <Button variant="secondary" type="button">
            <RefreshCw aria-hidden />
            Mock refresh
          </Button>
        </header>

        <section className="grid min-h-0 gap-4 lg:grid-cols-[360px_minmax(0,1fr)_400px]">
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] bg-card">
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
            courseId={selectedCourseId}
            material={selectedMaterial}
            onPDFStateChange={setPDFState}
            pdfScrollCommand={pdfScrollCommand}
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
