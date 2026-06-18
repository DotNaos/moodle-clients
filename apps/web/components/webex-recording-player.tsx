"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { isHLSStreamUrl, nativeHLSMimeTypes } from "@/lib/webex-recording-playback";

type PlaybackState = "ready" | "unsupported" | "failed";

export function WebexRecordingPlayer({
  poster,
  src,
}: {
  poster?: string;
  src: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<PlaybackState>("ready");
  const usesHLS = isHLSStreamUrl(src);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !usesHLS) {
      setState("ready");
      return;
    }

    let disposed = false;
    let hls: { destroy: () => void } | null = null;

    setState("ready");
    video.removeAttribute("src");
    video.load();

    if (canPlayNativeHLS(video)) {
      video.src = src;
      video.load();
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }

    void import("hls.js")
      .then(({ default: Hls }) => {
        if (disposed) {
          return;
        }
        if (!Hls.isSupported()) {
          setState("unsupported");
          return;
        }

        const instance = new Hls({ enableWorker: true });
        hls = instance;
        instance.loadSource(src);
        instance.attachMedia(video);
        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setState("failed");
          }
        });
      })
      .catch(() => {
        if (!disposed) {
          setState("failed");
        }
      });

    return () => {
      disposed = true;
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [src, usesHLS]);

  return (
    <div className="relative aspect-video w-full">
      <video
        ref={videoRef}
        key={src}
        className="absolute inset-0 h-full w-full object-contain"
        controls
        controlsList="nodownload"
        poster={poster}
        preload="metadata"
        src={usesHLS ? undefined : src}
      />
      {state !== "ready" ? (
        <div className="absolute inset-0 grid place-items-center bg-black px-6 text-center text-background">
          <div className="max-w-sm">
            <AlertTriangle className="mx-auto mb-3 text-background/70" aria-hidden />
            <p className="font-medium">
              {state === "unsupported" ? "This browser cannot play this recording." : "This recording could not be started."}
            </p>
            <p className="mt-1 text-sm text-background/70">
              Refresh the recordings list, then try the episode again.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function canPlayNativeHLS(video: HTMLVideoElement): boolean {
  return nativeHLSMimeTypes().some((mimeType) => video.canPlayType(mimeType) !== "");
}
