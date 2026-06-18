"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  GraduationCap,
  History,
  ImageIcon,
  MessageSquare,
  Mic,
  Paperclip,
  Plus,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { LucideIcon } from "lucide-react";

import { ChatCoursePickerModal } from "@/components/chat-course-picker-modal";
import { ComposerModelSelector } from "@/components/composer-model-selector";
import { CourseResourcePickerModal } from "@/components/course-resource-picker-modal";
import { CourseThumbnail } from "@/components/dashboard-ui";
import { GeneratedUIContent } from "@/components/generated-ui-renderer";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { Spinner } from "@/components/ui/spinner";
import { ThinkingDots } from "@/components/ui/thinking-dots";
import { WorkspaceFilePanel } from "@/components/workspace-file-panel";
import { useCodexChat } from "@/hooks/use-codex-chat";
import { useCodexModels } from "@/hooks/use-codex-models";
import type { UserSettingsController } from "@/hooks/use-user-settings";
import type { CodexActionResult } from "@/hooks/use-codex-moodle-actions";
import type { MoodleUIAction } from "@/lib/codex-actions";
import type { CodexAppliedAction, CodexChatUIMessage, CodexToolEvent, StudyChatContext } from "@/lib/codex-chat";
import {
  formatFileSize,
  resourceAttachment,
  uploadWorkspaceFile,
  type CodexAttachment,
} from "@/lib/codex-files";
import type { Course, Material, User } from "@/lib/dashboard-data";
import { courseImageUrl, courseTitle } from "@/lib/dashboard-data";
import { stripGeneratedUIBlocks } from "@/lib/generated-ui";
import type { PDFViewState } from "@/lib/pdf-context";
import {
  readRecentChat,
  readRecentChats,
  upsertRecentChat,
  type RecentChatEntry,
} from "@/lib/recent-chat-storage";
import { cn } from "@/lib/utils";

type ChatPageProps = {
  user: User | null;
  courses: Course[];
  materials: Material[];
  selectedMaterial: Material | null;
  selectedCourseId: string | null;
  pdfState: PDFViewState | null;
  studyContext?: StudyChatContext;
  userSettings: UserSettingsController;
  loadMaterials: (courseId: string) => Promise<Material[]>;
  onCourseChange: (courseId: string) => void;
  onApplyActions: (actions: MoodleUIAction[]) => Promise<CodexActionResult>;
  sessionId?: string | null;
  // "page" = full chat view; "sidebar" = compact right-hand panel.
  variant?: "page" | "sidebar";
  onClose?: () => void;
  onSessionCreated?: (sessionId: string) => void;
};

type PendingFile = { kind: "file"; id: string; file: File; previewUrl?: string };
type PendingResource = { kind: "resource"; id: string; courseId: string; materialId: string; name: string };
type PendingItem = PendingFile | PendingResource;

export function ChatPage({
  user,
  courses,
  materials,
  selectedMaterial,
  selectedCourseId,
  pdfState,
  studyContext,
  userSettings,
  loadMaterials,
  onCourseChange,
  onApplyActions,
  sessionId,
  variant = "page",
  onClose,
  onSessionCreated,
}: ChatPageProps) {
  const isSidebar = variant === "sidebar";
  const chatIdRef = useRef<string | null>(sessionId ?? null);
  const loadedSessionIdRef = useRef<string | null | undefined>(undefined);
  const [prompt, setPrompt] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState<RecentChatEntry[]>([]);
  const modelsHook = useCodexModels(selectedCourseId ?? undefined);
  const selectedCourse = courses.find((course) => String(course.id) === selectedCourseId) ?? null;

  const chat = useCodexChat({
    user,
    courses,
    selectedCourse,
    materials,
    selectedMaterial,
    pdfState,
    studyContext,
    model: modelsHook.selectedModel,
    reasoningEffort: modelsHook.selectedReasoningEffort,
    onApplyActions,
  });

  const hasMessages = chat.messages.length > 0;

  function startNewChat() {
    chatIdRef.current = null;
    chat.reset([]);
    setPrompt("");
    setPending([]);
    setHistoryOpen(false);
    setStick(true);
    ensureFollow();
  }

  function openStoredSession(session: RecentChatEntry) {
    chatIdRef.current = session.id;
    chat.reset(messagesForRecentChat(session));
    setPrompt("");
    setPending([]);
    setHistoryOpen(false);
    setStick(true);
    ensureFollow();
  }

  useEffect(() => {
    if (sessionId === undefined || loadedSessionIdRef.current === sessionId) {
      return;
    }
    loadedSessionIdRef.current = sessionId;
    if (sessionId === null) {
      startNewChat();
      return;
    }
    const storedSession = readRecentChat(sessionId);
    if (storedSession) {
      openStoredSession(storedSession);
      return;
    }
    chatIdRef.current = sessionId;
    chat.reset([]);
    // The external session id is the reload boundary. Course/model/context
    // changes must not wipe the current transcript.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const visibleMessages = chat.messages.filter(
      (message) => message.text.trim().length > 0 && message.text !== "Thinking...",
    );
    if (visibleMessages.length === 0) {
      return;
    }
    const created = !chatIdRef.current;
    chatIdRef.current ??= crypto.randomUUID();
    const firstUserMessage = visibleMessages.find((message) => message.role === "user");
    const lastMessage = visibleMessages[visibleMessages.length - 1];
    const fallbackTitle = selectedCourse ? courseTitle(selectedCourse) : "Chat";
    const title = compactChatText(stripGeneratedUIBlocks(firstUserMessage?.text ?? fallbackTitle));
    upsertRecentChat({
      id: chatIdRef.current,
      courseId: selectedCourseId,
      courseTitle: selectedCourse ? courseTitle(selectedCourse) : null,
      messages: visibleMessages,
      messageCount: visibleMessages.length,
      preview: compactChatText(stripGeneratedUIBlocks(lastMessage.text)),
      title,
      updatedAt: new Date().toISOString(),
    });
    if (created && chatIdRef.current) {
      loadedSessionIdRef.current = chatIdRef.current;
      onSessionCreated?.(chatIdRef.current);
    }
    if (historyOpen) {
      setHistorySessions(readRecentChats());
    }
  }, [chat.messages, historyOpen, onSessionCreated, selectedCourse, selectedCourseId]);

  // Refresh the workspace file panel whenever a Codex run finishes (files may
  // have changed).
  const [filesReloadKey, setFilesReloadKey] = useState(0);
  const prevRunningRef = useRef(false);
  useEffect(() => {
    if (prevRunningRef.current && !chat.running) {
      setFilesReloadKey((current) => current + 1);
    }
    prevRunningRef.current = chat.running;
  }, [chat.running]);

  // Persisted, DB-backed user settings: remember the chat course, model and
  // reasoning effort across sessions so they don't reset every time.
  const { settings, loaded: settingsLoaded, update: updateSettings } = userSettings;
  const courseAppliedRef = useRef(false);
  const modelAppliedRef = useRef(false);

  const handleCourseChange = useCallback(
    (courseId: string) => {
      onCourseChange(courseId);
      updateSettings({ chatCourseId: courseId });
    },
    [onCourseChange, updateSettings],
  );

  // Restore the saved course once, only if nothing is selected yet. Only the
  // full page does this — the sidebar adopts whatever course the user is on and
  // must not hijack dashboard navigation.
  useEffect(() => {
    if (isSidebar || !settingsLoaded || courseAppliedRef.current) {
      return;
    }
    courseAppliedRef.current = true;
    if (!selectedCourseId && settings.chatCourseId) {
      onCourseChange(settings.chatCourseId);
    }
  }, [isSidebar, settingsLoaded, settings.chatCourseId, selectedCourseId, onCourseChange]);

  // Restore the saved model/reasoning once the catalog is available.
  const { connected: modelsConnected, models, setSelectedModel, setSelectedReasoningEffort } = modelsHook;
  useEffect(() => {
    if (!settingsLoaded || modelAppliedRef.current || !modelsConnected || models.length === 0) {
      return;
    }
    modelAppliedRef.current = true;
    if (settings.chatModel && models.some((model) => model.id === settings.chatModel)) {
      setSelectedModel(settings.chatModel);
      if (settings.chatReasoningEffort) {
        setSelectedReasoningEffort(settings.chatReasoningEffort);
      }
    }
  }, [
    settingsLoaded,
    settings.chatModel,
    settings.chatReasoningEffort,
    modelsConnected,
    models,
    setSelectedModel,
    setSelectedReasoningEffort,
  ]);

  // Persist model/reasoning changes (only after the saved values were applied).
  useEffect(() => {
    if (!modelAppliedRef.current || !modelsHook.selectedModel) {
      return;
    }
    updateSettings({
      chatModel: modelsHook.selectedModel,
      chatReasoningEffort: modelsHook.selectedReasoningEffort,
    });
  }, [modelsHook.selectedModel, modelsHook.selectedReasoningEffort, updateSettings]);

  const [pending, setPending] = useState<PendingItem[]>([]);
  const [uploading, setUploading] = useState(false);

  function addFiles(files: File[]) {
    setPending((current) => [
      ...current,
      ...files.map((file): PendingFile => ({
        kind: "file",
        id: crypto.randomUUID(),
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      })),
    ]);
  }

  function removePending(id: string) {
    setPending((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.kind === "file" && target.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  function addResources(selected: Material[]) {
    setPending((current) => {
      const existing = new Set(current.map((item) => item.id));
      const additions = selected
        .map((material): PendingResource => ({
          kind: "resource",
          id: `resource:${material.courseId ?? selectedCourseId ?? ""}:${material.id}`,
          courseId: String(material.courseId ?? selectedCourseId ?? ""),
          materialId: material.id,
          name: material.name,
        }))
        .filter((item) => !existing.has(item.id));
      return [...current, ...additions];
    });
  }

  // Smooth auto-follow: while pinned to the bottom, ease the feed toward the
  // newest content each animation frame (interpolated, not a hard jump). The
  // user breaks the lock by scrolling up; reaching the bottom re-engages it.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const stickRef = useRef(true);
  const followRafRef = useRef<number | null>(null);
  const autoScrollingRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);

  const setStick = useCallback((value: boolean) => {
    stickRef.current = value;
    setStickToBottom(value);
  }, []);

  const followStep = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !stickRef.current) {
      followRafRef.current = null;
      autoScrollingRef.current = false;
      return;
    }
    const target = el.scrollHeight - el.clientHeight;
    const distance = target - el.scrollTop;
    const reduceMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (distance < 1 || reduceMotion) {
      autoScrollingRef.current = true;
      el.scrollTop = target;
      followRafRef.current = null;
      requestAnimationFrame(() => {
        autoScrollingRef.current = false;
      });
      return;
    }
    autoScrollingRef.current = true;
    el.scrollTop = el.scrollTop + distance * 0.22;
    followRafRef.current = requestAnimationFrame(followStep);
  }, []);

  const ensureFollow = useCallback(() => {
    if (followRafRef.current == null) {
      followRafRef.current = requestAnimationFrame(followStep);
    }
  }, [followStep]);

  const stopFollow = useCallback(() => {
    if (followRafRef.current != null) {
      cancelAnimationFrame(followRafRef.current);
      followRafRef.current = null;
    }
    autoScrollingRef.current = false;
  }, []);

  function handleFeedScroll() {
    if (autoScrollingRef.current) {
      return; // ignore our own programmatic easing
    }
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 12);
  }

  function handleFeedWheel(event: { deltaY: number }) {
    if (event.deltaY < 0 && stickRef.current) {
      setStick(false);
      stopFollow();
    }
  }

  // Touch devices have no wheel event, so without this the follow loop fights
  // every upward swipe while a response streams in.
  function handleFeedTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    const startY = touchStartYRef.current;
    const currentY = event.touches[0]?.clientY ?? null;
    if (stickRef.current && startY != null && currentY != null && currentY - startY > 4) {
      setStick(false);
      stopFollow();
    }
  }

  function scrollToBottom() {
    setStick(true);
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight - el.clientHeight;
    }
    ensureFollow();
  }

  useEffect(() => {
    if (stickToBottom) {
      ensureFollow();
    }
  }, [chat.messages, stickToBottom, ensureFollow]);

  useEffect(() => () => stopFollow(), [stopFollow]);

  async function handleSend() {
    const text = prompt.trim();
    if ((!text && pending.length === 0) || uploading) {
      return;
    }
    scrollToBottom();

    const attachments: CodexAttachment[] = [];
    const files = pending.filter((item): item is PendingFile => item.kind === "file");
    if (files.length > 0) {
      setUploading(true);
      try {
        const uploaded = await Promise.all(
          files.map(async (item) => ({ ...(await uploadWorkspaceFile(item.file)), previewUrl: item.previewUrl })),
        );
        attachments.push(...uploaded);
      } catch (uploadError) {
        chat.setError(uploadError instanceof Error ? uploadError.message : "Upload fehlgeschlagen.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    for (const item of pending) {
      if (item.kind === "resource") {
        attachments.push(resourceAttachment({ id: item.materialId, name: item.name, courseId: item.courseId }));
      }
    }

    setPrompt("");
    setPending([]);
    void chat.submit(text, attachments);
  }

  const composer = (
    <div className="flex flex-col">
      {studyContext ? <StudyContextChip context={studyContext} /> : null}
      <ChatComposer
        loadMaterials={loadMaterials}
        modelsHook={modelsHook}
        pending={pending}
        prompt={prompt}
        running={chat.running}
        selectedCourse={selectedCourse}
        uploading={uploading}
        onAddFiles={addFiles}
        onAddResources={addResources}
        onPromptChange={setPrompt}
        onRemove={removePending}
        onSend={handleSend}
        onStop={() => chat.stop()}
      />
    </div>
  );

  const contentWidth = isSidebar ? "max-w-full" : "max-w-3xl";

  // Page + no messages: big centered hero. Otherwise (and always in the
  // sidebar): a scrolling feed with the composer docked at the bottom.
  const mainContent =
    !hasMessages && !isSidebar ? (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center bg-background px-4 py-8">
        <h1 className="mb-4 text-center text-[1.75rem] font-semibold tracking-tight sm:text-[2rem]">
          What do you want to Learn?
        </h1>
        <div className="mb-8 flex justify-center sm:mb-10">
          <div className="rounded-full bg-secondary px-3 py-1.5">
            <CourseSelector
              courses={courses}
              selectedCourse={selectedCourse}
              selectedCourseId={selectedCourseId}
              onCourseChange={handleCourseChange}
            />
          </div>
        </div>
        <div className="w-full max-w-3xl">
          {chat.error ? <ChatError message={chat.error} /> : null}
          <div className="mb-3 flex justify-center sm:hidden">
            <div className="rounded-full bg-secondary/70 px-1.5 py-0.5">
              <ComposerModelSelector modelsHook={modelsHook} />
            </div>
          </div>
          {composer}
        </div>
      </div>
    ) : (
      <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            className={cn("h-full overflow-auto", isSidebar ? "p-3" : "p-4 md:p-8")}
            onScroll={handleFeedScroll}
            onTouchStart={(event) => {
              touchStartYRef.current = event.touches[0]?.clientY ?? null;
            }}
            onTouchMove={handleFeedTouchMove}
            onWheel={handleFeedWheel}
          >
            <div className={cn("mx-auto flex w-full flex-col gap-4", contentWidth)}>
              {chat.messages.length === 0 ? (
                isSidebar && selectedCourse ? (
                  <SidebarCourseHero course={selectedCourse} />
                ) : (
                  <p className="px-1 py-8 text-center text-sm text-muted-foreground">
                    Frag mich etwas zu diesem Kurs.
                  </p>
                )
              ) : (
                chat.messages.map((message) => (
                  <ChatMessageBubble
                    key={message.id}
                    message={message}
                    onCancelActionRequest={chat.cancelActionRequest}
                    onConfirmActionRequest={chat.confirmActionRequest}
                  />
                ))
              )}
            </div>
          </div>
          {!isSidebar && hasMessages ? (
            <div className="pointer-events-none absolute left-3 top-2 z-10 sm:hidden">
              <div className="pointer-events-auto rounded-full bg-background/90 px-1.5 py-0.5 shadow-md ring-1 ring-border/60 backdrop-blur-md">
                <ComposerModelSelector modelsHook={modelsHook} />
              </div>
            </div>
          ) : null}
          {!stickToBottom && chat.messages.length > 0 ? (
            <button
              aria-label="Nach unten scrollen"
              className="absolute bottom-3 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full bg-foreground text-background shadow-md transition-transform hover:scale-105"
              type="button"
              onClick={() => scrollToBottom()}
            >
              <ArrowDown className="size-4" />
            </button>
          ) : null}
        </div>
        <div className={cn("shrink-0", isSidebar ? "p-3" : "p-4 md:p-6")}>
          <div className={cn("mx-auto w-full", contentWidth)}>
            {chat.error ? <ChatError message={chat.error} /> : null}
            {!isSidebar ? (
              <div className="mb-2 flex justify-start px-1">
                <CourseSelector
                  courses={courses}
                  selectedCourse={selectedCourse}
                  selectedCourseId={selectedCourseId}
                  onCourseChange={handleCourseChange}
                />
              </div>
            ) : null}
            {composer}
          </div>
        </div>
      </div>
    );

  if (isSidebar) {
    return (
      <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-border/50 bg-background">
        <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2.5">
          {hasMessages && selectedCourse ? (
            <>
              <CourseThumbnail circle course={selectedCourse} size="compact" />
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{courseTitle(selectedCourse)}</h2>
            </>
          ) : (
            <>
              <MessageSquare aria-hidden className="size-4 text-muted-foreground" />
              <h2 className="flex-1 text-sm font-semibold">Chat</h2>
            </>
          )}
          <button
            aria-label="Neuer Chat"
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            type="button"
            onClick={startNewChat}
          >
            <Plus className="size-4" />
          </button>
          <div className="relative">
            <button
              aria-expanded={historyOpen}
              aria-label="Chatverläufe öffnen"
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                historyOpen ? "bg-secondary text-foreground" : "",
              )}
              type="button"
              onClick={() => {
                setHistorySessions(readRecentChats());
                setHistoryOpen((current) => !current);
              }}
            >
              <History className="size-4" />
            </button>
            {historyOpen ? (
              <div className="absolute right-0 top-9 z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-2xl bg-popover p-2 text-popover-foreground shadow-xl">
                {historySessions.length > 0 ? (
                  historySessions.map((session) => (
                    <button
                      className={cn(
                        "rounded-xl px-3 py-2 text-left transition-colors hover:bg-secondary",
                        chatIdRef.current === session.id ? "bg-secondary" : "",
                      )}
                      key={session.id}
                      type="button"
                      onClick={() => openStoredSession(session)}
                    >
                      <span className="block truncate text-sm font-semibold">{session.title}</span>
                      <span className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground">
                        {session.preview}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs leading-5 text-muted-foreground">Noch keine Chatverläufe.</p>
                )}
              </div>
            ) : null}
          </div>
          {onClose ? (
            <button
              aria-label="Chat schließen"
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              type="button"
              onClick={onClose}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        {mainContent}
      </aside>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 flex-1 flex-col">{mainContent}</div>
      <WorkspaceFilePanel className="hidden lg:flex" reloadKey={filesReloadKey} />
    </div>
  );
}

// Matches Tailwind's `sm` breakpoint so JSX structure can follow the layout.
function useIsCompactViewport(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return compact;
}

// Empty state of the sidebar chat: the course is given by context, so it gets
// a big visual hero instead of a picker.
function SidebarCourseHero({ course }: { course: Course }) {
  const imageUrl = courseImageUrl(course);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
      <span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary shadow-sm">
        {imageUrl && !imageFailed ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
            src={imageUrl}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <GraduationCap aria-hidden className="size-8 text-muted-foreground" />
        )}
      </span>
      <p className="max-w-full text-base font-semibold leading-snug">{courseTitle(course)}</p>
      <p className="text-sm text-muted-foreground">Frag mich etwas zu diesem Kurs.</p>
    </div>
  );
}

function compactChatText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 80) {
    return normalized;
  }
  return `${normalized.slice(0, 77).trim()}...`;
}

function messagesForRecentChat(session: RecentChatEntry): CodexChatUIMessage[] {
  if (session.messages && session.messages.length > 0) {
    return session.messages;
  }
  return [
    {
      id: `${session.id}:legacy-preview`,
      role: "assistant",
      text: [
        "Dieser Chat wurde gespeichert, bevor vollständige Verläufe verfügbar waren.",
        "",
        session.preview ? `Letzte Vorschau: ${session.preview}` : "Für diesen alten Eintrag gibt es nur die Vorschau.",
      ].join("\n"),
      toolEvents: [],
      actions: [],
      attachments: [],
    },
  ];
}

export function ChatMessageBubble({
  message,
  onCancelActionRequest,
  onConfirmActionRequest,
}: {
  message: CodexChatUIMessage;
  onCancelActionRequest?: (requestId: string) => void;
  onConfirmActionRequest?: (requestId: string) => void;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (message.role === "user") {
    return (
      <div className="flex max-w-[85%] flex-col items-end gap-1.5 self-end">
        {lightboxSrc ? <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} /> : null}
        {message.attachments.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-2">
            {message.attachments.map((attachment) =>
              attachment.kind === "image" && attachment.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={attachment.id}
                  alt={attachment.name}
                  className="max-h-44 max-w-[13rem] cursor-zoom-in rounded-2xl object-cover transition-opacity hover:opacity-90"
                  src={attachment.previewUrl}
                  onClick={() => attachment.previewUrl && setLightboxSrc(attachment.previewUrl)}
                />
              ) : (
                <AttachmentChip
                  key={attachment.id}
                  kind={attachment.kind}
                  name={attachment.name}
                  previewUrl={attachment.previewUrl}
                  size={attachment.size}
                />
              ),
            )}
          </div>
        ) : null}
        {message.text ? (
          <div className="rounded-3xl rounded-br-lg bg-secondary px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
            {message.text}
          </div>
        ) : null}
      </div>
    );
  }

  const isPending = message.text === "Thinking...";

  return (
    <div className="flex max-w-full flex-col gap-1 self-start">
      {/* Each tool call / action renders inline in the chat flow as its own row. */}
      {message.toolEvents.map((event) => (
        <ToolEventRow key={event.id} event={event} />
      ))}
      {isPending ? (
        <div className="py-1 text-muted-foreground">
          <ThinkingDots label={message.toolEvents.some((event) => event.status === "running") ? "Working" : "Thinking"} />
        </div>
      ) : (
        <GeneratedUIContent text={message.text} />
      )}
      {message.actions.map((action) => (
        <ActionRow
          key={action.id}
          action={action}
          onCancel={onCancelActionRequest}
          onConfirm={onConfirmActionRequest}
        />
      ))}
    </div>
  );
}

function ToolEventRow({ event }: { event: CodexToolEvent }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-sm text-muted-foreground">
      <ToolStatusIcon status={event.status} />
      <span className="min-w-0 truncate">{event.title}</span>
    </div>
  );
}

function ToolStatusIcon({ status }: { status: CodexToolEvent["status"] }) {
  if (status === "running") {
    return <Spinner aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  if (status === "failed") {
    return <X aria-hidden className="size-3.5 shrink-0 text-destructive" />;
  }
  return <Check aria-hidden className="size-3.5 shrink-0 text-emerald-500" />;
}

function ActionRow({
  action,
  onCancel,
  onConfirm,
}: {
  action: CodexAppliedAction;
  onCancel?: (requestId: string) => void;
  onConfirm?: (requestId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = action.status ?? "completed";
  const expandable = status === "completed" && action.resources.length > 0;
  const requestId = action.requestId;
  const detail = action.detail ?? actionStatusDetail(status);

  return (
    <div className="flex flex-col">
      <button
        className={cn(
          "-mx-2 flex items-center gap-2 rounded-lg px-2 py-1 text-left text-sm transition-colors",
          expandable ? "hover:bg-secondary/60" : "cursor-default",
        )}
        disabled={!expandable}
        type="button"
        onClick={() => setExpanded((current) => !current)}
      >
        <ActionStatusIcon status={status} />
        <span className="min-w-0 truncate text-foreground/90">{action.label}</span>
        {detail ? (
          <span className="shrink-0 text-xs text-muted-foreground">{detail}</span>
        ) : null}
        {expandable ? (
          <ChevronRight
            aria-hidden
            className={cn(
              "ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded ? "rotate-90" : "",
            )}
          />
        ) : null}
      </button>
      {action.reason && status === "pending" ? (
        <p className="ml-5 mt-0.5 text-xs leading-5 text-muted-foreground">{action.reason}</p>
      ) : null}
      {action.error && status === "failed" ? (
        <p className="ml-5 mt-0.5 text-xs leading-5 text-destructive">{action.error}</p>
      ) : null}
      {action.showControls && status === "pending" && requestId ? (
        <div className="ml-5 mt-2 flex flex-wrap gap-2">
          <button
            className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background transition-opacity hover:opacity-90"
            type="button"
            onClick={() => onConfirm?.(requestId)}
          >
            Bestätigen
          </button>
          <button
            className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            type="button"
            onClick={() => onCancel?.(requestId)}
          >
            Abbrechen
          </button>
        </div>
      ) : null}
      {expandable && expanded ? (
        <ul className="mt-0.5 ml-5 flex flex-col gap-0.5 text-xs text-muted-foreground">
          {action.resources.slice(0, 8).map((resource) => (
            <li key={resource} className="truncate">
              {resource}
            </li>
          ))}
          {action.resources.length > 8 ? (
            <li className="text-muted-foreground/70">+{action.resources.length - 8} weitere</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function ActionStatusIcon({ status }: { status: NonNullable<CodexAppliedAction["status"]> }) {
  if (status === "running") {
    return <Spinner aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  if (status === "failed" || status === "cancelled") {
    return <X aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  if (status === "pending") {
    return <FolderOpen aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  return <Check aria-hidden className="size-3.5 shrink-0 text-emerald-500" />;
}

function actionStatusDetail(status: NonNullable<CodexAppliedAction["status"]>): string | undefined {
  if (status === "pending") {
    return "Bestätigung nötig";
  }
  if (status === "running") {
    return "Wird ausgeführt";
  }
  if (status === "cancelled") {
    return "Abgebrochen";
  }
  if (status === "failed") {
    return "Fehlgeschlagen";
  }
  return undefined;
}

function ChatError({ message }: { message: string }) {
  return (
    <div className="mb-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</div>
  );
}

function AttachmentChip({
  name,
  size,
  kind,
  previewUrl,
  onRemove,
}: {
  name: string;
  size?: number;
  kind: "image" | "file" | "resource";
  previewUrl?: string;
  onRemove?: () => void;
}) {
  const Icon = kind === "image" ? ImageIcon : kind === "resource" ? GraduationCap : FileText;
  const subtitle = kind === "resource" ? "Kursressource" : size && size > 0 ? formatFileSize(size) : null;
  return (
    <span className="inline-flex max-w-[14rem] items-center gap-2 rounded-xl border border-border/60 bg-background px-2.5 py-1.5 text-left">
      {kind === "image" && previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={name} className="size-8 shrink-0 rounded-md object-cover" src={previewUrl} />
      ) : (
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium text-foreground">{name}</span>
        {subtitle ? <span className="text-[0.65rem] text-muted-foreground">{subtitle}</span> : null}
      </span>
      {onRemove ? (
        <button
          aria-label="Anhang entfernen"
          className="ml-1 flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          type="button"
          onClick={onRemove}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </span>
  );
}

// Shows what Codex currently "sees over the shoulder": the focused task or
// script section, and in test mode the live tutor context.
function StudyContextChip({ context }: { context: NonNullable<StudyChatContext> }) {
  const test = context.test;
  let badge: string | null = null;
  let label: string | null = null;
  if (test?.active) {
    badge = "Testmodus";
    label = [test.stepLabel, test.taskTitle, test.sheetTitle].filter(Boolean).join(" · ");
  } else if (context.selectedTask) {
    badge = "Aufgabe";
    label = [context.selectedTask.title, context.selectedTask.sheetTitle].filter(Boolean).join(" · ");
  } else if (context.selectedScriptSection) {
    badge = "Script";
    label = context.selectedScriptSection.title;
  }
  if (!label) {
    return null;
  }
  return (
    <div className="mb-2 flex items-center gap-2 rounded-2xl bg-secondary/60 px-3 py-2 text-xs">
      <GraduationCap aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 rounded-full bg-background px-2 py-0.5 font-semibold text-foreground">{badge}</span>
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      {test?.active ? (
        <span className="ml-auto hidden shrink-0 text-[11px] text-muted-foreground/70 sm:block">
          Codex sieht Aufgabe{test.solutionMarkdown ? ", Lösung" : ""} &amp; deinen Entwurf
        </span>
      ) : null}
    </div>
  );
}

function ChatComposer({
  loadMaterials,
  modelsHook,
  pending,
  prompt,
  running,
  selectedCourse,
  uploading,
  onAddFiles,
  onAddResources,
  onPromptChange,
  onRemove,
  onSend,
  onStop,
}: {
  loadMaterials: (courseId: string) => Promise<Material[]>;
  modelsHook: ReturnType<typeof useCodexModels>;
  pending: PendingItem[];
  prompt: string;
  running: boolean;
  selectedCourse: Course | null;
  uploading: boolean;
  onAddFiles: (files: File[]) => void;
  onAddResources: (materials: Material[]) => void;
  onPromptChange: (value: string) => void;
  onRemove: (id: string) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const compact = useIsCompactViewport();
  const busy = uploading;
  const canSend = (prompt.trim().length > 0 || pending.length > 0) && !busy;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "0px";
    // Compact (mobile): one line that grows to at most three lines.
    textarea.style.height = `${Math.min(textarea.scrollHeight, compact ? 76 : 180)}px`;
  }, [compact, prompt]);

  const addOptions: AddMenuOption[] = [
    { id: "files", label: "Dateien", icon: Paperclip, onSelect: () => filesInputRef.current?.click() },
    { id: "photos", label: "Fotos", icon: ImageIcon, onSelect: () => photosInputRef.current?.click() },
    { id: "resources", label: "Kursressourcen", icon: GraduationCap, onSelect: () => setResourceModalOpen(true) },
  ];

  const pendingChips =
    pending.length > 0 ? (
      <div className={cn("flex flex-wrap gap-2", compact ? "mb-2 px-1" : "mb-2")}>
        {pending.map((item) => (
          <AttachmentChip
            key={item.id}
            kind={item.kind === "resource" ? "resource" : item.file.type.startsWith("image/") ? "image" : "file"}
            name={item.kind === "resource" ? item.name : item.file.name}
            previewUrl={item.kind === "file" ? item.previewUrl : undefined}
            size={item.kind === "file" ? item.file.size : undefined}
            onRemove={() => onRemove(item.id)}
          />
        ))}
      </div>
    ) : null;

  const micButton = (
    <button
      aria-label="Spracheingabe"
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
      type="button"
    >
      <Mic className="size-4" />
    </button>
  );

  const sendButton = (
    <button
      aria-label={running ? "Steering senden" : "Senden"}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
        canSend ? "bg-neutral-500 text-white hover:bg-neutral-600" : "bg-secondary text-muted-foreground",
      )}
      disabled={!canSend}
      type="button"
      onClick={onSend}
    >
      {busy ? <Spinner aria-hidden className="size-4" /> : <ArrowUp className="size-4" />}
    </button>
  );

  const stopButton = running ? (
    <button
      aria-label="Antwort stoppen"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      type="button"
      onClick={onStop}
    >
      <Square className="size-3.5 fill-current" />
    </button>
  ) : null;

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <div className="flex flex-col">
      <input
        ref={filesInputRef}
        multiple
        className="hidden"
        type="file"
        onChange={(event) => handleFileInput(event, onAddFiles)}
      />
      <input
        ref={photosInputRef}
        multiple
        accept="image/*"
        className="hidden"
        type="file"
        onChange={(event) => handleFileInput(event, onAddFiles)}
      />

      {compact ? (
        <>
          {pendingChips}
          {/* Compact composer: a single row that grows to at most three lines. */}
          <div className="relative z-10 flex items-end gap-1 rounded-[1.6rem] border border-border/50 bg-background p-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
            <ComposerAddMenu options={addOptions} />
            <textarea
              ref={textareaRef}
              className="min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-base leading-6 outline-none placeholder:text-muted-foreground/45"
              placeholder={`Ask about ${selectedCourse ? courseTitle(selectedCourse) : "anything"}`}
              rows={1}
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
            />
            {micButton}
            {stopButton}
            {sendButton}
          </div>
        </>
      ) : (
        <div className="relative z-10 flex min-h-[8.5rem] flex-col rounded-3xl border border-border/50 bg-background px-4 pb-3 pt-4 shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
          {pendingChips}
          <div className="relative min-h-[4.75rem] flex-1">
            {!prompt.trim() ? (
              <p className="pointer-events-none absolute inset-x-0 top-0 text-base leading-relaxed text-muted-foreground/45">
                Ask about{" "}
                <span className="italic text-muted-foreground/60">{selectedCourse ? courseTitle(selectedCourse) : "anything"}</span>
              </p>
            ) : null}
            <textarea
              ref={textareaRef}
              className="min-h-[4.75rem] w-full resize-none bg-transparent text-base leading-relaxed outline-none"
              rows={1}
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <ComposerAddMenu options={addOptions} />
            <div className="flex shrink-0 items-center gap-1">
              <ComposerModelSelector modelsHook={modelsHook} />
              {micButton}
              {stopButton}
              {sendButton}
            </div>
          </div>
        </div>
      )}

      <CourseResourcePickerModal
        course={selectedCourse}
        loadMaterials={loadMaterials}
        open={resourceModalOpen}
        selectedIds={pending.flatMap((item) => (item.kind === "resource" ? [item.materialId] : []))}
        onConfirm={onAddResources}
        onOpenChange={setResourceModalOpen}
      />
    </div>
  );
}

function handleFileInput(event: React.ChangeEvent<HTMLInputElement>, onAddFiles: (files: File[]) => void) {
  const files = Array.from(event.target.files ?? []);
  if (files.length > 0) {
    onAddFiles(files);
  }
  event.target.value = "";
}

type AddMenuOption = { id: string; label: string; icon: LucideIcon; onSelect: () => void };

function ComposerAddMenu({ options }: { options: AddMenuOption[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        aria-expanded={open}
        aria-label="Hinzufügen"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
          open ? "bg-secondary text-foreground" : "",
        )}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <Plus className="size-5" strokeWidth={1.5} />
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-2xl bg-popover p-1.5 text-popover-foreground shadow-xl">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
                type="button"
                onClick={() => {
                  setOpen(false);
                  option.onSelect();
                }}
              >
                <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CourseSelector({
  courses,
  selectedCourse,
  selectedCourseId,
  onCourseChange,
}: {
  courses: Course[];
  selectedCourse: Course | null;
  selectedCourseId: string | null;
  onCourseChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="inline-flex max-w-full items-center gap-2.5 py-0.5 text-left text-sm font-medium transition-colors hover:text-foreground"
        type="button"
        onClick={() => setOpen(true)}
      >
        {selectedCourse ? (
          <CourseThumbnail circle course={selectedCourse} size="compact" />
        ) : (
          <GraduationCap className="size-4 shrink-0 text-muted-foreground opacity-70" />
        )}
        <span
          className={cn(
            "min-w-0 truncate",
            selectedCourse ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {selectedCourse ? courseTitle(selectedCourse) : "Kurs wählen"}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground opacity-70" />
      </button>

      <ChatCoursePickerModal
        courses={courses}
        open={open}
        selectedCourseId={selectedCourseId}
        onOpenChange={setOpen}
        onSelect={(courseId) => {
          onCourseChange(courseId);
          setOpen(false);
        }}
      />
    </>
  );
}
