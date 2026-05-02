"use client";

import { SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type CompletionState = "idle" | "authorizing" | "redirecting";

export function OAuthAuthorizeClient() {
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const [state, setState] = useState<CompletionState>("idle");
  const [error, setError] = useState<string | null>(null);

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
        if (!response.ok || !payload.redirectUrl) {
          throw new Error(payload.error ?? "Could not authorize ChatGPT.");
        }
        setState("redirecting");
        window.location.assign(payload.redirectUrl);
      } catch (completeError) {
        setState("idle");
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
      <main className="grid min-h-screen place-items-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ShieldCheck aria-hidden />
            </div>
            <CardTitle>Authorize ChatGPT</CardTitle>
            <CardDescription>
              Sign in to OS Home Moodle to connect ChatGPT to your Moodle account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SignInButton mode="modal">
              <Button className="w-full" size="lg">
                Sign in <CheckCircle2 aria-hidden />
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button className="w-full" variant="secondary">
                Create account
              </Button>
            </SignUpButton>
          </CardContent>
        </Card>
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
