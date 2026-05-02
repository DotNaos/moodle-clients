import { Suspense } from "react";

import { OAuthAuthorizeClient } from "./ui";

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={<AuthorizeShell title="Preparing authorization" description="Loading request details." />}>
      <OAuthAuthorizeClient />
    </Suspense>
  );
}

export function AuthorizeShell({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </main>
  );
}
