"use client";

import { Button } from "@/components/ui/button";
import { GrainientBackground } from "@/components/grainient-background";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Spinner } from "@/components/ui/spinner";

export function SignedOutHome({ moodleServicesUrl }: { moodleServicesUrl: string }) {
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-6 py-16 sm:px-8 lg:py-28">
      <GrainientBackground />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-white/20" />
      <div className="relative z-10 w-full max-w-[34rem] space-y-10">
        <h1 className="text-5xl font-semibold tracking-tight text-[#111318] sm:text-6xl">Moodle</h1>
        <div className="space-y-5">
          <GoogleSignInButton />
          <Button asChild className="h-11 w-full rounded-full text-sm font-medium" variant="ghost">
            <a href={`${moodleServicesUrl}/api/docs`} target="_blank" rel="noreferrer">
              API docs
            </a>
          </Button>
        </div>
      </div>
    </main>
  );
}

export function FullPageLoading() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-hidden />
        Loading
      </div>
    </main>
  );
}
