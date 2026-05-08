"use client";

import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  SendHorizontal,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type {
  CodexChatMessage,
  MoodleUIAction,
} from "@/lib/codex-actions";
import { readCodexStream } from "@/lib/codex-stream-client";
import type { Course, Material, User } from "@/lib/dashboard-data";
import { courseSubtitle, courseTitle } from "@/lib/dashboard-data";
import { buildPDFImageInputs, buildPDFPromptContext, type PDFViewState } from "@/lib/pdf-context";
import { cn } from "@/lib/utils";

type CodexPanelProps = {
  user: User | null;
  courses: Course[];
  selectedCourse: Course | null;
  materials: Material[];
  selectedMaterial: Material | null;
  onApplyActions: (actions: MoodleUIAction[]) => void;
  pdfState: PDFViewState | null;
};

type CodexMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type CodexResponse = {
  threadId?: string | null;
  finalResponse?: string;
  actions?: MoodleUIAction[];
  error?: string;
};

type CodexAuthStatus = "checking" | "missing" | "connecting" | "connected";

type CodexAuthEvent =
  | {
      type: "device_code";
      verificationUri: string;
      userCode: string;
      expiresInSeconds?: number;
    }
  | { type: "completed" }
  | { type: "error"; error: string };

type CodexDeviceCode = {
  verificationUri: string;
  userCode: string;
  expiresInSeconds?: number;
};

export function CodexPanel({
  user,
  courses,
  selectedCourse,
  materials,
  selectedMaterial,
  onApplyActions,
  pdfState,
}: CodexPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<CodexMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [authStatus, setAuthStatus] = useState<CodexAuthStatus>("checking");
  const [deviceCode, setDeviceCode] = useState<CodexDeviceCode | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
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

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const response = await fetch("/api/codex/auth", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          authenticated?: boolean;
          error?: string;
        };

        if (cancelled) {
          return;
        }

        setAuthStatus(payload.authenticated ? "connected" : "missing");
        if (!response.ok) {
          setError(payload.error ?? "Could not check Codex authentication.");
        }
      } catch (authError) {
        if (cancelled) {
          return;
        }
        setAuthStatus("missing");
        setError(authError instanceof Error ? authError.message : "Could not check Codex authentication.");
      }
    }

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  async function connectCodex() {
    if (authStatus === "checking" || authStatus === "connecting" || authStatus === "connected") {
      return;
    }

    setAuthStatus("connecting");
    setDeviceCode(null);
    setCopiedCode(false);
    setError(null);

    try {
      const response = await fetch("/api/codex/auth", {
        method: "POST",
        headers: { accept: "application/x-ndjson" },
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not start ChatGPT sign-in.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let connected = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const event = parseAuthEvent(line);
          if (!event) {
            continue;
          }

          if (event.type === "device_code") {
            setDeviceCode({
              verificationUri: event.verificationUri,
              userCode: event.userCode,
              expiresInSeconds: event.expiresInSeconds,
            });
            setCopiedCode(false);
          } else if (event.type === "completed") {
            connected = true;
            setDeviceCode(null);
            setCopiedCode(false);
            setAuthStatus("connected");
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }

      if (!connected) {
        throw new Error("ChatGPT sign-in did not finish.");
      }
    } catch (authError) {
      setAuthStatus("missing");
      setError(authError instanceof Error ? authError.message : "Could not connect ChatGPT.");
    }
  }

  async function copyDeviceCode() {
    if (!deviceCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(deviceCode.userCode);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      setError("Could not copy the ChatGPT sign-in code.");
    }
  }

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = prompt.trim();
    if (!text || running) {
      return;
    }

    if (authStatus !== "connected") {
      setError("Connect ChatGPT before asking Codex questions.");
      return;
    }

    const userMessage: CodexMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };
    const assistantMessageId = crypto.randomUUID();
    const chatHistory = toChatHistory([...messages, userMessage]);
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantMessageId,
        role: "assistant",
        text: "Thinking...",
      },
    ]);
    setPrompt("");
    setRunning(true);
    setError(null);

    try {
      const response = await fetch("/api/codex/run", {
        method: "POST",
        headers: {
          accept: "application/x-ndjson",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prompt: text,
          images: buildPDFImageInputs(pdfState),
          messages: chatHistory,
          stream: true,
          moodleContext: buildMoodleContext({
            user,
            courses,
            selectedCourse,
            materials,
            selectedMaterial,
            pdfState,
          }),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as CodexResponse;
        throw new Error(payload.error ?? `Codex failed with ${response.status}.`);
      }

      const result = await readCodexStream(response, (event) => {
        if (event.type === "message") {
          updateAssistantMessage(assistantMessageId, displayCodexText(event.text));
        } else if (event.type === "tool") {
          updateAssistantMessage(
            assistantMessageId,
            event.status === "running" ? `Working: ${event.title}` : "Finishing...",
          );
        }
      });

      const actions = completeCodexActions(result.actions, text);
      updateAssistantMessage(assistantMessageId, result.finalResponse);
      if (actions.length > 0) {
        onApplyActions(actions);
      }
    } catch (submitError) {
      setMessages((current) => current.filter((message) => message.id !== assistantMessageId));
      setError(submitError instanceof Error ? submitError.message : "Codex failed.");
    } finally {
      setRunning(false);
    }
  }

  const isCodexConnected = authStatus === "connected";
  const connectLabel =
    authStatus === "checking"
      ? "Checking..."
      : authStatus === "connecting"
        ? "Waiting..."
        : isCodexConnected
          ? "Connected"
          : "Connect ChatGPT";
  const composerDisabled = running || !isCodexConnected;

  function updateAssistantMessage(messageId: string, text: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              text,
            }
          : message,
      ),
    );
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
        <Button
          className="h-9 shrink-0 px-3 text-xs"
          disabled={authStatus === "checking" || authStatus === "connecting" || isCodexConnected}
          onClick={() => void connectCodex()}
          type="button"
          variant={isCodexConnected ? "secondary" : "default"}
        >
          <ShieldCheck aria-hidden className="size-3.5" />
          {connectLabel}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {deviceCode ? (
          <div className="mb-3 rounded-[1.5rem] bg-secondary px-4 py-4 text-sm">
            <p className="font-medium text-foreground">Finish ChatGPT sign-in</p>
            <p className="mt-2 text-muted-foreground">
              Open the Codex login page and enter this code:
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="inline-flex rounded-full bg-background px-3 py-1.5 font-mono text-lg font-semibold tracking-wide text-foreground">
                {deviceCode.userCode}
              </p>
              <Button
                className="h-9 px-3 text-xs"
                onClick={() => void copyDeviceCode()}
                size="sm"
                type="button"
                variant="secondary"
              >
                {copiedCode ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copiedCode ? "Copied" : "Copy code"}
              </Button>
            </div>
            <Button asChild className="mt-3 h-9 px-3 text-xs" size="sm">
              <a href={deviceCode.verificationUri} rel="noreferrer" target="_blank">
                <ExternalLink aria-hidden />
                Open ChatGPT login
              </a>
            </Button>
          </div>
        ) : null}

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
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          disabled={composerDisabled}
          placeholder={isCodexConnected ? "Ask about this course..." : "Connect ChatGPT before asking..."}
        />
        <Button disabled={composerDisabled || prompt.trim().length === 0} type="submit">
          {running ? <Spinner aria-hidden /> : <SendHorizontal aria-hidden />}
          Ask Codex
        </Button>
      </form>
    </aside>
  );
}

function parseAuthEvent(line: string): CodexAuthEvent | null {
  if (!line.trim()) {
    return null;
  }

  try {
    return JSON.parse(line) as CodexAuthEvent;
  } catch {
    return null;
  }
}

function buildMoodleContext({
  user,
  courses,
  selectedCourse,
  materials,
  selectedMaterial,
  pdfState,
}: Omit<CodexPanelProps, "onApplyActions">) {
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
    pdf: buildPDFPromptContext(pdfState),
    courses: courses.slice(0, 80).map(courseContext),
    materials: materials.map(materialContext),
  };
}

function completeCodexActions(actions: MoodleUIAction[], prompt: string): MoodleUIAction[] {
  if (!asksToOpenPDF(prompt)) {
    return actions;
  }

  const alreadyOpensPDF = actions.some((action) => action.type === "open_material" || action.type === "open_latest_pdf");
  if (alreadyOpensPDF) {
    return actions;
  }

  const courseAction = actions.find((action): action is Extract<MoodleUIAction, { type: "open_course" }> =>
    action.type === "open_course"
  );
  if (!courseAction) {
    return actions;
  }

  return [
    ...actions,
    {
      type: "open_latest_pdf",
      courseId: courseAction.courseId,
      reason: "User asked to open a PDF in this course.",
    },
  ];
}

function asksToOpenPDF(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return /\bpdf\b/.test(normalized) && /(open|show|display|öffne|oeffne|zeige|lad|lade)/i.test(normalized);
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

function toChatHistory(messages: CodexMessage[]): CodexChatMessage[] {
  return messages
    .filter((message) => message.text.trim() && message.text !== "Thinking...")
    .map((message) => ({
      role: message.role,
      text: message.text,
    }))
    .slice(-12);
}

function displayCodexText(text: string): string {
  try {
    const parsed = JSON.parse(text) as { answer?: unknown };
    return typeof parsed.answer === "string" ? parsed.answer : text;
  } catch {
    return text;
  }
}
