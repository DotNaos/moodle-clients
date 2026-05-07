"use client";

import { CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import { SignInButton, SignUpButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export function SignedOutHome({ moodleServicesUrl }: { moodleServicesUrl: string }) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-4">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShieldCheck aria-hidden />
          </div>
          <CardTitle>Moodle</CardTitle>
          <CardDescription>
            Sign in to open your private Moodle workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
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
          <Button asChild className="w-full" variant="ghost">
            <a href={`${moodleServicesUrl}/api/docs`} target="_blank" rel="noreferrer">
              API docs <ExternalLink aria-hidden />
            </a>
          </Button>
        </CardContent>
      </Card>
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
