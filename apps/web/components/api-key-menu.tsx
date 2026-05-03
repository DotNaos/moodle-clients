"use client";

import { Check, ChevronDown, Copy, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type CreateAPIKeyResponse = {
  apiKey?: string;
  apiKeyRecord?: {
    keyPrefix?: string;
    createdAt?: string;
  };
  revokedExisting?: boolean;
  error?: string;
};

export function APIKeyMenu() {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [apiKey, setAPIKey] = useState("");
  const [prefix, setPrefix] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function createAPIKey() {
    setCreating(true);
    setError(null);
    setCopied(false);

    try {
      const response = await fetch("/api/moodle/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Moodle Web API key",
          revokeExisting: true,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as CreateAPIKeyResponse;
      if (!response.ok || !payload.apiKey) {
        throw new Error(payload.error ?? "Could not create an API key.");
      }
      setAPIKey(payload.apiKey);
      setPrefix(payload.apiKeyRecord?.keyPrefix ?? "");
    } catch (createError) {
      setAPIKey("");
      setPrefix("");
      setError(getErrorMessage(createError));
    } finally {
      setCreating(false);
    }
  }

  async function copyAPIKey() {
    if (!apiKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (copyError) {
      setError(getErrorMessage(copyError));
    }
  }

  return (
    <div className="relative">
      <Button type="button" variant="secondary" onClick={() => setOpen((current) => !current)}>
        <KeyRound data-icon="inline-start" aria-hidden />
        API key
        <ChevronDown data-icon="inline-end" aria-hidden />
      </Button>

      {open ? (
        <div className="absolute right-0 top-12 w-[min(92vw,420px)] rounded-[1.75rem] bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold tracking-tight">API key</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Create a fresh key for tools outside this website. Creating one invalidates older active API keys.
              </p>
            </div>

            {error ? <Alert>{error}</Alert> : null}

            {apiKey ? (
              <div className="flex flex-col gap-2">
                <div className="rounded-2xl bg-muted px-4 py-3 font-mono text-xs leading-6 break-all">{apiKey}</div>
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-xs text-muted-foreground">
                    {prefix ? `Prefix: ${prefix}` : "Copy it now. It is only shown once."}
                  </p>
                  <Button type="button" variant="secondary" onClick={() => void copyAPIKey()}>
                    {copied ? <Check data-icon="inline-start" aria-hidden /> : <Copy data-icon="inline-start" aria-hidden />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            ) : null}

            <Button type="button" onClick={() => void createAPIKey()} disabled={creating}>
              {creating ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <KeyRound data-icon="inline-start" aria-hidden />}
              {apiKey ? "Rotate key" : "Create key"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
