export class DiagnosticError extends Error {
  readonly debugDetails: readonly string[];

  constructor(message: string, debugDetails: string[], cause?: unknown) {
    super(message);
    this.name = "DiagnosticError";
    this.debugDetails = debugDetails;

    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}
