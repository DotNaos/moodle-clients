"use client";

import { Bot, SendHorizontal, ShieldCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Course, Material, User } from "@/lib/dashboard-data";
import { courseSubtitle, courseTitle } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

type CodexPanelProps = {
  user: User | null;
  courses: Course[];
  selectedCourse: Course | null;
  materials: Material[];
  selectedMaterial: Material | null;
};

type CodexMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type CodexResponse = {
  threadId?: string | null;
  finalResponse?: string;
  error?: string;
};

export function CodexPanel({
  user,
  courses,
  selectedCourse,
  materials,
  selectedMaterial,
}: CodexPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CodexMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contextSummary = useMemo(() => {
    if (selectedMaterial) {
      return selectedMaterial.name;
    }

    if (selectedCourse) {
      return courseTitle(selectedCourse);
    }

    return `${courses.length} courses`;
  }, [courses.length, selectedCourse, selectedMaterial]);

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = prompt.trim();
    if (!text || running) {
      return;
    }

    const userMessage: CodexMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };
    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setRunning(true);
    setError(null);

    try {
      const response = await fetch("/api/codex/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          threadId,
          moodleContext: buildMoodleContext({
            user,
            courses,
            selectedCourse,
            materials,
            selectedMaterial,
          }),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as CodexResponse;

      if (!response.ok || !payload.finalResponse) {
        throw new Error(payload.error ?? `Codex failed with ${response.status}.`);
      }

      setThreadId(payload.threadId ?? null);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: payload.finalResponse ?? "",
        },
      ]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Codex failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] bg-card">
      <div className="flex items-start justify-between gap-3 px-5 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot aria-hidden className="size-4 text-muted-foreground" />
            <h2 className="truncate text-base font-semibold tracking-tight">Codex</h2>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{contextSummary}</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[0.7rem] font-medium text-muted-foreground">
          <ShieldCheck aria-hidden className="size-3" />
          ChatGPT auth
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-60 flex-col justify-center rounded-[1.5rem] bg-secondary px-4 py-5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Ask about your Moodle workspace.</p>
            <p className="mt-2">
              Codex receives the selected course and visible materials, without raw Moodle links or tokens.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "rounded-[1.5rem] px-4 py-3 text-sm leading-6",
                  message.role === "user"
                    ? "self-end bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                <p className="whitespace-pre-wrap">{message.text}</p>
              </div>
            ))}
            {running ? (
              <div className="flex items-center gap-2 rounded-[1.5rem] bg-secondary px-4 py-3 text-sm text-muted-foreground">
                <Spinner aria-hidden />
                Thinking
              </div>
            ) : null}
          </div>
        )}
      </div>

      <form className="flex flex-col gap-3 px-4 pb-4" onSubmit={submitPrompt}>
        {error ? (
          <div className="rounded-[1.25rem] bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <textarea
          className="min-h-28 w-full resize-none rounded-[1.5rem] bg-secondary px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask about this course..."
        />
        <Button disabled={running || prompt.trim().length === 0} type="submit">
          {running ? <Spinner aria-hidden /> : <SendHorizontal aria-hidden />}
          Ask Codex
        </Button>
      </form>
    </aside>
  );
}

function buildMoodleContext({
  user,
  courses,
  selectedCourse,
  materials,
  selectedMaterial,
}: CodexPanelProps) {
  return {
    source: "moodle-web",
    user: user
      ? {
          displayName: user.displayName,
          moodleSiteUrl: user.moodleSiteUrl,
          moodleUserId: user.moodleUserId,
        }
      : null,
    selectedCourse: selectedCourse ? courseContext(selectedCourse) : null,
    selectedMaterial: selectedMaterial ? materialContext(selectedMaterial) : null,
    courses: courses.slice(0, 80).map(courseContext),
    materials: materials.map(materialContext),
  };
}

function courseContext(course: Course) {
  return {
    id: String(course.id),
    title: courseTitle(course),
    subtitle: courseSubtitle(course),
    category: course.categoryName ?? course.category ?? null,
  };
}

function materialContext(material: Material) {
  return {
    id: material.id,
    name: material.name,
    type: material.type ?? null,
    fileType: material.fileType ?? null,
    sectionName: material.sectionName ?? null,
    courseId: material.courseId ?? null,
    uploadedAt: material.uploadedAt ?? null,
  };
}
