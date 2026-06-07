"use client";

import { HandleSSOCallback } from "@clerk/react";
import { Loader2 } from "lucide-react";

import { readAuthReturnTo } from "@/components/google-sign-in-button";

export default function SSOCallbackPage() {
  function navigate(destination: string) {
    window.location.assign(destination);
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Signing in
      </div>
      <HandleSSOCallback
        navigateToApp={({ decorateUrl }) => navigate(decorateUrl(readAuthReturnTo()))}
        navigateToSignIn={() => navigate("/")}
        navigateToSignUp={() => navigate("/")}
      />
    </main>
  );
}
