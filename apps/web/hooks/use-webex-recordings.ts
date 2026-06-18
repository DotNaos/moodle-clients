import { useState } from "react";

import type { WebexRecording, WebexRecordingProgress, WebexRecordingState } from "@/lib/dashboard-data";
import { apiRequest, getErrorMessage } from "@/lib/moodle-api";

const RECORDING_STREAM_TIMEOUT_MS = 60_000;

export function useWebexRecordings() {
  const [recordingsByCourseId, setRecordingsByCourseId] = useState<Record<string, WebexRecordingState>>({});
  const [selectedRecordingByCourseId, setSelectedRecordingByCourseId] = useState<Record<string, WebexRecording | null>>({});

  function resetRecordings() {
    setRecordingsByCourseId({});
    setSelectedRecordingByCourseId({});
  }

  function selectedRecordingForCourse(courseId: string | null): WebexRecording | null {
    return courseId ? selectedRecordingByCourseId[courseId] ?? null : null;
  }

  function selectRecording(courseId: string, recording: WebexRecording) {
    setSelectedRecordingByCourseId((current) => ({
      ...current,
      [courseId]: recording,
    }));
    setRecordingsByCourseId((current) => {
      const cached = current[courseId];
      if (!cached?.streamError) {
        return current;
      }
      return {
        ...current,
        [courseId]: {
          ...cached,
          streamError: null,
        },
      };
    });
  }

  async function loadRecordings(courseId: string, options: { refresh?: boolean } = {}): Promise<WebexRecording[]> {
    const cached = recordingsByCourseId[courseId];
    if (!options.refresh && cached?.loaded) {
      return cached.recordings;
    }

    setRecordingsByCourseId((current) => ({
      ...current,
      [courseId]: {
        loading: true,
        loaded: cached?.loaded ?? false,
        error: null,
        recordings: cached?.recordings ?? [],
        resolvingRecordingUuid: cached?.resolvingRecordingUuid ?? null,
        streamError: null,
      },
    }));

    try {
      const response = await apiRequest<{ recordings?: WebexRecording[] }>(
        `/courses/${encodeURIComponent(courseId)}/recordings`,
      );
      const recordings = response.recordings ?? [];
      setRecordingsByCourseId((current) => ({
        ...current,
        [courseId]: {
          loading: false,
          loaded: true,
          error: null,
          recordings,
          resolvingRecordingUuid: current[courseId]?.resolvingRecordingUuid ?? null,
          streamError: null,
        },
      }));
      setSelectedRecordingByCourseId((current) => ({
        ...current,
        [courseId]: selectedFromRecordings(current[courseId], recordings),
      }));
      return recordings;
    } catch (loadError) {
      setRecordingsByCourseId((current) => ({
        ...current,
        [courseId]: {
          loading: false,
          loaded: cached?.loaded ?? false,
          error: getErrorMessage(loadError),
          recordings: cached?.recordings ?? [],
          resolvingRecordingUuid: null,
          streamError: null,
        },
      }));
    }

    return cached?.recordings ?? [];
  }

  async function resolveRecordingStream(courseId: string, recording: WebexRecording): Promise<WebexRecording | null> {
    const pendingRecording = recordingWithoutStream(recording);

    setSelectedRecordingByCourseId((current) => ({
      ...current,
      [courseId]: pendingRecording,
    }));
    setRecordingsByCourseId((current) => {
      const cached = current[courseId];
      const recordings = (cached?.recordings ?? [pendingRecording]).map((item) =>
        item.recordingUuid === pendingRecording.recordingUuid ? recordingWithoutStream(item) : item,
      );
      return {
        ...current,
        [courseId]: {
          loading: cached?.loading ?? false,
          loaded: cached?.loaded ?? true,
          error: cached?.error ?? null,
          recordings,
          resolvingRecordingUuid: recording.recordingUuid,
          streamError: null,
        },
      };
    });

    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), RECORDING_STREAM_TIMEOUT_MS);
    try {
      const response = await apiRequest<{ recording?: WebexRecording }>(
        `/courses/${encodeURIComponent(courseId)}/recordings/${encodeURIComponent(recording.recordingUuid)}/stream`,
        { signal: controller.signal },
      );
      const resolved = response.recording;
      if (!resolved?.streamUrl) {
        throw new Error("The recording URL could not be loaded.");
      }

      setRecordingsByCourseId((current) => {
        const cached = current[courseId];
        const recordings = (cached?.recordings ?? []).map((item) =>
          item.recordingUuid === recording.recordingUuid ? { ...item, ...resolved } : item,
        );
        return {
          ...current,
          [courseId]: {
            loading: false,
            loaded: true,
            error: null,
            recordings: recordings.length > 0 ? recordings : [resolved],
            resolvingRecordingUuid: null,
            streamError: null,
          },
        };
      });
      setSelectedRecordingByCourseId((current) => ({
        ...current,
        [courseId]: resolved,
      }));
      return resolved;
    } catch (resolveError) {
      setRecordingsByCourseId((current) => {
        const cached = current[courseId];
        return {
          ...current,
          [courseId]: {
            loading: cached?.loading ?? false,
            loaded: cached?.loaded ?? true,
            error: cached?.error ?? null,
            recordings: cached?.recordings ?? [recording],
            resolvingRecordingUuid: null,
            streamError: getErrorMessage(resolveError),
          },
        };
      });
      return null;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  async function saveRecordingProgress(
    courseId: string,
    recording: WebexRecording,
    progress: { positionSeconds: number; durationSeconds?: number; completed?: boolean },
  ): Promise<WebexRecordingProgress | null> {
    const response = await apiRequest<{ progress?: WebexRecordingProgress }>(
      `/courses/${encodeURIComponent(courseId)}/recordings/${encodeURIComponent(recording.recordingUuid)}/progress`,
      {
        method: "PUT",
        body: JSON.stringify({
          positionSeconds: Math.max(0, Math.round(progress.positionSeconds)),
          durationSeconds: Math.max(0, Math.round(progress.durationSeconds ?? recording.durationSeconds ?? 0)),
          completed: Boolean(progress.completed),
        }),
      },
    );
    const savedProgress = response.progress;
    if (!savedProgress) {
      return null;
    }

    setRecordingsByCourseId((current) => {
      const cached = current[courseId];
      if (!cached) {
        return current;
      }
      return {
        ...current,
        [courseId]: {
          ...cached,
          recordings: cached.recordings.map((item) =>
            item.recordingUuid === recording.recordingUuid ? { ...item, progress: savedProgress } : item,
          ),
        },
      };
    });
    setSelectedRecordingByCourseId((current) => {
      const selected = current[courseId];
      if (!selected || selected.recordingUuid !== recording.recordingUuid) {
        return current;
      }
      return {
        ...current,
        [courseId]: { ...selected, progress: savedProgress },
      };
    });
    return savedProgress;
  }

  async function signInWebexBrowser(courseId: string, credentials: { username: string; password: string }) {
    await apiRequest<{ savedSession: boolean }>("/webex/credentials", {
      method: "POST",
      body: JSON.stringify({ ...credentials, courseId }),
    });
  }

  return {
    loadRecordings,
    recordingsByCourseId,
    resetRecordings,
    resolveRecordingStream,
    saveRecordingProgress,
    signInWebexBrowser,
    selectRecording,
    selectedRecordingForCourse,
  };
}

function recordingWithoutStream(recording: WebexRecording): WebexRecording {
  const metadata = { ...recording };
  delete metadata.streamUrl;
  return metadata;
}

function selectedFromRecordings(
  selected: WebexRecording | null | undefined,
  recordings: WebexRecording[],
): WebexRecording | null {
  if (!selected) {
    return recordings[0] ?? null;
  }
  return recordings.find((recording) => recording.recordingUuid === selected.recordingUuid) ?? recordings[0] ?? null;
}
