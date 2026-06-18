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
  onSignInWebexBrowser,
}: {
  course: Course | null;
  state: WebexRecordingState | undefined;
  selectedRecording: WebexRecording | null;
  onLoad: () => void;
  onPlay: (recording: WebexRecording) => void;
  onSignInWebexBrowser: (credentials: { username: string; password: string }) => Promise<void>;
}) {
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const recordings = state?.recordings ?? [];
  const activeRecording = selectedRecording ?? recordings[0] ?? null;
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
    <section className="flex min-h-[560px] flex-col overflow-hidden rounded-[1.5rem] bg-card md:min-h-0 md:rounded-[2rem]">
      <div className="flex items-start justify-between gap-4 px-5 py-5 md:px-6">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Webex recordings</p>
          <h2 className="mt-1 line-clamp-2 text-2xl font-semibold tracking-tight">
            {course ? courseTitle(course) : "No course selected"}
          </h2>
        </div>
        {showSignInOnly ? null : (
          <Button type="button" variant="secondary" onClick={onLoad} disabled={!course || state?.loading}>
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
        <div className="grid min-h-0 flex-1 gap-4 overflow-auto px-4 pb-4 2xl:grid-cols-[minmax(0,1fr)_290px]">
          <div className="flex min-h-0 flex-col gap-3">
            {state?.error ? (
              <div className="rounded-3xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {state.error}
              </div>
            ) : null}
            <div className="overflow-hidden rounded-[1.5rem] bg-black">
              {activeRecording?.streamUrl ? (
                <WebexRecordingPlayer
                  key={activeRecording.recordingUuid}
                  poster={activeRecording.coverUrl}
                  src={activeRecording.streamUrl}
                />
              ) : (
                <div className="grid aspect-video min-h-[260px] place-items-center px-6 text-center">
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
            {activeRecording ? <ActiveRecordingMeta recording={activeRecording} /> : null}
          </div>

          <aside className="flex min-h-0 flex-col overflow-hidden">
            <RecordingList recordings={recordings} selected={activeRecording} loading={state?.loading} onPlay={onPlay} />
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

function ActiveRecordingMeta({ recording }: { recording: WebexRecording }) {
  const duration = formatDuration(recording.durationSeconds);
  return (
    <div className="flex flex-col gap-2 rounded-[1.25rem] bg-secondary px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{recording.sessionTitle || recording.recordingName}</p>
        <p className="mt-1 text-xs text-muted-foreground">{formatRecordingDate(recording.recordingDate)}</p>
      </div>
      {duration ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Clock size={14} aria-hidden />
          {duration}
        </span>
      ) : null}
    </div>
  );
}

function RecordingList({
  recordings,
  selected,
  loading,
  onPlay,
}: {
  recordings: WebexRecording[];
  selected: WebexRecording | null;
  loading?: boolean;
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
      return (
        <button
          key={recording.recordingUuid}
          className={cn(
            "flex w-full items-center gap-3 rounded-3xl px-3 py-2.5 text-left transition-colors",
            active ? "bg-secondary text-foreground" : "hover:bg-secondary/70",
          )}
          type="button"
          onClick={() => onPlay(recording)}
        >
          <span
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground",
              active && "bg-primary text-primary-foreground",
            )}
          >
            <Play size={16} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{formatRecordingDate(recording.recordingDate)}</span>
            <span className="block line-clamp-2 text-xs text-muted-foreground">
              {recording.sessionTitle || recording.recordingName}
            </span>
          </span>
        </button>
      );
    });
  }, [loading, onPlay, recordings, selected]);

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {recordings.length > 0 ? (
        <div className="mb-2 flex items-center justify-between px-2 text-xs text-muted-foreground">
          <span>Recordings</span>
          <span>{recordings.length}</span>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">{content}</div>
    </div>
  );
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
