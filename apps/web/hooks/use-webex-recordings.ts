import { useState } from "react";

import type { WebexRecording, WebexRecordingState } from "@/lib/dashboard-data";
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
        },
      }));
      setSelectedRecordingByCourseId((current) => ({
        ...current,
        [courseId]: current[courseId] ?? recordings[0] ?? null,
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
        },
      }));
    }

    return cached?.recordings ?? [];
  }

  async function resolveRecordingStream(courseId: string, recording: WebexRecording): Promise<WebexRecording | null> {
    if (recording.streamUrl) {
      selectRecording(courseId, recording);
      return recording;
    }

    setSelectedRecordingByCourseId((current) => ({
      ...current,
      [courseId]: recording,
    }));
    setRecordingsByCourseId((current) => {
      const cached = current[courseId];
      return {
        ...current,
        [courseId]: {
          loading: cached?.loading ?? false,
          loaded: cached?.loaded ?? true,
          error: null,
          recordings: cached?.recordings ?? [recording],
          resolvingRecordingUuid: recording.recordingUuid,
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
            error: getErrorMessage(resolveError),
            recordings: cached?.recordings ?? [recording],
            resolvingRecordingUuid: null,
          },
        };
      });
      return null;
    } finally {
      globalThis.clearTimeout(timeout);
    }
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
    signInWebexBrowser,
    selectRecording,
    selectedRecordingForCourse,
  };
}
