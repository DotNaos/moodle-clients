export function buildMoodleAutoLoginUrl(input: {
    readonly autologinUrl: string;
    readonly key: string;
    readonly userId: number;
    readonly urlToGo: string;
}): string {
    const url = new URL(input.autologinUrl);
    url.searchParams.set('userid', String(input.userId));
    url.searchParams.set('key', input.key);
    url.searchParams.set('urltogo', input.urlToGo || '/');
    return url.toString();
}
