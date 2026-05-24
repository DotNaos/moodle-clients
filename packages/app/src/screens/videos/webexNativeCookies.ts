import CookieManager from '@react-native-cookies/cookies';

import type { WebexBridgeRecording } from '../../replay';
import {
    asRecord,
    deriveRecordingDate,
    extractItems,
    extractRecordUUID,
    firstNonEmpty,
    hasNextPage,
    numberFromAny,
    sanitizeCoverURL,
    stringFromAny,
    stringFromAnyPath,
} from '../../replayHelpers';

const WEBEX_SITE = 'fhgr.webex.com';
const WEBEX_SITE_ID = '14682867';
const WEBEX_LTI_ORIGIN = 'https://lti.webex.com';
const WEBEX_APPLICATION = `${WEBEX_LTI_ORIGIN}/application`;
const MAX_WEBEX_PAGES = 50;
const MIN_RECORDING_SECONDS = 60;

type NativeWebexAuth = {
    readonly cookieHeader: string;
    readonly siteId: string;
};

type NativeCookie = {
    readonly value?: string;
};

type NativeWebexCourseScope = {
    readonly courseId: number;
    readonly courseTitle: string;
    readonly courseFullName: string;
    readonly courseShortName: string;
};

export async function loadWebexRecordingsFromNativeCookies(
    course: NativeWebexCourseScope,
): Promise<WebexBridgeRecording[]> {
    const auth = await loadNativeWebexAuth();
    const now = new Date();
    const endDate = `${now.getFullYear() + 3}-12-31`;
    const sessions = await fetchPagedWebexJSON(
        auth,
        `${WEBEX_LTI_ORIGIN}/api/webex/meeting_sessions?start_date=2015-01-01&end_date=${endDate}&with_recordings=true&page=`,
        WEBEX_APPLICATION,
    );
    const scopedSessions = sessions.filter((session) => webexSessionMatchesCourse(course, session));
    const selectedSessions = scopedSessions.length > 0 ? scopedSessions : sessions;
    const recordings: WebexBridgeRecording[] = [];
    for (const session of selectedSessions) {
        const sessionId = stringFromAny(session.id, session.meetingSessionId);
        if (!sessionId) {
            continue;
        }
        const sessionTitle = firstNonEmpty(stringFromAny(session.title, session.name), 'Webex');
        const sourceCourseId = stringFromAny(
            session.courseId,
            session.course_id,
            session.contextId,
            session.context_id,
            session.lmsCourseId,
            session.lms_course_id,
        );
        const sourceCourseName = stringFromAny(
            session.courseName,
            session.course_name,
            session.contextTitle,
            session.context_title,
            session.contextName,
            session.context_name,
        );
        const items = await fetchPagedWebexJSON(
            auth,
            `${WEBEX_LTI_ORIGIN}/api/webex/meeting_sessions/${encodeURIComponent(sessionId)}/recordings?page=`,
            WEBEX_APPLICATION,
        );
        for (const item of items) {
            const recording = await recordingFromWebexItem(auth, item, {
                sourceCourseId,
                sourceCourseName,
                title: sessionTitle,
            });
            if (recording) {
                recordings.push(recording);
            }
        }
    }
    return recordings;
}

function webexSessionMatchesCourse(
    course: NativeWebexCourseScope,
    session: Record<string, unknown>,
): boolean {
    const sourceCourseId = stringFromAny(
        session.courseId,
        session.course_id,
        session.contextId,
        session.context_id,
        session.lmsCourseId,
        session.lms_course_id,
    );
    if (sourceCourseId && sourceCourseId === String(course.courseId)) {
        return true;
    }

    const selectedWords = new Set(contentWords([
        course.courseTitle,
        course.courseFullName,
        course.courseShortName,
    ].join(' ')));
    const candidateWords = new Set(contentWords([
        stringFromAny(
            session.courseName,
            session.course_name,
            session.contextTitle,
            session.context_title,
            session.contextName,
            session.context_name,
        ),
        stringFromAny(session.title, session.name),
    ].join(' ')));
    if (selectedWords.size === 0 || candidateWords.size === 0) {
        return false;
    }
    const matches = [...selectedWords].filter((word) => candidateWords.has(word)).length;
    return matches >= Math.min(2, selectedWords.size);
}

async function loadNativeWebexAuth(): Promise<NativeWebexAuth> {
    const [ltiCookies, siteCookies] = await Promise.all([
        CookieManager.get(WEBEX_LTI_ORIGIN),
        CookieManager.get(`https://${WEBEX_SITE}`),
    ]);
    const cookieHeader = [
        cookieHeaderFromMap(ltiCookies),
        cookieHeaderFromMap(siteCookies),
    ]
        .filter(Boolean)
        .join('; ');
    if (!cookieHeader) {
        throw new Error('No Webex browser cookies are available yet.');
    }
    return {
        cookieHeader,
        siteId: siteIdFromCookies(ltiCookies, siteCookies),
    };
}

async function fetchPagedWebexJSON(
    auth: NativeWebexAuth,
    prefix: string,
    referer: string,
): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    for (let page = 1; page <= MAX_WEBEX_PAGES; page += 1) {
        const payload = await fetchWebexJSON(auth, `${prefix}${page}`, referer);
        items.push(...extractItems(payload));
        if (!hasNextPage(payload, page)) {
            return items;
        }
    }
    return items;
}

async function fetchWebexJSON(
    auth: NativeWebexAuth,
    targetUrl: string,
    referer: string,
): Promise<Record<string, unknown>> {
    const response = await fetch(targetUrl, {
        headers: {
            Accept: 'application/json, text/plain, */*',
            Cookie: auth.cookieHeader,
            Referer: referer,
        },
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Native Webex API failed with HTTP ${response.status}.`);
    }
    return asRecord(JSON.parse(text));
}

async function recordingFromWebexItem(
    auth: NativeWebexAuth,
    item: Record<string, unknown>,
    session: {
        readonly title: string;
        readonly sourceCourseId: string;
        readonly sourceCourseName: string;
    },
): Promise<WebexBridgeRecording | null> {
    const duration = numberFromAny(item.duration, item.recordingDuration, item.durationSeconds);
    if (duration > 0 && duration < MIN_RECORDING_SECONDS) {
        return null;
    }
    const sourceUrl = stringFromAny(
        item.recording_url,
        item.recordingUrl,
        item.playback_url,
        item.playbackUrl,
        item.playbackURL,
        item.url,
        item.recordingLink,
        item.recording_link,
        item.recordingPlaybackUrl,
        item.recording_playback_url,
    );
    const uuid = firstNonEmpty(
        stringFromAny(
            item.recordUUID,
            item.recordUuid,
            item.record_uuid,
            item.recordingUuid,
            item.recording_uuid,
            item.recordingId,
            item.recording_id,
            item.recordId,
            item.record_id,
            item.uuid,
        ),
        extractRecordUUID(sourceUrl),
        extractRecordUUIDFromAnyField(item),
    );
    const accessPwd = stringFromAny(
        item.accessPwd,
        item.access_pwd,
        item.password,
        item.recordingPassword,
        item.recording_password,
    );
    const directStreamUrl = streamURLFromInfo(item);
    let resolvedUuid = uuid;
    let streamInfo: Record<string, unknown> = {};
    let streamUrl = directStreamUrl;
    if (resolvedUuid && !streamUrl) {
        try {
            streamInfo = await fetchStreamInfo(auth, resolvedUuid, accessPwd);
            streamUrl = streamURLFromInfo(streamInfo);
        } catch {
            resolvedUuid = '';
        }
    }
    if (!streamUrl && sourceUrl) {
        resolvedUuid = firstNonEmpty(
            await resolveRecordingUUIDFromSourceURL(auth, sourceUrl),
            resolvedUuid,
        );
        if (resolvedUuid) {
            try {
                streamInfo = await fetchStreamInfo(auth, resolvedUuid, accessPwd);
                streamUrl = streamURLFromInfo(streamInfo);
            } catch {
                return null;
            }
        }
    }
    if (!streamUrl) {
        return null;
    }
    const name = firstNonEmpty(
        stringFromAny(item.name, item.recordName, item.record_name, item.recordingName, item.recording_name),
        session.title,
    );
    return {
        recordingDate: deriveRecordingDate(name, stringFromAny(
            item.created_at,
            item.createTime,
            item.create_time,
            item.gmtCreateTime,
            item.gmt_create_time,
        )),
        recordingName: name,
        streamUrl,
        sourceUrl: sourceUrl || null,
        recordingUuid: firstNonEmpty(resolvedUuid, sourceUrl, name),
        coverUrl: coverURLFromInfo(streamInfo) || null,
        sessionTitle: session.title,
        durationSeconds: duration > 0 ? duration : null,
        sourceCourseId: session.sourceCourseId || undefined,
        sourceCourseName: session.sourceCourseName || undefined,
    };
}

async function resolveRecordingUUIDFromSourceURL(
    auth: NativeWebexAuth,
    sourceUrl: string,
): Promise<string> {
    try {
        const response = await fetch(sourceUrl, {
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                Cookie: auth.cookieHeader,
                Referer: WEBEX_APPLICATION,
            },
        });
        const html = await response.text();
        return firstNonEmpty(
            extractRecordUUID(response.url),
            extractRecordUUID(html),
        );
    } catch {
        return '';
    }
}

async function fetchStreamInfo(
    auth: NativeWebexAuth,
    uuid: string,
    accessPwd: string,
): Promise<Record<string, unknown>> {
    return fetchWebexJSONWithHeaders(
        auth,
        `https://${WEBEX_SITE}/webappng/api/v1/recordings/${encodeURIComponent(uuid)}/stream?siteurl=fhgr`,
        {
            clientType: 'web',
            siteFullUrl: WEBEX_SITE,
            siteId: auth.siteId,
            ...(accessPwd ? { accessPwd } : {}),
        },
        `https://${WEBEX_SITE}/recordingservice/sites/fhgr/recording/playback/${uuid}`,
    );
}

async function fetchWebexJSONWithHeaders(
    auth: NativeWebexAuth,
    targetUrl: string,
    headers: Record<string, string>,
    referer: string,
): Promise<Record<string, unknown>> {
    const response = await fetch(targetUrl, {
        headers: {
            Accept: 'application/json, text/plain, */*',
            Cookie: auth.cookieHeader,
            Referer: referer,
            ...headers,
        },
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Native Webex stream info failed with HTTP ${response.status}.`);
    }
    return asRecord(JSON.parse(text));
}

function streamURLFromInfo(streamInfo: Record<string, unknown>): string {
    return firstNonEmpty(
        stringFromAny(
            streamInfo.hlsURL,
            streamInfo.hlsUrl,
            streamInfo.dashURL,
            streamInfo.dashUrl,
            streamInfo.mp4URL,
            streamInfo.mp4Url,
            streamInfo.streamUrl,
            streamInfo.streamURL,
            streamInfo.stream_url,
            streamInfo.hls_url,
            streamInfo.dash_url,
            streamInfo.mp4_url,
            streamInfo.playbackUrl,
            streamInfo.playbackURL,
            streamInfo.playback_url,
        ),
        stringFromAnyPath(
        streamInfo,
        ['downloadRecordingInfo', 'downloadInfo', 'hlsURL'],
        ['downloadInfo', 'hlsURL'],
        ['downloadRecordingInfo', 'downloadInfo', 'dashURL'],
        ['downloadInfo', 'dashURL'],
        ['downloadRecordingInfo', 'downloadInfo', 'mp4URL'],
        ['downloadInfo', 'mp4URL'],
        ),
    );
}

function coverURLFromInfo(streamInfo: Record<string, unknown>): string {
    return sanitizeCoverURL(stringFromAnyPath(
        streamInfo,
        ['downloadRecordingInfo', 'downloadInfo', 'playerCoverURL'],
        ['downloadInfo', 'playerCoverURL'],
        ['downloadRecordingInfo', 'downloadInfo', 'coverUrl'],
        ['downloadInfo', 'coverUrl'],
        ['downloadRecordingInfo', 'downloadInfo', 'thumbnailUrl'],
        ['downloadInfo', 'thumbnailUrl'],
    ));
}

function extractRecordUUIDFromAnyField(root: Record<string, unknown>): string {
    const seen = new Set<unknown>();
    function visit(value: unknown, depth: number): string {
        if (!value || depth > 4) {
            return '';
        }
        if (typeof value === 'string') {
            return extractRecordUUID(value);
        }
        if (typeof value !== 'object' || seen.has(value)) {
            return '';
        }
        seen.add(value);
        for (const entry of Object.values(value)) {
            const uuid = visit(entry, depth + 1);
            if (uuid) {
                return uuid;
            }
        }
        return '';
    }
    return visit(root, 0);
}

function contentWords(value: string): string[] {
    return normalizeSearchText(value)
        .split(' ')
        .filter((word) =>
            word.length > 1 &&
            !STOP_WORDS.has(word) &&
            !isCourseCodeWord(word),
        );
}

const STOP_WORDS = new Set([
    'and',
    'bei',
    'der',
    'des',
    'die',
    'for',
    'im',
    'in',
    'of',
    'the',
    'und',
]);

function isCourseCodeWord(word: string): boolean {
    return (
        /^(cds|dsc|dbm|wpm|fs|hs)$/.test(word) ||
        /^(fs|hs)\d{2}$/.test(word) ||
        /^\d+$/.test(word) ||
        /^[a-z]+_\d+$/.test(word)
    );
}

function normalizeSearchText(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&amp;|&/g, ' und ')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .toLowerCase()
        .trim()
        .split(' ')
        .map(normalizeWord)
        .join(' ')
        .trim();
}

function normalizeWord(word: string): string {
    switch (word) {
        case 'bank':
        case 'banking':
        case 'banks':
            return 'banken';
        case 'informatics':
            return 'informatik';
        default:
            return word;
    }
}

function cookieHeaderFromMap(cookies: Record<string, NativeCookie>): string {
    return Object.entries(cookies)
        .flatMap(([name, cookie]) => (cookie.value ? [`${name}=${cookie.value}`] : []))
        .join('; ');
}

function siteIdFromCookies(...cookieMaps: Array<Record<string, NativeCookie>>): string {
    for (const cookies of cookieMaps) {
        for (const name of Object.keys(cookies)) {
            const match = name.match(/_(\d{6,})$/);
            if (match?.[1]) {
                return match[1];
            }
        }
    }
    return WEBEX_SITE_ID;
}
