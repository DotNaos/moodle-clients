"use client";

import { useSignIn } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GoogleSignInButtonProps = {
  className?: string;
  redirectUrl?: string;
};

const RETURN_TO_KEY = "moodle:auth:returnTo";

export function GoogleSignInButton({ className, redirectUrl }: GoogleSignInButtonProps) {
  const { signIn, fetchStatus } = useSignIn();
  const [error, setError] = useState<string | null>(null);
  const isLoading = fetchStatus === "fetching";

  async function startGoogleSignIn() {
    const returnTo = redirectUrl ?? currentPath();
    setError(null);
    window.sessionStorage.setItem(RETURN_TO_KEY, returnTo);

    const result = await signIn.sso({
      strategy: "oauth_google",
      redirectUrl: returnTo,
      redirectCallbackUrl: "/sso-callback",
    });

    if (result.error) {
      setError(result.error.longMessage ?? result.error.message ?? "Google sign-in failed.");
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        className="h-14 w-full rounded-full border border-[#dadce0] bg-white px-5 text-base font-medium text-[#202124] shadow-none transition-colors hover:bg-[#f8fafd] hover:text-[#202124] focus-visible:ring-[#1a73e8] dark:border-border dark:bg-background dark:text-foreground dark:hover:bg-accent"
        disabled={isLoading}
        size="lg"
        type="button"
        variant="secondary"
        onClick={() => void startGoogleSignIn()}
      >
        {isLoading ? <Loader2 className="animate-spin" aria-hidden /> : <GoogleMark />}
        Continue with Google
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function readAuthReturnTo() {
  const value = window.sessionStorage.getItem(RETURN_TO_KEY);
  window.sessionStorage.removeItem(RETURN_TO_KEY);
  return value && value.startsWith("/") ? value : "/";
}

function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function GoogleMark() {
  return (
    <svg aria-hidden className="size-5 shrink-0" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.58-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.41 5.41 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.03l2.99-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.97L3.95 7.3C4.66 5.16 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}
