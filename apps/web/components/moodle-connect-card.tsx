"use client";

import { CheckCircle2, Copy, ExternalLink, Loader2, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMobileClientDownloadUrl } from "@/lib/mobile-client";

type MoodleConnectCardProps = {
  onConnected: () => void;
  reason?: string | null;
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

export function MoodleConnectCard({ onConnected, reason }: MoodleConnectCardProps) {
  const mobileClientDownloadUrl = getMobileClientDownloadUrl();
  const [state, setState] = useState<BridgeState>("starting");
  const [bridgeUrl, setBridgeUrl] = useState("");
  const [challenge, setChallenge] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [credentialLoading, setCredentialLoading] = useState(false);

  const startBridge = useCallback(async () => {
    setState("starting");
    setBridgeUrl("");
    setChallenge("");
    setExpiresAt("");
    setBridgeError(null);
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
      setBridgeError(getErrorMessage(startError));
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
          setBridgeError("This bridge QR expired. Create a new one and scan it again.");
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not check the bridge status.");
        }
        if (payload.status === "connected") {
          setState("connected");
          setBridgeError(null);
          onConnected();
        }
      } catch (pollError) {
        if (!cancelled) {
          setState("failed");
          setBridgeError(getErrorMessage(pollError));
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
      setBridgeError(getErrorMessage(copyError));
    }
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCredentialLoading(true);
    setCredentialError(null);
    try {
      const response = await fetch("/api/moodle/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not connect Moodle account.");
      }
      setPassword("");
      setState("connected");
      onConnected();
    } catch (loginError) {
      setCredentialError(getErrorMessage(loginError));
    } finally {
      setCredentialLoading(false);
    }
  }

  const connectError = credentialError ? getConnectErrorMessage(credentialError) : null;
  const bridgeMessage = bridgeError ? getBridgeErrorMessage(bridgeError) : null;

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-6 sm:px-6 sm:py-8 md:grid-cols-2 md:items-start md:px-8 md:py-10">
      <div className="space-y-6">
        <div className="space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Connect Moodle</h2>
          {reason ? (
            <p className="max-w-md rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium leading-6 text-destructive">
              {reason}
            </p>
          ) : null}
        </div>

        <form className="space-y-3" onSubmit={submitCredentials}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">FHGR username</span>
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="username"
              autoComplete="username"
              className="h-12 px-5 focus-visible:ring-2 focus-visible:ring-primary/25"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">Password</span>
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Moodle password"
              type="password"
              autoComplete="current-password"
              className="h-12 px-5 focus-visible:ring-2 focus-visible:ring-primary/25"
            />
          </label>
          <Button className="h-12 w-full rounded-full text-base" type="submit" disabled={credentialLoading || !username.trim() || !password}>
            {credentialLoading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Connect
          </Button>
        </form>

        {connectError ? <Alert className="bg-red-500/10 text-red-700">{connectError}</Alert> : null}
      </div>

      <div className="space-y-6 md:pt-2">
        <div>
          <h3 className="text-lg font-semibold tracking-tight sm:text-xl">iPhone bridge</h3>
        </div>

        <div className="grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
          <div className="grid aspect-square w-36 max-w-full place-items-center rounded-[1.25rem] bg-secondary p-4 sm:w-44">
            {state === "starting" ? (
              <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            ) : bridgeUrl ? (
              <QRCodeSVG className="h-full w-full max-w-[152px]" value={bridgeUrl} size={152} marginSize={1} />
            ) : (
              <QrCode className="size-8 text-muted-foreground" aria-hidden />
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              {state === "connected" ? (
                <CheckCircle2 className="size-4 text-primary" aria-hidden />
              ) : state === "waiting" ? (
                <Smartphone className="size-4 text-primary" aria-hidden />
              ) : state === "failed" ? (
                <QrCode className="size-4 text-muted-foreground" aria-hidden />
              ) : (
                <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
              )}
              {getStatusLabel(state)}
            </div>
            {expiresAt ? (
              <p className="text-xs text-muted-foreground">
                Valid until {new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
              </p>
            ) : null}
            {bridgeMessage ? <p className="max-w-sm text-sm leading-6 text-muted-foreground">{bridgeMessage}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void copyBridgeURL()} disabled={!bridgeUrl}>
                <Copy aria-hidden />
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => void startBridge()}>
                <RefreshCw aria-hidden />
                New QR
              </Button>
            </div>
          </div>
        </div>

        <Button asChild variant="ghost" className="w-fit rounded-full px-0 hover:bg-transparent">
          <a href={mobileClientDownloadUrl} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden />
            Download Moodle Client
          </a>
        </Button>
      </div>
    </section>
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
      return "Bridge unavailable";
  }
}

function getConnectErrorMessage(error: string): string {
  if (error === "Could not connect Moodle account.") {
    return "Moodle login failed. Check your FHGR username and password, then try again.";
  }
  return error;
}

function getBridgeErrorMessage(error: string): string {
  if (error === "Unauthorized") {
    return "Bridge setup is not available in this session.";
  }
  return error;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
