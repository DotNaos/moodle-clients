"use client";

import katex from "katex";
import { BookOpenText, CheckCircle2, FileText, MessageCircle, RefreshCw, SendHorizontal } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Course, Material } from "@/lib/dashboard-data";
import { courseTitle } from "@/lib/dashboard-data";
import type { StudyOutline } from "@/lib/study-outline";
import { EMPTY_STUDY_OUTLINE } from "@/lib/study-outline";
import { cn } from "@/lib/utils";

export type TaskViewResponse = {
  courseId: string;
  generatedAt: string;
  scriptMarkdown: string;
  sheets: Array<{
    resourceId: string;
    title: string;
    kind: string;
    solutionResourceId?: string;
    solutionTitle?: string;
    solutionMarkdown?: string;
    tasks: TaskViewTask[];
  }>;
  resources: Array<{
    resourceId: string;
    title: string;
    kind: string;
  }>;
  progress: {
    open: number;
    checked: number;
    correct: number;
    wrong: number;
    needsReview: number;
  };
};

type TaskViewTask = {
  taskId: string;
  sourceResourceId: string;
  title: string;
  promptMarkdown: string;
  parts: Array<{ id: string; label?: string; promptMarkdown: string }>;
  latestAttempt?: {
    userAnswer: string;
    verdict: {
      isCorrect: boolean;
      feedbackMarkdown: string;
      mistakes: string[];
      suggestedNextStep?: string;
    };
  };
  status: "open" | "started" | "checked" | "correct" | "wrong" | "needs_review";
};

export type ScriptPDFMappingItem = {
  areas: string[];
  order: number;
  resourceId: string;
  title: string;
};

type TaskChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

type Mode = "tasks" | "script";

const SCRIPT_INITIAL_BLOCKS = 80;
const SCRIPT_BLOCK_BATCH = 80;

export function TaskStudyPanel({
  course,
  materials,
  mode,
  onOpenResource,
  onSelectedTaskIdChange,
  onSelectedScriptSectionIdChange,
  onStudyOutlineChange,
  onTaskViewChange,
  selectedScriptSectionId,
  selectedTaskId,
}: {
  course: Course | null;
  materials: Material[];
  mode: Mode;
  onOpenResource: (resourceId: string) => void;
  onSelectedTaskIdChange: (taskId: string | null) => void;
  onSelectedScriptSectionIdChange: (sectionId: string | null) => void;
  onStudyOutlineChange: (outline: StudyOutline) => void;
  onTaskViewChange?: (view: TaskViewResponse | null) => void;
  selectedScriptSectionId: string | null;
  selectedTaskId: string | null;
}) {
  const [view, setView] = useState<TaskViewResponse | null>(null);
  const [answer, setAnswer] = useState("");
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatMessages, setChatMessages] = useState<TaskChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [scriptIncluded, setScriptIncluded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const courseId = course ? String(course.id) : null;
  const tasks = useMemo(() => view?.sheets.flatMap((sheet) => sheet.tasks) ?? [], [view]);
  const selectedTask = useMemo(
    () => tasks.find((task) => task.taskId === selectedTaskId) ?? tasks[0] ?? null,
    [selectedTaskId, tasks],
  );
  const selectedSheet = useMemo(
    () => view?.sheets.find((sheet) => sheet.tasks.some((task) => task.taskId === selectedTask?.taskId)) ?? null,
    [selectedTask, view],
  );
  const selectedResource = useMemo(
    () => selectedTask ? resourceTitle(view, materials, selectedTask.sourceResourceId) : null,
    [materials, selectedTask, view],
  );

  useEffect(() => {
    setView(null);
    onSelectedTaskIdChange(null);
    onSelectedScriptSectionIdChange(null);
    onStudyOutlineChange(EMPTY_STUDY_OUTLINE);
    setAnswer("");
    setChatMessages([]);
    setScriptIncluded(false);
    onTaskViewChange?.(null);
    setMessage(null);
    setError(null);
    if (courseId) {
      void loadView(courseId, false, mode === "script");
    }
  }, [courseId]);

  useEffect(() => {
    if (courseId && mode === "script" && view && !scriptIncluded && !loading) {
      void loadView(courseId, false, true);
    }
  }, [courseId, loading, mode, scriptIncluded, view]);

  useEffect(() => {
    if (!selectedTask) {
      setAnswer("");
      setChatMessages([]);
      return;
    }
    setAnswer(selectedTask.latestAttempt?.userAnswer ?? "");
    void loadChat(selectedTask.taskId);
  }, [selectedTask?.taskId]);

  useEffect(() => {
    if (!view) {
      onStudyOutlineChange(EMPTY_STUDY_OUTLINE);
      return;
    }
    onStudyOutlineChange({
      tasks: view.sheets.flatMap((sheet) =>
        sheet.tasks.map((task) => ({
          id: task.taskId,
          sheetTitle: sheet.title,
          status: task.status,
          title: task.title,
        })),
      ),
      scriptSections: extractScriptSections(view.scriptMarkdown),
    });
  }, [onStudyOutlineChange, view]);

  if (!course || !courseId) {
    return (
      <section className="grid min-h-0 flex-1 place-items-center px-8 py-8 text-center">
        <div>
          <FileText className="mx-auto mb-3 text-muted-foreground" aria-hidden />
          <p className="font-medium">No course selected</p>
          <p className="mt-1 text-sm text-muted-foreground">Choose a course before opening tasks or the script.</p>
        </div>
      </section>
    );
  }

  async function loadView(id: string, compile: boolean, includeScript = mode === "script") {
    setLoading(true);
    setError(null);
    setMessage(compile ? (includeScript ? "Building script from Moodle..." : "Building tasks from Moodle...") : null);
    try {
      if (compile) {
        await taskForgeRequest(`/courses/${encodeURIComponent(id)}/compile`, {
          method: "POST",
          body: JSON.stringify({ scriptOnly: includeScript }),
        });
      }
      const nextView = await taskForgeRequest<TaskViewResponse>(
        `/courses/${encodeURIComponent(id)}/task-view?includeScript=${includeScript ? "1" : "0"}`,
      );
      setView(nextView);
      onTaskViewChange?.(nextView);
      setScriptIncluded(includeScript);
      onSelectedTaskIdChange(
        selectedTaskId && nextView.sheets.some((sheet) => sheet.tasks.some((task) => task.taskId === selectedTaskId))
          ? selectedTaskId
          : nextView.sheets[0]?.tasks[0]?.taskId ?? null,
      );
      setMessage(compile ? (includeScript ? "Built script." : `Built ${nextView.sheets.flatMap((sheet) => sheet.tasks).length} tasks.`) : null);
    } catch (loadError) {
      if (!compile && getErrorMessage(loadError).includes("Dataset not found")) {
        await loadView(id, true);
        return;
      }
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function loadChat(taskId: string) {
    try {
      const payload = await taskForgeRequest<{ messages: TaskChatMessage[] }>(`/tasks/${encodeURIComponent(taskId)}/chat`);
      setChatMessages(payload.messages);
    } catch {
      setChatMessages([]);
    }
  }

  async function checkAnswer() {
    if (!selectedTask || !course || !courseId || checking) {
      return;
    }
    const trimmed = answer.trim();
    if (!trimmed) {
      setError("Write an answer before asking Codex to check it.");
      return;
    }

    setChecking(true);
    setError(null);
    setMessage("Codex is checking your answer...");
    try {
      const feedback = await runCodex([
        "Check this student answer against the Moodle task.",
        "Return clear feedback: what is correct, what is wrong or missing, and what to do next.",
        "",
        `Course: ${courseTitle(course)}`,
        `Sheet: ${selectedSheet?.title ?? "Unknown"}`,
        `Task: ${selectedTask.title}`,
        "",
        "Task prompt:",
        taskPromptText(selectedTask),
        "",
        "Student answer:",
        trimmed,
      ].join("\n"));
      await taskForgeRequest(`/tasks/${encodeURIComponent(selectedTask.taskId)}/attempts`, {
        method: "POST",
        body: JSON.stringify({
          userAnswer: trimmed,
          verdict: {
            isCorrect: false,
            confidence: 0.75,
            feedbackMarkdown: feedback.finalResponse,
            mistakes: [],
            suggestedNextStep: "Discuss the feedback with Codex or revise your answer.",
          },
        }),
      });
      await loadView(courseId, false);
      setMessage("Answer checked and saved.");
    } catch (checkError) {
      setError(getErrorMessage(checkError));
    } finally {
      setChecking(false);
    }
  }

  async function sendChat() {
    if (!selectedTask || !course || chatting) {
      return;
    }
    const text = chatPrompt.trim();
    if (!text) {
      return;
    }
    setChatting(true);
    setError(null);
    setChatPrompt("");
    try {
      await taskForgeRequest(`/tasks/${encodeURIComponent(selectedTask.taskId)}/chat`, {
        method: "POST",
        body: JSON.stringify({ role: "user", text }),
      });
      const response = await runCodex([
        "You are helping with this Moodle task. Use the task prompt, latest answer, and chat history.",
        "",
        `Course: ${courseTitle(course)}`,
        `Sheet: ${selectedSheet?.title ?? "Unknown"}`,
        `Task: ${selectedTask.title}`,
        "",
        "Task prompt:",
        taskPromptText(selectedTask),
        "",
        "Latest answer:",
        answer.trim() || "No answer yet.",
        "",
        "Chat history:",
        chatMessages.map((message) => `${message.role}: ${message.text}`).join("\n") || "No previous chat.",
        "",
        "User message:",
        text,
      ].join("\n"));
      await taskForgeRequest(`/tasks/${encodeURIComponent(selectedTask.taskId)}/chat`, {
        method: "POST",
        body: JSON.stringify({ role: "assistant", text: response.finalResponse }),
      });
      await loadChat(selectedTask.taskId);
    } catch (chatError) {
      setError(getErrorMessage(chatError));
    } finally {
      setChatting(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-visible lg:overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between lg:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {mode === "script" ? <BookOpenText aria-hidden className="size-4" /> : <CheckCircle2 aria-hidden className="size-4" />}
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {mode === "script" ? "Script" : "Aufgaben"}
            </h2>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">{courseTitle(course)}</p>
        </div>
        <Button
          className="w-fit"
          disabled={loading}
          onClick={() => void loadView(courseId, true, mode === "script")}
          type="button"
          variant="secondary"
        >
          {loading ? <Spinner aria-hidden /> : <RefreshCw aria-hidden />}
          Aktualisieren
        </Button>
      </div>

      {error ? <div className="mx-4 mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive lg:mx-5">{error}</div> : null}
      {message ? <div className="mx-4 mt-4 rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground lg:mx-5">{message}</div> : null}

      {loading && !view ? (
        <div className="grid min-h-0 flex-1 place-items-center text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><Spinner aria-hidden /> Building study data</span>
        </div>
      ) : mode === "script" ? (
        <div className="min-h-0 flex-1 overflow-visible bg-background px-3 py-4 lg:overflow-auto lg:px-8 lg:py-8">
          <article className="mx-auto max-w-[82ch] rounded-sm border border-border bg-card px-5 py-7 shadow-sm sm:px-10 sm:py-10 lg:px-14">
            <PaperHeading kicker="Course Script" title={courseTitle(course)} subtitle="Generated from Moodle material" />
            <ProgressiveMarkdownBlock
              onCitationClick={onOpenResource}
              selectedSectionId={selectedScriptSectionId}
              text={view?.scriptMarkdown ?? "No script generated yet."}
            />
          </article>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-visible xl:grid-cols-[minmax(0,1fr)_340px] xl:overflow-hidden">
          <aside className="max-h-72 min-h-0 overflow-auto border-b border-border px-3 py-3 lg:hidden">
            {view?.sheets.map((sheet) => (
              <section className="mb-5" key={sheet.resourceId}>
                <h3 className="mb-2 line-clamp-2 px-2 text-xs font-medium uppercase text-muted-foreground">
                  {sheet.title}
                </h3>
                <div className="flex flex-col gap-1">
                  {sheet.tasks.map((task) => (
                    <button
                      className={cn(
                        "rounded-2xl px-3 py-2 text-left text-sm transition-colors",
                        task.taskId === selectedTask?.taskId ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
                      )}
                      key={task.taskId}
                      onClick={() => onSelectedTaskIdChange(task.taskId)}
                      type="button"
                    >
                      <span className="line-clamp-2 font-medium">{task.title}</span>
                      <span className={cn("mt-1 block text-xs", task.taskId === selectedTask?.taskId ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {task.status.replace("_", " ")}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )) ?? null}
          </aside>

          <main className="min-h-0 overflow-visible bg-background px-3 py-4 lg:overflow-auto lg:px-8 lg:py-8">
            {selectedTask ? (
              <article className="mx-auto max-w-[78ch] rounded-sm border border-border bg-card px-5 py-7 shadow-sm sm:px-9 sm:py-9">
                <PaperHeading kicker={selectedSheet?.title ?? "Aufgabenblatt"} title={selectedTask.title} subtitle={selectedResource ?? courseTitle(course)} />
                <div className="mt-6 border-y border-border py-6">
                  <MarkdownBlock onCitationClick={onOpenResource} text={taskPromptText(selectedTask)} />
                </div>
                <label className="mt-5 block text-sm font-medium text-muted-foreground">
                  Deine Lösung
                  <textarea
                    className="mt-2 min-h-36 w-full resize-y rounded-[1.5rem] bg-secondary px-4 py-3 text-sm leading-6 outline-none transition-colors focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => setAnswer(event.target.value)}
                    value={answer}
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button disabled={checking} onClick={() => void checkAnswer()} type="button">
                    {checking ? <Spinner aria-hidden /> : <CheckCircle2 aria-hidden />}
                    Mit Codex prüfen
                  </Button>
                </div>
                {selectedTask.latestAttempt?.verdict.feedbackMarkdown ? (
                  <section className="mt-6 rounded-[1.5rem] bg-secondary px-5 py-4">
                    <h4 className="mb-3 flex items-center gap-2 font-semibold">
                      <MessageCircle aria-hidden className="size-4" />
                      Feedback
                    </h4>
                    <MarkdownBlock onCitationClick={onOpenResource} text={selectedTask.latestAttempt.verdict.feedbackMarkdown} />
                  </section>
                ) : null}

                <section className="mt-6 border-t border-border pt-5">
                  <h4 className="font-semibold">Chat zu dieser Aufgabe</h4>
                  <div className="mt-3 flex flex-col gap-2">
                    {chatMessages.map((chat) => (
                      <div
                        className={cn(
                          "rounded-[1.25rem] px-4 py-3 text-sm leading-6",
                          chat.role === "user" ? "self-end bg-primary text-primary-foreground" : "bg-secondary",
                        )}
                        key={chat.id}
                      >
                        <MarkdownBlock onCitationClick={onOpenResource} text={chat.text} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <textarea
                      className="min-h-20 flex-1 resize-y rounded-[1.5rem] bg-secondary px-4 py-3 text-sm outline-none focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                      onChange={(event) => setChatPrompt(event.target.value)}
                      placeholder="Nachfrage stellen..."
                      value={chatPrompt}
                    />
                    <Button className="sm:self-start" disabled={chatting || !chatPrompt.trim()} onClick={() => void sendChat()} type="button">
                      {chatting ? <Spinner aria-hidden /> : <SendHorizontal aria-hidden />}
                      Senden
                    </Button>
                  </div>
                </section>
              </article>
            ) : (
              <div className="grid min-h-80 place-items-center text-center text-sm text-muted-foreground">
                <div>
                  <FileText className="mx-auto mb-3" aria-hidden />
                  Keine Aufgaben gefunden.
                </div>
              </div>
            )}
          </main>
          <aside className="min-h-0 overflow-visible border-t border-border px-4 py-5 lg:col-span-2 lg:overflow-auto xl:col-span-1 xl:border-l xl:border-t-0">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Quelle</p>
                <h4 className="mt-1 text-sm font-semibold">{selectedResource ?? selectedSheet?.title ?? "Moodle resource"}</h4>
                {selectedTask ? (
                  <Button className="mt-3" onClick={() => onOpenResource(selectedTask.sourceResourceId)} type="button" variant="secondary">
                    Aufgabenblatt öffnen
                  </Button>
                ) : null}
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Lösung</p>
                {selectedSheet?.solutionResourceId ? (
                  <>
                    <h4 className="mt-1 text-sm font-semibold">{selectedSheet.solutionTitle ?? "Lösung"}</h4>
                    <Button className="mt-3" onClick={() => onOpenResource(selectedSheet.solutionResourceId!)} type="button" variant="secondary">
                      Lösungs-PDF öffnen
                    </Button>
                    {selectedSheet.solutionMarkdown ? (
                      <div className="mt-4 border-t border-border pt-4 lg:max-h-[36rem] lg:overflow-auto">
                        <MarkdownBlock onCitationClick={onOpenResource} text={selectedSheet.solutionMarkdown} />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Keine Moodle-Lösung gefunden. Codex prüft deine Antwort direkt gegen Aufgabe und Kurskontext.
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function taskPromptText(task: TaskViewTask): string {
  return [
    task.promptMarkdown,
    ...task.parts.map((part) => [`### ${part.label ?? "Teilaufgabe"}`, part.promptMarkdown].join("\n\n")),
  ].filter(Boolean).join("\n\n");
}

function PaperHeading({ kicker, subtitle, title }: { kicker?: string | null; subtitle?: string | null; title: string }) {
  return (
    <header className="border-b border-border pb-5">
      {kicker ? (
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{kicker}</p>
      ) : null}
      <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
        {title}
      </h3>
      {subtitle ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{subtitle}</p>
      ) : null}
    </header>
  );
}

function MarkdownBlock({ onCitationClick, text }: { onCitationClick?: (resourceId: string) => void; text: string }) {
  return (
    <div className="paper-markdown space-y-4 break-words text-[0.98rem] leading-7 text-foreground" onClick={(event) => handleMarkdownClick(event, onCitationClick)}>
      {renderMarkdownBlocks(splitMarkdownBlocks(text)).map((block, index) => (
        <div key={index} dangerouslySetInnerHTML={{ __html: block }} />
      ))}
    </div>
  );
}

function ProgressiveMarkdownBlock({
  onCitationClick,
  selectedSectionId,
  text,
}: {
  onCitationClick?: (resourceId: string) => void;
  selectedSectionId: string | null;
  text: string;
}) {
  const blocks = useMemo(() => splitMarkdownBlocks(text), [text]);
  const sections = useMemo(() => extractScriptSections(text), [text]);
  const [visibleBlocks, setVisibleBlocks] = useState(SCRIPT_INITIAL_BLOCKS);
  const displayedBlocks = useMemo(() => renderMarkdownBlocks(blocks.slice(0, visibleBlocks)), [blocks, visibleBlocks]);

  useEffect(() => {
    setVisibleBlocks(SCRIPT_INITIAL_BLOCKS);
  }, [text]);

  useEffect(() => {
    if (!selectedSectionId) {
      return;
    }
    const section = sections.find((item) => item.id === selectedSectionId);
    if (!section) {
      return;
    }
    setVisibleBlocks((current) => Math.max(current, section.blockIndex + SCRIPT_BLOCK_BATCH));
    window.setTimeout(() => {
      document.getElementById(selectedSectionId)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 50);
  }, [sections, selectedSectionId]);

  const hiddenBlocks = Math.max(0, blocks.length - visibleBlocks);

  return (
    <div className="paper-markdown mt-7 space-y-4 break-words text-[0.98rem] leading-7 text-foreground" onClick={(event) => handleMarkdownClick(event, onCitationClick)}>
      {displayedBlocks.map((block, index) => (
        <div key={index} dangerouslySetInnerHTML={{ __html: block }} />
      ))}
      {hiddenBlocks > 0 ? (
        <div className="sticky bottom-0 -mx-4 border-t border-border bg-card/95 px-4 py-4 backdrop-blur lg:-mx-6 lg:px-6">
          <Button
            onClick={() => setVisibleBlocks((current) => Math.min(current + SCRIPT_BLOCK_BATCH, blocks.length))}
            type="button"
            variant="secondary"
          >
            Weitere Abschnitte laden
          </Button>
          <span className="ml-3 align-middle text-xs text-muted-foreground">
            {Math.min(visibleBlocks, blocks.length)} / {blocks.length}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function splitMarkdownBlocks(text: string): string[] {
  return text.trim().split(/\n{2,}/).filter(Boolean);
}

function renderMarkdownBlocks(blocks: string[]): string[] {
  const rendered: string[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (isSourceBlock(block)) {
      rendered.push(renderSourceLinks(block));
      continue;
    }
    const nextBlock = blocks[index + 1];
    if (isHeadingBlock(block) && nextBlock && isSourceBlock(nextBlock)) {
      rendered.push(renderMarkdownBlock(block, nextBlock));
      index += 1;
      continue;
    }
    rendered.push(renderMarkdownBlock(block));
  }
  return rendered;
}

function renderMarkdownBlock(block: string, sourceBlock?: string): string {
  if (block.startsWith("```")) {
    return `<pre class="overflow-auto rounded-md border border-border bg-secondary p-4 font-mono text-xs leading-5 text-foreground">${escapeHtml(block.replace(/^```[a-z]*\n?/i, "").replace(/```$/, ""))}</pre>`;
  }
  const heading = block.match(/^(#{1,3})\s+(.+)$/);
  if (heading) {
    const level = heading[1].length + 2;
    const sizeClass = level <= 3 ? "text-xl" : "text-lg";
    const id = headingAnchorId(heading[2]);
    return `<div id="${id}" class="mt-7 flex scroll-mt-24 flex-col gap-2 border-b border-border pb-1 sm:flex-row sm:items-baseline sm:justify-between"><h${level} class="${sizeClass} font-semibold tracking-tight text-foreground">${inlineMarkdown(heading[2])}</h${level}>${sourceBlock ? renderSourceLinks(sourceBlock) : ""}</div>`;
  }
  if (hasMixedSlideLines(block)) {
    return block.split("\n")
      .map(cleanSlideLine)
      .filter(Boolean)
      .map((line) => `<p>${inlineMarkdown(line)}</p>`)
      .join("");
  }
  if (/^[-*]\s+/m.test(block)) {
    const items = block.split("\n").filter(Boolean).map(cleanListItem);
    return `<ul class="ml-6 list-disc space-y-1">${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`;
  }
  return `<p>${inlineMarkdown(block).replace(/\n/g, "<br />")}</p>`;
}

function hasMixedSlideLines(block: string): boolean {
  const lines = block.split("\n").filter((line) => line.trim());
  return lines.some((line) => !isListLine(line)) && lines.some(isListLine);
}

function isListLine(line: string): boolean {
  return /^(?:\s*•\s*)?\s*[-*]\s+/.test(line);
}

function cleanSlideLine(line: string): string {
  return cleanListItem(line).trim();
}

function cleanListItem(line: string): string {
  return line.replace(/^\s*•\s*/, "").replace(/^\s*[-*]\s+/, "");
}

function inlineMarkdown(text: string): string {
  const escaped = escapeHtml(text);
  return renderMath(escaped)
    .replace(/\[([^\]]+)\]\(moodle-resource:([^)]+)\)/g, (_, label: string, resourceId: string) => {
      const decodedId = decodeHtml(resourceId);
      return `<button class="inline max-w-full p-0 text-left text-[0.9em] font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900" data-moodle-resource-id="${escapeHtml(decodedId)}" type="button">${label}</button>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code class=\"rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em]\">$1</code>");
}

function isHeadingBlock(block: string): boolean {
  return /^(#{1,3})\s+(.+)$/.test(block);
}

function isSourceBlock(block: string): boolean {
  return /^(source|task source|solution source)\s*:/i.test(block.trim());
}

function renderSourceLinks(block: string): string {
  return `<span class="inline-flex flex-wrap gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground">${inlineMarkdown(block)}</span>`;
}

export function renderScriptMarkdownHTML(markdown: string): string {
  return renderMarkdownBlocks(splitMarkdownBlocks(markdown)).join("");
}

export function extractScriptSections(markdown: string) {
  return splitMarkdownBlocks(markdown)
    .map((block, blockIndex) => {
      const heading = block.match(/^(#{1,3})\s+(.+)$/);
      if (!heading) {
        return null;
      }
      return {
        blockIndex,
        id: headingAnchorId(heading[2]),
        level: heading[1].length,
        title: stripMarkdown(heading[2]),
      };
    })
    .filter((section): section is { blockIndex: number; id: string; level: number; title: string } => Boolean(section));
}

export function buildScriptPDFMapping(
  markdown: string,
  resources: Array<{ kind: string; resourceId: string; title: string }>,
): ScriptPDFMappingItem[] {
  const pdfResources = resources.filter((resource) => resource.kind.toLowerCase().includes("pdf"));
  const resourceById = new Map(pdfResources.map((resource) => [normalizeMoodleResourceId(resource.resourceId), resource]));
  const mappingById = new Map<string, ScriptPDFMappingItem>();
  let currentArea = "Course script";

  splitMarkdownBlocks(markdown).forEach((block) => {
    const heading = block.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      currentArea = stripMarkdown(heading[2]);
    }

    for (const match of block.matchAll(/\]\(moodle-resource:([^)]+)\)/g)) {
      const resourceId = normalizeMoodleResourceId(decodeHtml(match[1]));
      const resource = resourceById.get(resourceId);
      if (!resource) {
        continue;
      }
      const item = mappingById.get(resourceId) ?? {
        areas: [],
        order: mappingById.size + 1,
        resourceId,
        title: resource.title,
      };
      if (!item.areas.includes(currentArea)) {
        item.areas.push(currentArea);
      }
      mappingById.set(resourceId, item);
    }
  });

  for (const resource of pdfResources) {
    const resourceId = normalizeMoodleResourceId(resource.resourceId);
    if (!mappingById.has(resourceId)) {
      mappingById.set(resourceId, {
        areas: [],
        order: mappingById.size + 1,
        resourceId,
        title: resource.title,
      });
    }
  }

  return Array.from(mappingById.values());
}

function normalizeMoodleResourceId(resourceId: string): string {
  return resourceId.replace(/^\/+/, "");
}

function headingAnchorId(value: string): string {
  const stripped = stripMarkdown(value);
  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `section-${slug || "untitled"}`;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#]/g, "")
    .trim();
}

function renderMath(value: string): string {
  return value
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: true, throwOnError: false }))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: true, throwOnError: false }))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, expression: string) => katex.renderToString(unescapeHtml(expression), { displayMode: false, throwOnError: false }));
}

function handleMarkdownClick(
  event: React.MouseEvent<HTMLDivElement>,
  onCitationClick: ((resourceId: string) => void) | undefined,
) {
  if (!onCitationClick) {
    return;
  }
  const target = event.target instanceof HTMLElement
    ? event.target.closest<HTMLElement>("[data-moodle-resource-id]")
    : null;
  const resourceId = target?.dataset.moodleResourceId;
  if (!resourceId) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  onCitationClick(decodeURIComponent(resourceId));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function decodeHtml(value: string): string {
  return unescapeHtml(value);
}

function resourceTitle(view: TaskViewResponse | null, materials: Material[], resourceId: string): string | null {
  return view?.resources.find((resource) => resource.resourceId === resourceId)?.title
    ?? materials.find((material) => material.id === resourceId)?.name
    ?? null;
}

async function taskForgeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/task-forge${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    const errorMessage = payload && typeof payload === "object" && "error" in payload
      ? String(payload.error)
      : `Task Forge failed with ${response.status}.`;
    throw new Error(errorMessage);
  }
  return payload as T;
}

async function runCodex(prompt: string): Promise<{ finalResponse: string }> {
  const response = await fetch("/api/codex/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt,
      moodleContext: { source: "task-study" },
      stream: false,
    }),
  });
  const payload = await response.json().catch(() => ({})) as { finalResponse?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Codex failed with ${response.status}.`);
  }
  return { finalResponse: payload.finalResponse ?? "" };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
