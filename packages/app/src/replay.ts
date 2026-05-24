import { logDevError, logDevInfo } from './debug';
import {
    callMoodleApi,
    type MoodleConnection,
    type MoodleCourseSection,
} from './moodle';
import { filterRecordingsByCourseCalendar } from './replayCalendarFilter';
import {
    asRecord,
    buildFhgrDirectLoginUrl,
    buildWebexBridgeHTML,
    dateFromUnix,
    deriveRecordingDate,
    extractCsrfToken,
    extractItems,
    extractRecordUUID,
    extractWebexRCID,
    extractWebexRecordingPassword,
    firstNonEmpty,
    formatReplayDate,
    hasNextPage,
    numberFromAny,
    stringFromAny,
    type MobileLtiLaunch,
} from './replayHelpers';
import {
    WebexBridgeRequiredError,
    type ReplayCourse,
    type ReplayRecording,
    type WebexBridgeRequest,
    type WebexBridgeResult,
} from './replayTypes';
import {
    coverURLFromInfo,
    fetchStreamInfo,
    loadPublicWebexStream,
    streamURLFromInfo,
    WEBEX_SITE,
    WEBEX_SITE_ID,
    webexHeaders,
    type WebexAuth,
} from './replayWebexMedia';
import {
    describeWebexSession,
    recordingProbeFromWebexSession,
} from './replayWebexSessions';

export { buildFhgrDirectLoginUrl, buildWebexBridgeHTML, formatReplayDate } from './replayHelpers';
export { getFS26ReplayCourses } from './replayCourses';
export {
    WebexBridgeRequiredError,
    type ReplayCourse,
    type ReplayRecording,
    type WebexBridgeRecording,
    type WebexBridgeRequest,
    type WebexBridgeResult,
} from './replayTypes';

const WEBEX_LTI_ORIGIN = 'https://lti.webex.com';
const WEBEX_APPLICATION = `${WEBEX_LTI_ORIGIN}/application`;
const MAX_WEBEX_PAGES = 50;
const MIN_RECORDING_SECONDS = 60;
const REPLAY_RECORDING_CACHE_TTL_MS = 10 * 60 * 1000;

export type ReplayRecordingLoadOptions = {
    readonly includeWebexLti?: boolean;
    readonly refresh?: boolean;
};

type MobileLti = {
    readonly id?: number;
    readonly coursemodule?: number;
    readonly name?: string;
    readonly intro?: string;
};

type ReplayRecordingCacheEntry = {
    readonly cachedAt: number;
    readonly recordings: ReplayRecording[];
};

const replayRecordingCache = new Map<string, ReplayRecordingCacheEntry>();
const replayRecordingLoads = new Map<string, Promise<ReplayRecording[]>>();

export async function loadReplayRecordings(
    connection: MoodleConnection,
    course: ReplayCourse,
    options: ReplayRecordingLoadOptions = {},
): Promise<ReplayRecording[]> {
    const cacheKey = buildReplayRecordingCacheKey(connection, course, options);
    const cached = replayRecordingCache.get(cacheKey);
    if (!options.refresh && cached && Date.now() - cached.cachedAt < REPLAY_RECORDING_CACHE_TTL_MS) {
        logReplayBoundary('Replay recordings cache hit', connection, course, {
            mode: getReplayLoadMode(options),
            count: cached.recordings.length,
        });
        return cached.recordings;
    }

    const inFlight = replayRecordingLoads.get(cacheKey);
    if (!options.refresh && inFlight) {
        logReplayBoundary('Replay recordings joined in-flight load', connection, course, {
            mode: getReplayLoadMode(options),
        });
        return inFlight;
    }

    logReplayBoundary('Replay recordings load started', connection, course, {
        mode: getReplayLoadMode(options),
        refresh: options.refresh === true,
    });
    const load = loadReplayRecordingsUncached(connection, course, options)
        .then((recordings) => {
            replayRecordingCache.set(cacheKey, {
                cachedAt: Date.now(),
                recordings,
            });
            logReplayBoundary('Replay recordings load completed', connection, course, {
                mode: getReplayLoadMode(options),
                count: recordings.length,
            });
            return recordings;
        })
        .catch((error) => {
            logReplayBoundary('Replay recordings load failed', connection, course, {
                mode: getReplayLoadMode(options),
                message: error instanceof Error ? error.message : String(error),
            });
            throw error;
        })
        .finally(() => {
            replayRecordingLoads.delete(cacheKey);
        });

    replayRecordingLoads.set(cacheKey, load);
    return load;
}

async function loadReplayRecordingsUncached(
    connection: MoodleConnection,
    course: ReplayCourse,
    options: ReplayRecordingLoadOptions,
): Promise<ReplayRecording[]> {
    if (options.includeWebexLti === false) {
        logReplayBoundary('Replay recordings Webex LTI skipped', connection, course, {
            mode: getReplayLoadMode(options),
        });
        return [];
    }

    const fromLti = await loadRecordingsFromWebexLti(connection, course);
    return sortRecordings(await filterRecordingsByCourseCalendar(course, fromLti));
}

function buildReplayRecordingCacheKey(
    connection: MoodleConnection,
    course: ReplayCourse,
    options: ReplayRecordingLoadOptions,
): string {
    const site = connection.moodleSiteUrl.trim().replace(/\/+$/, '').toLowerCase();
    const mode = options.includeWebexLti === false ? 'moodle' : 'webex-lti';
    return `${site}:${connection.moodleUserId}:${course.id}:${mode}`;
}

function getReplayLoadMode(options: ReplayRecordingLoadOptions): string {
    return options.includeWebexLti === false ? 'moodle-only' : 'webex-lti';
}

function logReplayBoundary(
    scope: string,
    connection: MoodleConnection,
    course: ReplayCourse,
    details: Record<string, unknown> = {},
) {
    logDevInfo(scope, {
        site: connection.moodleSiteUrl.trim().replace(/\/+$/, '').toLowerCase(),
        moodleUserId: connection.moodleUserId,
        courseId: course.id,
        courseTitle: course.title,
        ...details,
    });
}

export function recordingsFromWebexBridge(
    course: ReplayCourse,
    result: WebexBridgeResult,
): ReplayRecording[] {
    if (result.courseId !== course.id) {
        return [];
    }

    return sortRecordings(result.recordings.flatMap((recording) => {
        if (!recording.streamUrl) {
            return [];
        }

        return [{
            recordingDate: recording.recordingDate,
            recordingName: recording.recordingName,
            streamUrl: recording.streamUrl,
            sourceUrl: recording.sourceUrl,
            recordingUuid: recording.recordingUuid,
            coverUrl: recording.coverUrl,
            sessionTitle: recording.sessionTitle,
            durationSeconds: recording.durationSeconds,
            courseId: course.id,
            courseName: course.title,
            term: course.term,
            sourceCourseId: recording.sourceCourseId,
            sourceCourseName: recording.sourceCourseName,
        }];
    }));
}

async function loadRecordingsFromCourseContents(
    connection: MoodleConnection,
    course: ReplayCourse,
): Promise<ReplayRecording[]> {
    const sections = await callMoodleApi(connection, 'core_course_get_contents', {
        courseid: String(course.id),
    });
    if (!Array.isArray(sections)) {
        return [];
    }

    const recordings: ReplayRecording[] = [];
    const seen = new Set<string>();
    for (const sectionValue of sections) {
        const section = asRecord(sectionValue);
        const modules = Array.isArray(section.modules) ? section.modules : [];
        for (const moduleValue of modules) {
            const module = asRecord(moduleValue);
            const contents = Array.isArray(module.contents) ? module.contents : [];
            for (const contentValue of contents) {
                const content = asRecord(contentValue);
                const sourceUrl = normalizeWebexRecordingUrl(stringFromAny(content.fileurl));
                if (!sourceUrl || seen.has(sourceUrl)) {
                    continue;
                }
                seen.add(sourceUrl);

                const password = extractWebexRecordingPassword(stringFromAny(module.description));
                const stream = await loadPublicWebexStream(sourceUrl, password);
                recordings.push({
                    recordingDate: dateFromUnix(numberFromAny(content.timemodified)),
                    recordingName: firstNonEmpty(stringFromAny(module.name), 'Webex recording'),
                    streamUrl: stream.streamUrl,
                    sourceUrl,
                    recordingUuid: firstNonEmpty(stream.uuid, extractWebexRCID(sourceUrl), `moodle-url-${stringFromAny(module.id)}`),
                    coverUrl: stream.coverUrl,
                    sessionTitle: firstNonEmpty(stringFromAny(section.name), 'Moodle'),
                    durationSeconds: null,
                    courseId: course.id,
                    courseName: course.title,
                    term: course.term,
                });
            }
        }
    }
    return recordings;
}

async function loadRecordingsFromWebexLti(
    connection: MoodleConnection,
    course: ReplayCourse,
): Promise<ReplayRecording[]> {
    logReplayBoundary('Replay Webex LTI load started', connection, course);
    const activities = await fetchWebexLtiActivities(connection, course.id);
    logReplayBoundary('Replay Webex LTI activities loaded', connection, course, {
        count: activities.length,
    });
    const activity = activities[0];
    if (!activity) {
        return [];
    }

    logReplayBoundary('Replay Webex LTI activity started', connection, course, {
        activityId: activity.id,
        courseModule: activity.courseModule,
        activityName: activity.name,
    });
    const launch = await fetchLtiLaunchData(connection, activity.id);
    const browserUrls = buildMoodleLtiBrowserUrls(connection, activity.courseModule);
    logReplayBoundary('Replay Webex LTI browser bridge required', connection, course, {
        activityId: activity.id,
        courseModule: activity.courseModule,
        reason: 'browser-lti-session-required',
    });
    throw new WebexBridgeRequiredError({
        courseId: course.id,
        courseTitle: course.title,
        courseFullName: course.source.fullName,
        courseShortName: course.source.shortName,
        ...browserUrls,
        html: buildWebexBridgeHTML(launch),
    });
}

function buildMoodleLtiBrowserUrls(
    connection: MoodleConnection,
    courseModuleId: number,
): Pick<
    WebexBridgeRequest,
    'url' | 'loginUrl' | 'usesMoodleAutoLogin' | 'requiresMoodleReconnect' | 'usesMoodleBrowserLogin'
> {
    if (!courseModuleId) {
        return {};
    }

    const siteRoot = connection.moodleSiteUrl.replace(/\/+$/, '');
    const activityPath = `/mod/lti/launch.php?id=${encodeURIComponent(String(courseModuleId))}`;
    const activityUrl = `${siteRoot}${activityPath}`;
    logDevInfo('Replay Moodle LTI browser URL build started', {
        site: siteRoot,
        moodleUserId: connection.moodleUserId,
        courseModuleId,
    });
    logDevInfo('Replay Moodle LTI browser URL uses Shibboleth browser login', {
        site: siteRoot,
        moodleUserId: connection.moodleUserId,
        courseModuleId,
    });
    return {
        url: activityUrl,
        loginUrl: buildFhgrDirectLoginUrl(siteRoot, activityUrl),
        usesMoodleBrowserLogin: true,
    };
}

async function fetchWebexLtiActivities(
    connection: MoodleConnection,
    courseId: number,
): Promise<Array<{ id: number; courseModule: number; name: string }>> {
    logDevInfo('Replay Moodle LTI activities request started', {
        site: connection.moodleSiteUrl.trim().replace(/\/+$/, '').toLowerCase(),
        moodleUserId: connection.moodleUserId,
        courseId,
    });
    const payload = await callMoodleApi(connection, 'mod_lti_get_ltis_by_courses', {
        'courseids[0]': String(courseId),
    });
    const ltis = asRecord(payload).ltis;
    if (!Array.isArray(ltis)) {
        return [];
    }

    return ltis.flatMap((value) => {
        const lti = asRecord(value) as MobileLti;
        const haystack = `${lti.name ?? ''} ${lti.intro ?? ''}`.toLowerCase();
        if (!lti.id || !haystack.includes('webex')) {
            return [];
        }
        return [{
            id: lti.id,
            courseModule: lti.coursemodule ?? 0,
            name: firstNonEmpty(lti.name ?? '', 'Webex'),
        }];
    });
}

async function fetchLtiLaunchData(
    connection: MoodleConnection,
    toolId: number,
): Promise<MobileLtiLaunch> {
    logDevInfo('Replay Moodle LTI launch data request started', {
        site: connection.moodleSiteUrl.trim().replace(/\/+$/, '').toLowerCase(),
        moodleUserId: connection.moodleUserId,
        toolId,
    });
    const payload = asRecord(await callMoodleApi(connection, 'mod_lti_get_tool_launch_data', {
        toolid: String(toolId),
    })) as MobileLtiLaunch;
    if (!payload.endpoint || !Array.isArray(payload.parameters)) {
        throw new Error('Webex launch data is incomplete.');
    }
    return payload;
}

async function openWebexLti(launch: MobileLtiLaunch, courseId: number): Promise<WebexAuth> {
    const body = new URLSearchParams();
    for (const parameter of launch.parameters ?? []) {
        if (parameter.name) {
            body.set(parameter.name, parameter.value ?? '');
        }
    }

    let response: Response;
    try {
        logDevInfo('Replay Webex LTI direct launch started', {
            courseId,
            host: launch.endpoint ? new URL(launch.endpoint).host : '',
        });
        response = await fetch(launch.endpoint ?? '', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 StudyReplay',
            },
            body: body.toString(),
        });
    } catch (error) {
        logDevError('Webex LTI direct launch failed', error);
        throw new WebexBridgeRequiredError({
            courseId,
            html: buildWebexBridgeHTML(launch),
        });
    }

    const html = await response.text();
    if (!response.ok) {
        logDevInfo('Replay Webex LTI direct launch rejected', {
            courseId,
            status: response.status,
        });
        throw new WebexBridgeRequiredError({
            courseId,
            html: buildWebexBridgeHTML(launch),
        });
    }

    logDevInfo('Replay Webex LTI direct launch completed', {
        courseId,
        status: response.status,
        hasCsrfToken: Boolean(extractCsrfToken(html)),
    });
    return {
        csrfToken: extractCsrfToken(html),
        siteId: WEBEX_SITE_ID,
    };
}

async function fetchMeetingSessions(
    auth: WebexAuth,
    startDate: string,
    endDate: string,
): Promise<Record<string, unknown>[]> {
    return fetchPagedWebexJSON(
        auth,
        `${WEBEX_LTI_ORIGIN}/api/webex/meeting_sessions?start_date=${startDate}&end_date=${endDate}&with_recordings=true&page=`,
        WEBEX_APPLICATION,
    );
}

async function fetchSessionRecordings(
    auth: WebexAuth,
    sessionId: string,
): Promise<Record<string, unknown>[]> {
    return fetchPagedWebexJSON(
        auth,
        `${WEBEX_LTI_ORIGIN}/api/webex/meeting_sessions/${encodeURIComponent(sessionId)}/recordings?page=`,
        WEBEX_APPLICATION,
    );
}

async function fetchPagedWebexJSON(
    auth: WebexAuth,
    prefix: string,
    referer: string,
): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    for (let page = 1; page <= MAX_WEBEX_PAGES; page += 1) {
        logDevInfo('Replay Webex paged request started', {
            host: safeUrlHost(prefix),
            path: safeUrlPath(prefix),
            page,
        });
        const payload = await fetchWebexJSON(auth, `${prefix}${page}`, referer);
        const pageItems = extractItems(payload);
        items.push(...pageItems);
        logDevInfo('Replay Webex paged request completed', {
            host: safeUrlHost(prefix),
            path: safeUrlPath(prefix),
            page,
            pageCount: pageItems.length,
            totalCount: items.length,
            hasNextPage: hasNextPage(payload, page),
        });
        if (!hasNextPage(payload, page)) {
            return items;
        }
    }
    return items;
}

function safeUrlHost(value: string): string {
    try {
        return new URL(value).host;
    } catch {
        return '';
    }
}

function safeUrlPath(value: string): string {
    try {
        return new URL(value).pathname;
    } catch {
        return '';
    }
}

async function fetchWebexJSON(
    auth: WebexAuth,
    targetUrl: string,
    referer: string,
): Promise<Record<string, unknown>> {
    const response = await fetch(targetUrl, {
        credentials: 'include',
        headers: webexHeaders(auth, referer),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Webex API failed with HTTP ${response.status}.`);
    }
    return asRecord(JSON.parse(text));
}

function isWebexBrowserSessionRequired(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    return /Webex .*HTTP (401|403)/i.test(error.message);
}

async function recordingFromWebexItem(
    auth: WebexAuth,
    item: Record<string, unknown>,
    course: ReplayCourse,
    session: {
        readonly title: string;
        readonly sourceCourseId: string;
        readonly sourceCourseName: string;
    },
): Promise<ReplayRecording | null> {
    const duration = numberFromAny(item.duration, item.recordingDuration, item.durationSeconds);
    if (duration > 0 && duration < MIN_RECORDING_SECONDS) {
        return null;
    }

    const sourceUrl = stringFromAny(item.recording_url, item.recordingUrl);
    let uuid = firstNonEmpty(
        stringFromAny(item.recordUUID, item.recordUuid, item.record_uuid, item.recordingUuid, item.recording_uuid, item.uuid),
        extractRecordUUID(sourceUrl),
    );
    const accessPwd = stringFromAny(item.accessPwd, item.password, item.recordingPassword);
    let streamUrl = '';
    let coverUrl = '';

    if (!uuid && sourceUrl) {
        const publicStream = await loadPublicWebexStream(sourceUrl, accessPwd);
        uuid = publicStream.uuid;
        streamUrl = publicStream.streamUrl ?? '';
        coverUrl = publicStream.coverUrl ?? '';
    }

    if (uuid) {
        const streamInfo = await fetchStreamInfo(auth, uuid, accessPwd);
        streamUrl = firstNonEmpty(streamURLFromInfo(streamInfo), streamUrl);
        coverUrl = firstNonEmpty(coverURLFromInfo(streamInfo), coverUrl);
    }

    if (!streamUrl) {
        return null;
    }

    const name = firstNonEmpty(stringFromAny(item.name, item.recordName), session.title);
    return {
        recordingDate: deriveRecordingDate(name, stringFromAny(item.created_at, item.createTime, item.gmtCreateTime)),
        recordingName: name,
        streamUrl,
        sourceUrl: sourceUrl || null,
        recordingUuid: firstNonEmpty(uuid, sourceUrl, name),
        coverUrl: coverUrl || null,
        sessionTitle: session.title,
        durationSeconds: duration > 0 ? duration : null,
        courseId: course.id,
        courseName: course.title,
        term: course.term,
        sourceCourseId: session.sourceCourseId || undefined,
        sourceCourseName: session.sourceCourseName || undefined,
    };
}

function normalizeWebexRecordingUrl(candidate: string): string {
    if (!candidate) {
        return '';
    }

    try {
        const parsed = new URL(candidate);
        if (parsed.host.toLowerCase() !== WEBEX_SITE) {
            return '';
        }
        if (!parsed.pathname.toLowerCase().endsWith('/ldr.php')) {
            return '';
        }
        return parsed.searchParams.get('RCID') ? parsed.toString() : '';
    } catch {
        return '';
    }
}

function webexRecordingWindow(now: Date): [string, string] {
    return ['2015-01-01', `${now.getFullYear() + 3}-12-31`];
}

function sortRecordings(recordings: ReplayRecording[]): ReplayRecording[] {
    return [...recordings].sort((left, right) => right.recordingDate.localeCompare(left.recordingDate));
}
