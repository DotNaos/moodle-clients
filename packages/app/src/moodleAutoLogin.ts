import { logDevInfo } from './debug';
import type { MoodleConnection } from './moodle';
import { buildMoodleAutoLoginUrl } from './moodleAutoLoginUrl';
import { callMoodleApi } from './moodleTransport';

const MOBILE_AUTOLOGIN_KEY_FUNCTION = 'tool_mobile_get_autologin_key';
const AUTOLOGIN_REQUEST_LOCKOUT_MS = 6 * 60 * 1000;

const inFlightRequests = new Map<string, Promise<string | null>>();
const blockedUntilByScope = new Map<string, number>();

export async function createMoodleAutoLoginUrl(
    connection: MoodleConnection,
    urlToGo: string,
): Promise<string | null> {
    const privateToken = connection.moodlePrivateToken?.trim();
    if (!privateToken) {
        return null;
    }

    const scopeKey = buildScopeKey(connection);
    const targetKey = `${scopeKey}:${urlToGo}`;
    const inFlight = inFlightRequests.get(targetKey);
    if (inFlight) {
        logDevInfo('Moodle autologin request joined in-flight request', {
            site: normalizeSiteRoot(connection.moodleSiteUrl),
            moodleUserId: connection.moodleUserId,
        });
        return inFlight;
    }

    const now = Date.now();
    const blockedUntil = blockedUntilByScope.get(scopeKey) ?? 0;
    if (blockedUntil > now) {
        logDevInfo('Moodle autologin request skipped during lockout window', {
            site: normalizeSiteRoot(connection.moodleSiteUrl),
            moodleUserId: connection.moodleUserId,
            retryAfterMs: blockedUntil - now,
        });
        return null;
    }

    blockedUntilByScope.set(scopeKey, now + AUTOLOGIN_REQUEST_LOCKOUT_MS);
    logDevInfo('Moodle autologin request started', {
        site: normalizeSiteRoot(connection.moodleSiteUrl),
        moodleUserId: connection.moodleUserId,
    });
    const request = requestMoodleAutoLoginUrl(connection, privateToken, urlToGo);
    inFlightRequests.set(targetKey, request);

    try {
        return await request;
    } finally {
        inFlightRequests.delete(targetKey);
    }
}

export function resetMoodleAutoLoginRequestStateForTests() {
    inFlightRequests.clear();
    blockedUntilByScope.clear();
}

async function requestMoodleAutoLoginUrl(
    connection: MoodleConnection,
    privateToken: string,
    urlToGo: string,
): Promise<string | null> {
    let rawValue: unknown;
    try {
        rawValue = await callMoodleApi(
            connection,
            MOBILE_AUTOLOGIN_KEY_FUNCTION,
            {
                privatetoken: privateToken,
            },
            { logRejectedRequest: false },
        );
    } catch (error) {
        logDevInfo('Moodle autologin key unavailable', {
            message: error instanceof Error ? error.message : String(error),
        });
        return null;
    }

    const raw = asRecord(rawValue, 'Moodle autologin response');
    logDevInfo('Moodle autologin request completed', {
        site: normalizeSiteRoot(connection.moodleSiteUrl),
        moodleUserId: connection.moodleUserId,
        hasAutologinUrl: typeof raw.autologinurl === 'string' && Boolean(raw.autologinurl.trim()),
        hasKey: typeof raw.key === 'string' && Boolean(raw.key.trim()),
    });

    return buildMoodleAutoLoginUrl({
        autologinUrl: requireString(raw.autologinurl, 'autologinurl'),
        key: requireString(raw.key, 'key'),
        userId: connection.moodleUserId,
        urlToGo,
    });
}

function buildScopeKey(connection: MoodleConnection): string {
    return `${normalizeSiteRoot(connection.moodleSiteUrl)}:${connection.moodleUserId}`;
}

function normalizeSiteRoot(siteUrl: string): string {
    try {
        const url = new URL(siteUrl);
        return url.origin.toLowerCase();
    } catch {
        return siteUrl.trim().replace(/\/+$/, '').toLowerCase();
    }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null) {
        throw new TypeError(`${label} is invalid.`);
    }

    return value as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${fieldName} is invalid.`);
    }

    return value.trim();
}
