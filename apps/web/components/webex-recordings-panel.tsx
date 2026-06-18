"use client";

import { Clock, KeyRound, Play, RefreshCw, Video } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { WebexRecordingPlayer } from "@/components/webex-recording-player";
import type { Course, WebexRecording, WebexRecordingState } from "@/lib/dashboard-data";
import { courseTitle } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export function WebexRecordingsPanel({
  course,
  state,
  selectedRecording,
  onLoad,
  onPlay,
  onProgress,
  onSignInWebexBrowser,
}: {
  course: Course | null;
  state: WebexRecordingState | undefined;
  selectedRecording: WebexRecording | null;
  onLoad: () => void;
  onPlay: (recording: WebexRecording) => void;
  onProgress?: (
    recording: WebexRecording,
    progress: { positionSeconds: number; durationSeconds?: number; completed?: boolean },
  ) => void;
  onSignInWebexBrowser: (credentials: { username: string; password: string }) => Promise<void>;
}) {
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const recordings = state?.recordings ?? [];
  const continueRecording = findContinueRecording(recordings);
  const activeRecording = selectedRecording ?? continueRecording ?? recordings[0] ?? null;
  const needsBrowserSignIn = state?.error?.toLowerCase().includes("credentials");

  async function submitBrowserSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setSignInError(null);
    try {
      await onSignInWebexBrowser({ username: username.trim(), password });
      setPassword("");
      onLoad();
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : "Webex browser sign-in failed.");
    } finally {
      setSigningIn(false);
    }
  }

  const showSignInOnly = Boolean(course && needsBrowserSignIn);

  return (
    <section className="flex min-h-[560px] flex-col overflow-hidden bg-card text-foreground dark:bg-[#0f0f0f] dark:text-white md:min-h-0 md:rounded-[2rem] md:bg-card md:text-foreground">
      <div className="flex items-start justify-between gap-4 px-5 py-6 md:px-6 md:py-5">
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-2xl font-semibold tracking-tight md:mt-1">
            {course ? courseTitle(course) : "No course selected"}
          </h2>
        </div>
        {showSignInOnly ? null : (
          <Button
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:bg-white/10 dark:text-white dark:hover:bg-white/15 md:bg-secondary md:text-secondary-foreground"
            type="button"
            variant="secondary"
            onClick={onLoad}
            disabled={!course || state?.loading}
          >
            {state?.loading ? <Spinner aria-hidden /> : <RefreshCw aria-hidden />}
            Refresh
          </Button>
        )}
      </div>

      {showSignInOnly ? (
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto px-5 pb-6 md:px-6">
          <form className="flex w-full max-w-lg flex-col items-center gap-5" onSubmit={submitBrowserSignIn}>
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-secondary text-foreground">
                <KeyRound className="size-6" aria-hidden />
              </span>
              <h3 className="text-lg font-semibold tracking-tight">Webex-Aufzeichnungen laden</h3>
            </div>
            <div className="flex w-full flex-col gap-3">
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="FHGR username"
                autoComplete="username"
              />
              <Input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type="password"
                autoComplete="current-password"
              />
              {signInError ? <p className="px-1 text-sm text-destructive">{signInError}</p> : null}
              <Button className="h-11 rounded-full" type="submit" disabled={signingIn || !username.trim() || !password}>
                {signingIn ? <Spinner aria-hidden /> : <KeyRound aria-hidden />}
                Moodle-Sitzung erneuern
              </Button>
            </div>
          </form>
        </div>
      ) : course ? (
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-0 pb-5 md:px-6 md:pb-6 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="relative z-10 flex shrink-0 flex-col gap-0 md:gap-4 xl:min-h-0 xl:shrink">
            {state?.error ? (
              <div className="mx-4 mb-4 rounded-3xl bg-destructive/10 px-4 py-3 text-sm text-destructive md:mx-0 md:mb-0">
                {state.error}
              </div>
            ) : null}
            <div className="relative shrink-0 overflow-hidden bg-black md:rounded-[1.75rem] md:shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
              {activeRecording?.streamUrl ? (
                <WebexRecordingPlayer
                  key={activeRecording.recordingUuid}
                  initialPositionSeconds={resumePosition(activeRecording)}
                  poster={activeRecording.coverUrl}
                  src={activeRecording.streamUrl}
                  onProgressChange={(progress) => onProgress?.(activeRecording, progress)}
                />
              ) : activeRecording ? (
                <RecordingStreamPreview
                  loading={state?.resolvingRecordingUuid === activeRecording.recordingUuid}
                  recording={activeRecording}
                  streamError={state?.streamError ?? null}
                  onPlay={() => onPlay(activeRecording)}
                />
              ) : (
                <div className="grid aspect-video place-items-center px-6 text-center">
                  <div className="max-w-sm">
                    <Video className="mx-auto mb-3 text-muted-foreground" aria-hidden />
                    <p className="font-medium text-background">{state?.loading ? "Loading recordings" : "No recording selected"}</p>
                    <p className="mt-1 text-sm text-background/70">
                      {state?.loading ? "The course-local Webex session is being opened." : "Load recordings, then choose one to play."}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {activeRecording ? <ActiveRecordingMobileMeta recording={activeRecording} /> : null}
          </div>

          <aside className="relative z-0 flex min-h-0 flex-col overflow-visible px-4 md:px-0 xl:overflow-hidden">
            <RecordingList
              recordings={recordings}
              selected={activeRecording}
              loading={state?.loading}
              resolvingRecordingUuid={state?.resolvingRecordingUuid}
              onPlay={onPlay}
            />
          </aside>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center px-8 py-8 text-center">
          <p className="text-sm text-muted-foreground">Choose a course to view its Webex recordings.</p>
        </div>
      )}
    </section>
  );
}

function RecordingStreamPreview({
  loading,
  onPlay,
  recording,
  streamError,
}: {
  loading: boolean;
  onPlay: () => void;
  recording: WebexRecording;
  streamError?: string | null;
}) {
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black text-white">
      {recording.coverUrl ? (
        <img alt="" className="absolute inset-0 h-full w-full object-cover opacity-72" src={recording.coverUrl} />
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#111_0%,#30343b_100%)]" />
      )}
      <div className="absolute inset-0 bg-black/35" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-4 pt-20 md:px-6 md:pb-6">
        <p className="line-clamp-1 text-lg font-semibold md:text-2xl">
          {recording.sessionTitle || recording.recordingName}
        </p>
        <p className="mt-1 text-sm text-white/72">
          {formatRecordingDate(recording.recordingDate)}
          {recording.durationSeconds ? ` · ${formatDuration(recording.durationSeconds)}` : ""}
        </p>
        {recordingProgressLabel(recording) ? (
          <p className="mt-1 text-sm font-medium text-white/86">{recordingProgressLabel(recording)}</p>
        ) : null}
        {loading ? (
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
              <div className="h-full w-2/3 rounded-full bg-white/90 animate-pulse" />
            </div>
            <p className="mt-2 text-sm text-white/72">Video wird vorbereitet...</p>
          </div>
        ) : streamError ? (
          <p className="mt-3 max-w-2xl text-sm font-medium text-white/86">{streamError}</p>
        ) : null}
      </div>
      <button
        className="absolute left-1/2 top-1/2 z-10 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/92 text-black shadow-2xl transition-transform hover:scale-105 disabled:cursor-wait disabled:opacity-75 md:size-20"
        type="button"
        aria-label={loading ? "Video is loading" : "Load video"}
        disabled={loading}
        onClick={onPlay}
      >
        {loading ? <Spinner aria-hidden /> : <Play className="ml-1 size-7 fill-current md:size-9" aria-hidden />}
      </button>
    </div>
  );
}

function ActiveRecordingMobileMeta({ recording }: { recording: WebexRecording }) {
  const duration = formatDuration(recording.durationSeconds);
  const progressLabel = recordingProgressLabel(recording);
  return (
    <div className="flex flex-col gap-2 px-4 pb-5 pt-3 md:hidden">
      <p className="line-clamp-2 text-lg font-semibold leading-tight">
        {recording.sessionTitle || recording.recordingName}
      </p>
      <p className="text-sm text-muted-foreground dark:text-white/62">
        {formatRecordingDate(recording.recordingDate)}
        {duration ? ` · ${duration}` : ""}
      </p>
      {progressLabel ? <p className="text-sm font-medium text-foreground dark:text-white/80">{progressLabel}</p> : null}
    </div>
  );
}

function RecordingList({
  recordings,
  resolvingRecordingUuid,
  selected,
  loading,
  onPlay,
}: {
  recordings: WebexRecording[];
  selected: WebexRecording | null;
  loading?: boolean;
  resolvingRecordingUuid?: string | null;
  onPlay: (recording: WebexRecording) => void;
}) {
  const content = useMemo(() => {
    if (loading) {
      return <div className="px-2 py-6 text-sm text-muted-foreground">Loading...</div>;
    }
    if (recordings.length === 0) {
      return <div className="px-2 py-6 text-sm text-muted-foreground">No playable recordings found for this course.</div>;
    }
    return recordings.map((recording) => {
      const active = selected?.recordingUuid === recording.recordingUuid;
      const resolving = resolvingRecordingUuid === recording.recordingUuid;
      return (
        <button
          key={recording.recordingUuid}
          className={cn(
            "group grid w-full grid-cols-[46%_minmax(0,1fr)] items-start gap-3 rounded-none py-2 text-left text-foreground transition-colors sm:grid-cols-[168px_minmax(0,1fr)] dark:text-white md:items-center md:rounded-[1.5rem] md:p-2 md:text-foreground",
            active ? "md:bg-secondary" : "md:hover:bg-secondary/70",
          )}
          type="button"
          disabled={resolving}
          onClick={() => onPlay(recording)}
        >
          <EpisodeThumbnail recording={recording} active={active} loading={resolving} />
          <span className="min-w-0 pr-2">
            <span className="block line-clamp-2 text-base font-semibold leading-tight md:truncate">
              {formatRecordingDate(recording.recordingDate)}
            </span>
            <span className="mt-1 block line-clamp-2 text-sm text-muted-foreground dark:text-white/60 md:text-muted-foreground">
              {recording.sessionTitle || recording.recordingName}
            </span>
            {recording.durationSeconds ? (
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground dark:text-white/55 md:mt-3 md:text-muted-foreground">
                <Clock size={13} aria-hidden />
                {formatDuration(recording.durationSeconds)}
              </span>
            ) : null}
            {recordingProgressLabel(recording) ? (
              <span className="mt-1 block text-xs font-medium text-foreground/80 dark:text-white/72 md:text-muted-foreground">
                {recordingProgressLabel(recording)}
              </span>
            ) : null}
          </span>
        </button>
      );
    });
  }, [loading, onPlay, recordings, resolvingRecordingUuid, selected]);

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {recordings.length > 0 ? (
        <div className="mb-2 flex items-center justify-between px-0 text-xl font-semibold text-foreground dark:text-white md:px-2 md:text-xs md:font-normal md:text-muted-foreground">
          <span>Recordings</span>
          <span className="text-sm font-normal text-muted-foreground dark:text-white/55 md:text-xs md:text-muted-foreground">{recordings.length}</span>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 md:gap-2">{content}</div>
    </div>
  );
}

function EpisodeThumbnail({
  active,
  loading,
  recording,
}: {
  active: boolean;
  loading?: boolean;
  recording: WebexRecording;
}) {
  const progress = recordingProgress(recording);
  return (
    <span className="relative block aspect-video overflow-hidden rounded-xl bg-black md:rounded-[1.1rem]">
      {recording.coverUrl ? (
        <img
          alt=""
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          src={recording.coverUrl}
        />
      ) : (
        <span className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#111_0%,#30343b_100%)] text-white/60">
          <Video size={24} aria-hidden />
        </span>
      )}
      <span className="absolute inset-0 bg-black/20" />
      <span
        className={cn(
          "absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-lg backdrop-blur",
          active ? "bg-white/28" : "bg-black/55",
        )}
      >
        {loading ? <Spinner aria-hidden /> : <Play className="ml-0.5" size={18} aria-hidden />}
      </span>
      {loading ? (
        <span className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/25">
          <span className="block h-full w-2/3 rounded-full bg-white/90 animate-pulse" />
        </span>
      ) : progress ? (
        <span className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-white/22">
          <span className="block h-full rounded-r-full bg-white" style={{ width: `${progress.percent}%` }} />
        </span>
      ) : null}
    </span>
  );
}

function findContinueRecording(recordings: WebexRecording[]): WebexRecording | null {
  return recordings.find((recording) => {
    const progress = recordingProgress(recording);
    return progress && !progress.completed && progress.positionSeconds >= 10;
  }) ?? null;
}

function resumePosition(recording: WebexRecording): number {
  const progress = recordingProgress(recording);
  if (!progress || progress.completed) {
    return 0;
  }
  return progress.positionSeconds >= 10 ? progress.positionSeconds : 0;
}

function recordingProgressLabel(recording: WebexRecording): string | null {
  const progress = recordingProgress(recording);
  if (!progress) {
    return null;
  }
  if (progress.completed) {
    return "Watched";
  }
  if (progress.remainingSeconds > 0) {
    return `Continue · ${formatDuration(progress.remainingSeconds) || "<1 min"} left`;
  }
  return `Continue at ${formatPlaybackTime(progress.positionSeconds)}`;
}

function recordingProgress(recording: WebexRecording): {
  completed: boolean;
  durationSeconds: number;
  percent: number;
  positionSeconds: number;
  remainingSeconds: number;
} | null {
  const stored = recording.progress;
  const positionSeconds = Math.max(0, Math.round(stored?.positionSeconds ?? 0));
  const durationSeconds = Math.max(0, Math.round(stored?.durationSeconds ?? recording.durationSeconds ?? 0));
  const completed = Boolean(stored?.completed || durationSeconds > 0 && durationSeconds - positionSeconds <= 15 && positionSeconds > 0);
  if (!completed && positionSeconds < 5) {
    return null;
  }
  const percent = durationSeconds > 0 ? Math.max(0, Math.min(100, positionSeconds / durationSeconds * 100)) : 0;
  return {
    completed,
    durationSeconds,
    percent: completed ? 100 : percent,
    positionSeconds,
    remainingSeconds: Math.max(0, durationSeconds - positionSeconds),
  };
}

function formatRecordingDate(value: string): string {
  if (!value) {
    return "Recording";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds < 60) {
    return "";
  }
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) {
    return `${minutes} min`;
  }
  return `${hours} h ${remainingMinutes.toString().padStart(2, "0")} min`;
}

function formatPlaybackTime(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
