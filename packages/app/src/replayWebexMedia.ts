import { logDevInfo } from './debug';
import {
    asRecord,
    extractCsrfToken,
    extractRecordUUID,
    extractWebexRCID,
    sanitizeCoverURL,
    stringFromAnyPath,
} from './replayHelpers';

export const WEBEX_SITE = 'fhgr.webex.com';
export const WEBEX_SITE_ID = '14682867';

export type WebexAuth = {
    readonly csrfToken: string;
    readonly siteId: string;
};

export async function loadPublicWebexStream(
    recordingUrl: string,
    accessPwd: string,
): Promise<{ streamUrl: string | null; coverUrl: string | null; uuid: string }> {
    if (!recordingUrl || !accessPwd) {
        return { streamUrl: null, coverUrl: null, uuid: '' };
    }

    try {
        const response = await fetch(recordingUrl, {
            credentials: 'include',
            headers: { 'User-Agent': 'Mozilla/5.0 StudyReplay' },
        });
        const html = await response.text();
        const uuid = extractRecordUUID(response.url);
        if (!uuid) {
            return { streamUrl: null, coverUrl: null, uuid: '' };
        }

        const streamInfo = await fetchStreamInfo(
            { csrfToken: extractCsrfToken(html), siteId: WEBEX_SITE_ID },
            uuid,
            accessPwd,
        );
        return {
            streamUrl: streamURLFromInfo(streamInfo) || null,
            coverUrl: coverURLFromInfo(streamInfo) || null,
            uuid,
        };
    } catch (error) {
        logDevInfo('Public Webex stream lookup skipped', {
            recordingUrl: describeSafeUrl(recordingUrl),
            error: error instanceof Error ? error.message : String(error),
        });
        return { streamUrl: null, coverUrl: null, uuid: extractWebexRCID(recordingUrl) };
    }
}

export async function fetchStreamInfo(
    auth: WebexAuth,
    uuid: string,
    accessPwd: string,
): Promise<Record<string, unknown>> {
    const response = await fetch(
        `https://${WEBEX_SITE}/webappng/api/v1/recordings/${encodeURIComponent(uuid)}/stream?siteurl=fhgr`,
        {
            credentials: 'include',
            headers: {
                ...webexHeaders(auth, `https://${WEBEX_SITE}/recordingservice/sites/fhgr/recording/playback/${uuid}`),
                clientType: 'web',
                siteFullUrl: WEBEX_SITE,
                siteId: auth.siteId,
                ...(accessPwd ? { accessPwd } : {}),
            },
        },
    );
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Webex stream info failed with HTTP ${response.status}.`);
    }
    return asRecord(JSON.parse(text));
}

export function webexHeaders(auth: WebexAuth, referer: string): HeadersInit {
    return {
        Accept: 'application/json, text/plain, */*',
        Referer: referer,
        ...(auth.csrfToken ? { 'x-csrf-token': auth.csrfToken } : {}),
    };
}

export function streamURLFromInfo(streamInfo: Record<string, unknown>): string {
    return stringFromAnyPath(
        streamInfo,
        ['downloadRecordingInfo', 'downloadInfo', 'hlsURL'],
        ['downloadInfo', 'hlsURL'],
        ['downloadRecordingInfo', 'downloadInfo', 'dashURL'],
        ['downloadInfo', 'dashURL'],
        ['downloadRecordingInfo', 'downloadInfo', 'mp4URL'],
        ['downloadInfo', 'mp4URL'],
    );
}

export function coverURLFromInfo(streamInfo: Record<string, unknown>): string {
    return sanitizeCoverURL(stringFromAnyPath(
        streamInfo,
        ['downloadRecordingInfo', 'downloadInfo', 'playerCoverURL'],
        ['downloadInfo', 'playerCoverURL'],
        ['downloadInfo', 'coverUrl'],
        ['downloadInfo', 'thumbnailUrl'],
    ));
}

function describeSafeUrl(value: string): string {
    try {
        const parsed = new URL(value);
        return `${parsed.hostname}${parsed.pathname}`;
    } catch {
        return value ? '[invalid-url]' : '';
    }
}
