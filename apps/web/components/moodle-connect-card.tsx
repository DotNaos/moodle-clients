"use client";

import { CheckCircle2, Copy, Loader2, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type MoodleConnectCardProps = {
  onConnected: () => void;
};

type BridgeStartResponse = {
  bridgeUrl?: string;
  challenge?: string;
  expiresAt?: string;
  error?: string;
};

type BridgeStatusResponse = {
  status?: "pending" | "connected" | "expired";
  error?: string;
};

type BridgeState = "starting" | "waiting" | "connected" | "failed";

export function MoodleConnectCard({ onConnected }: MoodleConnectCardProps) {
  const [state, setState] = useState<BridgeState>("starting");
  const [bridgeUrl, setBridgeUrl] = useState("");
  const [challenge, setChallenge] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const startBridge = useCallback(async () => {
    setState("starting");
    setBridgeUrl("");
    setChallenge("");
    setExpiresAt("");
    setError(null);
    setCopied(false);

    try {
      const response = await fetch("/api/mobile/bridge/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as BridgeStartResponse;
      if (!response.ok || !payload.bridgeUrl || !payload.challenge) {
        throw new Error(payload.error ?? "Could not create a mobile bridge QR.");
      }
      setBridgeUrl(payload.bridgeUrl);
      setChallenge(payload.challenge);
      setExpiresAt(payload.expiresAt ?? "");
      setState("waiting");
    } catch (startError) {
      setState("failed");
      setError(getErrorMessage(startError));
    }
  }, []);

  useEffect(() => {
    void startBridge();
  }, [startBridge]);

  useEffect(() => {
    if (state !== "waiting" || !challenge) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/mobile/bridge/status?challenge=${encodeURIComponent(challenge)}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as BridgeStatusResponse;
        if (cancelled) {
          return;
        }
        if (response.status === 410 || payload.status === "expired") {
          setState("failed");
          setError("This bridge QR expired. Create a new one and scan it again.");
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not check the bridge status.");
        }
        if (payload.status === "connected") {
          setState("connected");
          setError(null);
          onConnected();
        }
      } catch (pollError) {
        if (!cancelled) {
          setState("failed");
          setError(getErrorMessage(pollError));
        }
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 2000);
    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [challenge, onConnected, state]);

  async function copyBridgeURL() {
    if (!bridgeUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(bridgeUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (copyError) {
      setError(getErrorMessage(copyError));
    }
  }

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <QrCode aria-hidden />
        </div>
        <CardTitle>Connect Moodle</CardTitle>
        <CardDescription>
          Open Moodle Client on your iPhone, scan this bridge QR, then approve sharing your Moodle login.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}

        <div className="rounded-3xl bg-muted p-4">
          <div className="grid gap-4 sm:grid-cols-[220px_1fr] sm:items-center">
            <div className="grid aspect-square place-items-center rounded-2xl bg-white p-4">
              {state === "starting" ? (
                <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
              ) : bridgeUrl ? (
                <QRCodeSVG value={bridgeUrl} size={184} marginSize={1} />
              ) : (
                <QrCode className="size-10 text-muted-foreground" aria-hidden />
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                {state === "connected" ? (
                  <CheckCircle2 className="text-primary" aria-hidden />
                ) : state === "waiting" ? (
                  <Smartphone className="text-primary" aria-hidden />
                ) : (
                  <Loader2 className="animate-spin text-primary" aria-hidden />
                )}
                {getStatusLabel(state)}
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                The QR only contains this website origin and a short-lived one-time challenge. Your Moodle token is sent
                back only after you approve it on the phone.
              </p>
              {expiresAt ? (
                <p className="text-xs text-muted-foreground">
                  Expires at {new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => void copyBridgeURL()} disabled={!bridgeUrl}>
                  <Copy aria-hidden />
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => void startBridge()}>
                  <RefreshCw aria-hidden />
                  New QR
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getStatusLabel(state: BridgeState): string {
  switch (state) {
    case "starting":
      return "Creating bridge QR";
    case "waiting":
      return "Waiting for iPhone approval";
    case "connected":
      return "Moodle connected";
    case "failed":
      return "Bridge needs attention";
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
