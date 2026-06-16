"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { CodexActionResult } from "@/hooks/use-codex-moodle-actions";
import type { MoodleUIAction } from "@/lib/codex-actions";
import {
  buildActionFollowUpMessage,
  buildAttachmentPrompt,
  buildMoodleContext,
  completeCodexActions,
  describePendingActions,
  displayCodexText,
  isCodexLifecycleNoise,
  mergeLoadedDocuments,
  mergeLoadedResources,
  shouldContinueAfterActions,
  toChatHistory,
  type CodexChatUIMessage,
  type CodexToolStatus,
  type LoadedDocumentContext,
  type LoadedResourceContext,
  type StudyChatContext,
} from "@/lib/codex-chat";
import type { CodexAttachment } from "@/lib/codex-files";
import { runCodexStream } from "@/lib/codex-stream-client";
import type { Course, Material, User } from "@/lib/dashboard-data";
import { buildPDFImageInputs, type PDFViewState } from "@/lib/pdf-context";

const MAX_CODEX_ACTION_TURNS = 8;

type UseCodexChatInput = {
  user: User | null;
  courses: Course[];
  selectedCourse: Course | null;
  materials: Material[];
  selectedMaterial: Material | null;
  pdfState: PDFViewState | null;
  studyContext?: StudyChatContext;
  model?: string;
  reasoningEffort?: string;
  onApplyActions: (actions: MoodleUIAction[]) => Promise<CodexActionResult>;
};

export function useCodexChat({
  user,
  courses,
  selectedCourse,
  materials,
  selectedMaterial,
  pdfState,
  studyContext,
  model,
  reasoningEffort,
  onApplyActions,
}: UseCodexChatInput) {
  const [messages, setMessages] = useState<CodexChatUIMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef(0);
  const abortModesRef = useRef(new Map<number, "steer" | "stop">());
  const actionConfirmationResolversRef = useRef(
    new Map<string, (approved: boolean) => void>(),
  );

  function setRunningState(value: boolean) {
    runningRef.current = value;
    setRunning(value);
  }

  function updateAssistantMessage(messageId: string, text: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, text } : message,
      ),
    );
  }

  function recordToolEvent(
    messageId: string,
    title: string,
    status: CodexToolStatus,
    sourceId?: string,
  ) {
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) {
          return message;
        }
        const toolEvents = [...message.toolEvents];
        // Correlate updates to an existing row: prefer the backend id; with no
        // id (legacy), a "running" event always starts a new row while a
        // terminal one updates the most recent still-running row of that title.
        const matchIndex =
          sourceId !== undefined
            ? toolEvents.findIndex((event) => event.sourceId === sourceId)
            : status === "running"
              ? -1
              : lastRunningIndexByTitle(toolEvents, title);
        if (matchIndex >= 0) {
          toolEvents[matchIndex] = { ...toolEvents[matchIndex], title, status };
          return { ...message, toolEvents };
        }
        toolEvents.push({ id: crypto.randomUUID(), sourceId, title, status });
        return { ...message, toolEvents };
      }),
    );
  }

  function appendAssistantActions(
    messageId: string,
    actions: CodexChatUIMessage["actions"],
  ) {
    if (actions.length === 0) {
      return;
    }
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, actions: [...message.actions, ...actions] }
          : message,
      ),
    );
  }

  function updateAssistantActionRequest(
    messageId: string,
    requestId: string,
    patch: Partial<CodexChatUIMessage["actions"][number]>,
  ) {
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) {
          return message;
        }
        return {
          ...message,
          actions: message.actions.map((action) =>
            action.requestId === requestId
              ? { ...action, ...patch, showControls: false }
              : action,
          ),
        };
      }),
    );
  }

  function waitForActionConfirmation(requestId: string): Promise<boolean> {
    return new Promise((resolve) => {
      actionConfirmationResolversRef.current.set(requestId, resolve);
    });
  }

  function resolveActionRequest(requestId: string, approved: boolean) {
    const resolve = actionConfirmationResolversRef.current.get(requestId);
    if (!resolve) {
      return;
    }
    actionConfirmationResolversRef.current.delete(requestId);
    resolve(approved);
  }

  function resolveAllActionRequests(approved: boolean) {
    for (const [
      requestId,
      resolve,
    ] of actionConfirmationResolversRef.current.entries()) {
      actionConfirmationResolversRef.current.delete(requestId);
      resolve(approved);
    }
  }

  function confirmActionRequest(requestId: string) {
    resolveActionRequest(requestId, true);
  }

  function cancelActionRequest(requestId: string) {
    resolveActionRequest(requestId, false);
  }

  function stop(mode: "steer" | "stop" = "stop") {
    resolveAllActionRequests(false);
    const controller = abortControllerRef.current;
    if (!controller) {
      setRunningState(false);
      return;
    }
    abortModesRef.current.set(activeRunIdRef.current, mode);
    controller.abort();
    if (mode === "stop") {
      setRunningState(false);
    }
  }

  function reset(nextMessages: CodexChatUIMessage[] = []) {
    resolveAllActionRequests(false);
    const controller = abortControllerRef.current;
    if (controller) {
      abortModesRef.current.set(activeRunIdRef.current, "stop");
      controller.abort();
    }
    activeRunIdRef.current += 1;
    abortControllerRef.current = null;
    abortModesRef.current.clear();
    setMessages(nextMessages);
    setError(null);
    setRunningState(false);
  }

  async function submit(rawText: string, attachments: CodexAttachment[] = []) {
    const text = rawText.trim();
    if (!text && attachments.length === 0) {
      return;
    }
    if (runningRef.current) {
      stop("steer");
    }
    resolveAllActionRequests(false);
    const abortController = new AbortController();
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    abortControllerRef.current = abortController;
    const backendPrompt = buildAttachmentPrompt(text, attachments);
    // Image attachments are passed by basename so the backend can attach them
    // to `codex exec -i` (vision over the uploaded file).
    const attachmentImages = attachments
      .filter((attachment) => attachment.kind === "image")
      .map((attachment) => attachment.name);

    const userMessage: CodexChatUIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      toolEvents: [],
      actions: [],
      attachments,
    };
    const assistantMessageId = crypto.randomUUID();
    let chatHistory = toChatHistory([...messages, userMessage]);
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantMessageId,
        role: "assistant",
        text: "Thinking...",
        toolEvents: [],
        actions: [],
        attachments: [],
      },
    ]);
    setRunningState(true);
    setError(null);

    try {
      let loadedResources: LoadedResourceContext = [];
      let loadedDocuments: LoadedDocumentContext = [];
      let reachedActionLimit = false;

      for (let turn = 0; turn < MAX_CODEX_ACTION_TURNS; turn += 1) {
        let streamedText = "";
        const result = await runCodexStream(
          {
            prompt: backendPrompt,
            images: buildPDFImageInputs(pdfState),
            attachmentImages,
            messages: chatHistory,
            model: model || undefined,
            reasoningEffort: reasoningEffort || undefined,
            stream: true,
            moodleContext: buildMoodleContext({
              user,
              courses,
              selectedCourse,
              materials,
              selectedMaterial,
              pdfState,
              studyContext,
              loadedResources,
              loadedDocuments,
            }),
          },
          (event) => {
            if (event.type === "message") {
              streamedText = event.text;
              updateAssistantMessage(
                assistantMessageId,
                displayCodexText(streamedText),
              );
            } else if (event.type === "delta") {
              streamedText += event.text;
              updateAssistantMessage(
                assistantMessageId,
                displayCodexText(streamedText),
              );
            } else if (
              event.type === "tool" &&
              !isCodexLifecycleNoise(event.title)
            ) {
              recordToolEvent(
                assistantMessageId,
                event.title,
                event.status,
                event.id,
              );
            }
            // "status" events — and lifecycle noise mislabeled as "tool" by older
            // backends — are intentionally ignored (hidden in UI).
          },
          { signal: abortController.signal },
        );

        const actions = completeCodexActions(result.actions, text);
        updateAssistantMessage(
          assistantMessageId,
          displayCodexText(result.finalResponse),
        );

        if (actions.length === 0) {
          break;
        }

        const requestId = crypto.randomUUID();
        appendAssistantActions(
          assistantMessageId,
          describePendingActions(actions, courses, materials, requestId),
        );
        setRunningState(false);
        const approved = await waitForActionConfirmation(requestId);
        if (!approved) {
          updateAssistantActionRequest(assistantMessageId, requestId, {
            status: "cancelled",
          });
          break;
        }

        setRunningState(true);
        updateAssistantActionRequest(assistantMessageId, requestId, {
          status: "running",
        });
        let actionResult: CodexActionResult;
        try {
          actionResult = await onApplyActions(actions);
        } catch (actionError) {
          updateAssistantActionRequest(assistantMessageId, requestId, {
            status: "failed",
            error:
              actionError instanceof Error
                ? actionError.message
                : "Aktion fehlgeschlagen.",
          });
          break;
        }
        loadedResources = mergeLoadedResources(
          loadedResources,
          actionResult.loadedResources,
        );
        loadedDocuments = mergeLoadedDocuments(
          loadedDocuments,
          actionResult.loadedDocuments,
        );
        const resourceNames = actionResult.loadedResources.flatMap((entry) =>
          entry.resources.map((resource) => resource.name),
        );
        const documentNames = actionResult.loadedDocuments.map(
          (entry) => entry.material.name,
        );
        updateAssistantActionRequest(assistantMessageId, requestId, {
          status: "completed",
          detail:
            resourceNames.length > 0 || documentNames.length > 0
              ? `${resourceNames.length + documentNames.length} Materialien`
              : undefined,
          resources: [...resourceNames, ...documentNames],
        });

        if (!shouldContinueAfterActions(actions, actionResult)) {
          break;
        }

        if (turn === MAX_CODEX_ACTION_TURNS - 1) {
          reachedActionLimit = true;
          break;
        }

        chatHistory = [
          ...chatHistory,
          {
            role: "assistant",
            text: buildActionFollowUpMessage(
              actions,
              actionResult.loadedResources,
              actionResult.loadedDocuments,
            ),
          },
        ];
      }

      if (reachedActionLimit) {
        setError(
          "Codex needed too many Moodle UI steps. Try asking for a more specific course or file.",
        );
      }
    } catch (submitError) {
      if (isAbortError(submitError)) {
        finalizeAbortedAssistantMessage(
          assistantMessageId,
          abortModesRef.current.get(runId) ?? "stop",
          setMessages,
        );
        return;
      }
      setMessages((current) =>
        current.filter((message) => message.id !== assistantMessageId),
      );
      setError(
        submitError instanceof Error ? submitError.message : "Codex failed.",
      );
    } finally {
      abortModesRef.current.delete(runId);
      if (activeRunIdRef.current === runId) {
        abortControllerRef.current = null;
        setRunningState(false);
      }
    }
  }

  useEffect(() => () => stop("stop"), []);

  return {
    messages,
    running,
    error,
    reset,
    submit,
    stop,
    setError,
    confirmActionRequest,
    cancelActionRequest,
  };
}

function lastRunningIndexByTitle(
  toolEvents: CodexChatUIMessage["toolEvents"],
  title: string,
): number {
  for (let index = toolEvents.length - 1; index >= 0; index -= 1) {
    if (
      toolEvents[index].title === title &&
      toolEvents[index].status === "running"
    ) {
      return index;
    }
  }
  return -1;
}

function finalizeAbortedAssistantMessage(
  messageId: string,
  mode: "steer" | "stop",
  setMessages: Dispatch<SetStateAction<CodexChatUIMessage[]>>,
) {
  setMessages((current) =>
    current.flatMap((message) => {
      if (message.id !== messageId) {
        return [message];
      }
      if (message.text !== "Thinking...") {
        return [message];
      }
      if (mode === "steer") {
        return [];
      }
      return [{ ...message, text: "Gestoppt." }];
    }),
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
