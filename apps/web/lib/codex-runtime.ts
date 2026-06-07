const SANDBOX_UNAVAILABLE =
  "Codex is not available on this deployment. Use a Vercel deployment with sandbox access, or disable the Codex panel for this environment.";

export function codexRuntimeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Codex failed before returning a result.";
  }

  const message = error.message.trim();
  if (!message) {
    return "Codex failed before returning a result.";
  }

  if (isSandboxRuntimeError(error, message)) {
    return SANDBOX_UNAVAILABLE;
  }

  return message;
}

function isSandboxRuntimeError(error: Error, message: string): boolean {
  const name = error.name.toLowerCase();
  return (
    name.includes("oidc") ||
    /localoidccontext|vercel_oidc|oidc token|vc link|vercel sandbox/i.test(message)
  );
}
