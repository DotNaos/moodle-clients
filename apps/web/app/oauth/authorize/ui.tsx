"use client";

import { useAuth } from "@clerk/nextjs";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GrainientBackground } from "@/components/grainient-background";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { MoodleConnectCard } from "@/components/moodle-connect-card";

type CompletionState = "idle" | "authorizing" | "redirecting" | "failed";

export function OAuthAuthorizeClient() {
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const [state, setState] = useState<CompletionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);

  const requestBody = useMemo(
    () => ({
      response_type: searchParams.get("response_type") ?? "",
      client_id: searchParams.get("client_id") ?? "",
      redirect_uri: searchParams.get("redirect_uri") ?? "",
      scope: searchParams.get("scope") ?? "",
      state: searchParams.get("state") ?? "",
      code_challenge: searchParams.get("code_challenge") ?? "",
      code_challenge_method: searchParams.get("code_challenge_method") ?? "",
      resource: searchParams.get("resource") ?? "",
    }),
    [searchParams],
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn || state !== "idle") {
      return;
    }

    async function completeAuthorization() {
      setState("authorizing");
      setError(null);
      try {
        const response = await fetch("/api/oauth/authorize/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          redirectUrl?: string;
          error?: string;
        };
        if (response.status === 409) {
          setNeedsConnection(true);
          setState("failed");
          setError(null);
          return;
        }
        if (!response.ok || !payload.redirectUrl) {
          throw new Error(payload.error ?? "Could not authorize ChatGPT.");
        }
        setState("redirecting");
        window.location.assign(payload.redirectUrl);
      } catch (completeError) {
        setState("failed");
        setError(getErrorMessage(completeError));
      }
    }

    void completeAuthorization();
  }, [isLoaded, isSignedIn, requestBody, state]);

  if (!isLoaded) {
    return <AuthorizeCard title="Preparing authorization" description="Loading your sign-in state." loading />;
  }

  if (!isSignedIn) {
    return (
      <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-6 py-16 sm:px-8 lg:py-28">
        <GrainientBackground colorBalance={0.15} centerX={0.08} centerY={-0.04} />
        <div className="pointer-events-none absolute inset-0 z-[1] bg-white/20" />
        <div className="relative z-10 w-full max-w-[34rem] space-y-10">
          <h1 className="text-4xl font-semibold tracking-tight text-[#111318] sm:text-5xl">Authorize ChatGPT</h1>
          <GoogleSignInButton />
        </div>
      </main>
    );
  }

  if (needsConnection) {
    return (
      <main className="grid min-h-screen place-items-center px-4 py-10">
        <div className="w-full max-w-xl space-y-4">
          <Card>
            <CardHeader>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <ShieldCheck aria-hidden />
              </div>
              <CardTitle>Connect Moodle first</CardTitle>
              <CardDescription>
                ChatGPT can be authorized after this account has a Moodle connection.
              </CardDescription>
            </CardHeader>
          </Card>
          <MoodleConnectCard
            onConnected={() => {
              setNeedsConnection(false);
              setError(null);
              setState("idle");
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {state === "redirecting" ? <CheckCircle2 aria-hidden /> : <Loader2 className="animate-spin" aria-hidden />}
          </div>
          <CardTitle>{state === "redirecting" ? "ChatGPT authorized" : "Authorizing ChatGPT"}</CardTitle>
          <CardDescription>
            {state === "redirecting"
              ? "Returning to ChatGPT."
              : "Checking your Moodle connection and preparing a secure OAuth code."}
          </CardDescription>
        </CardHeader>
        {error ? (
          <CardContent className="space-y-3">
            <Alert>{error}</Alert>
            <Button className="w-full" type="button" onClick={() => setState("idle")}>
              Try again
            </Button>
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}

function AuthorizeCard({
  title,
  description,
  loading,
}: {
  title: string;
  description: string;
  loading?: boolean;
}) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldCheck aria-hidden />}
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
