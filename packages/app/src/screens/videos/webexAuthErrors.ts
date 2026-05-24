export function isWebexAuthFailureMessage(message: string): boolean {
    return /\bHTTP (401|403)\b/i.test(message) || /unauthori[sz]ed|forbidden/i.test(message);
}
