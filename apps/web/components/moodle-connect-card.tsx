"use client";

import jsQR from "jsqr";
import { Camera, CheckCircle2, ImageUp, Loader2, QrCode, TextCursorInput, X } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type MoodleConnectCardProps = {
  onConnected: () => void;
};

type CameraState = "idle" | "starting" | "active";

export function MoodleConnectCard({ onConnected }: MoodleConnectCardProps) {
  const [qrValue, setQrValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (cameraState !== "starting") {
      return;
    }

    let cancelled = false;
    let animationFrame = 0;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const scan = () => {
          const video = videoRef.current;
          if (!video || !context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            animationFrame = window.requestAnimationFrame(scan);
            return;
          }
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(imageData.data, imageData.width, imageData.height);
          if (result?.data) {
            setQrValue(result.data);
            stopCamera();
            void submitQRCode(result.data);
            return;
          }
          animationFrame = window.requestAnimationFrame(scan);
        };
        animationFrame = window.requestAnimationFrame(scan);
      } catch (scanError) {
        setCameraState("idle");
        setError(getErrorMessage(scanError));
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      stopCamera();
    };
  }, [cameraState]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setError(null);
    setStatus("Reading QR image");
    try {
      const decoded = await decodeQRCodeFile(file);
      setQrValue(decoded);
      await submitQRCode(decoded);
    } catch (decodeError) {
      setStatus(null);
      setError(getErrorMessage(decodeError));
    }
  }

  async function submitQRCode(value = qrValue) {
    const qr = value.trim();
    if (!qr) {
      setError("Paste or scan the Moodle QR code first.");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Connecting Moodle");
    try {
      const response = await fetch("/api/moodle/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Connection failed with ${response.status}`);
      }
      setStatus("Moodle connected");
      onConnected();
    } catch (connectError) {
      setStatus(null);
      setError(getErrorMessage(connectError));
    } finally {
      setBusy(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraState("idle");
  }

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <QrCode aria-hidden />
        </div>
        <CardTitle>Connect Moodle</CardTitle>
        <CardDescription>
          Sign in to Moodle on your laptop, open the mobile app QR code there, then scan it here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        {status ? (
          <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
            {status}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            className="h-12"
            type="button"
            onClick={() => setCameraState("starting")}
            disabled={busy || cameraState !== "idle"}
          >
            {cameraState !== "idle" ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
            Scan with camera
          </Button>
          <Button
            className="h-12"
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            <ImageUp aria-hidden />
            Upload image
          </Button>
        </div>

        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
        />

        {cameraState !== "idle" ? (
          <div className="overflow-hidden rounded-[2rem] bg-primary p-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[1.5rem] bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <Button
                className="absolute right-3 top-3"
                size="icon"
                type="button"
                variant="secondary"
                onClick={stopCamera}
              >
                <X aria-hidden />
                <span className="sr-only">Stop camera</span>
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="qr-value">
            QR code value
          </label>
          <div className="flex gap-2">
            <Input
              id="qr-value"
              value={qrValue}
              onChange={(event) => setQrValue(event.target.value)}
              placeholder="moodlemobile://..."
            />
            <Button type="button" onClick={() => void submitQRCode()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <TextCursorInput aria-hidden />}
              Connect
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

async function decodeQRCodeFile(file: File): Promise<string> {
  const image = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not read the QR image.");
  }
  context.drawImage(image, 0, 0);
  image.close();
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(imageData.data, imageData.width, imageData.height);
  if (!result?.data) {
    throw new Error("No QR code was found in that image.");
  }
  return result.data;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
