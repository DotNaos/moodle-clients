"use client";

import { useAuth } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { MoodleConnectCard } from "@/components/moodle-connect-card";

export function MoodleConnectPageClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [serverSession, setServerSession] = useState<"checking" | "authenticated" | "missing">("checking");

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setServerSession("missing");
      return;
    }

    let cancelled = false;
    setServerSession("checking");
    void fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "include",
    }).then((response) => {
      if (!cancelled) {
        setServerSession(response.ok ? "authenticated" : "missing");
      }
    }).catch(() => {
      if (!cancelled) {
        setServerSession("missing");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || serverSession === "checking") {
    return (
      <main className="grid min-h-dvh place-items-center px-4 py-10">
        <p className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          Checking sign-in
        </p>
      </main>
    );
  }

  if (!isSignedIn || serverSession === "missing") {
    return (
      <main className="grid min-h-dvh place-items-center px-4 py-10">
        <div className="w-full max-w-md space-y-5">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Sign in before connecting Moodle.
            </p>
          </div>
          <GoogleSignInButton />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh overflow-auto px-4 py-8">
      <div className="mx-auto w-full max-w-xl">
        <MoodleConnectCard
          onConnected={() => {
            router.replace(nextPath);
          }}
        />
      </div>
    </main>
  );
}

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/courses";
  }
  return value;
}
