import { sanitizeCourseName, stripHtml } from './format';
import { buildFhgrDirectLoginUrl } from './fhgrLogin';
import type { MoodleCourse } from './moodle';

export { buildFhgrDirectLoginUrl } from './fhgrLogin';

export type MobileLtiLaunch = {
    readonly endpoint?: string;
    readonly parameters?: Array<{ readonly name?: string; readonly value?: string }>;
};

export function formatReplayDate(value: string): string {
    if (!value) {
        return 'Datum unbekannt';
    }

    const parsed = new Date(`${value}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('de-CH', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(parsed);
}

export function buildWebexBridgeHTML(launch: MobileLtiLaunch): string {
    const endpoint = escapeHTML(launch.endpoint ?? '');
    const inputs = (launch.parameters ?? [])
        .map((parameter) => {
            const name = escapeHTML(parameter.name ?? '');
            const value = escapeHTML(parameter.value ?? '');
            if (!name) {
                return '';
            }
            return `<input type="hidden" name="${name}" value="${value}">`;
        })
        .join('');

    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Webex</title></head><body><form id="launch" method="post" action="${endpoint}">${inputs}</form><script>document.getElementById("launch").submit();setTimeout(function(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage("ready")},2500)</script></body></html>`;
}

export function isFS26Course(course: MoodleCourse): boolean {
    const haystack = [
        course.fullName,
        course.shortName,
        course.categoryName,
        course.rawCategory,
    ]
        .filter(Boolean)
        .join(' ')
        .toUpperCase();

    return /\bFS\s*26\b/.test(haystack) || /\bFS26\b/.test(haystack);
}

export function sanitizeReplayCourseName(value: string): string {
    return sanitizeCourseName(value)
        .replaceAll(/&amp;/g, '&')
        .replaceAll(/\s*\/\s*/g, ' / ')
        .replaceAll(/\s+/g, ' ')
        .trim();
}

export function extractWebexRecordingPassword(description: string): string {
    const text = stripHtml(description)
        .replaceAll('&nbsp;', ' ')
        .replaceAll(/\s+/g, ' ');
    const labelled = text.match(/passwort\s*:\s*([A-Za-z0-9_-]{6,64})/i);
    if (labelled?.[1]) {
        return labelled[1];
    }
    return text.match(/\b[A-Za-z0-9_-]{6,64}\b/)?.[0] ?? '';
}

export function extractCsrfToken(html: string): string {
    return html.match(/<meta[^>]+name=["'](?:csrf-token|csrfToken|_csrf)["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '';
}

export function extractWebexRCID(candidate: string): string {
    try {
        const rcid = new URL(candidate).searchParams.get('RCID') ?? '';
        return /^[a-f0-9]{16,}$/i.test(rcid) ? rcid.toLowerCase() : '';
    } catch {
        return '';
    }
}

export function extractRecordUUID(value: string): string {
    for (const pattern of [
        /recording\/playback\/([a-f0-9]{32})/i,
        /recording\/playback\/([a-f0-9-]{36})/i,
        /recording\/([a-f0-9]{32})\/playback/i,
        /recording\/([a-f0-9-]{36})\/playback/i,
        /playback\/([a-f0-9]{32})/i,
        /playback\/([a-f0-9-]{36})/i,
        /recording\/([a-f0-9]{32})/i,
        /recording\/([a-f0-9-]{36})/i,
        /(?:recordUUID|recordUuid|record_uuid|recordingUuid|recording_uuid|recordingId|recording_id|recordId|record_id)["'\s:=]+([a-f0-9-]{32,36})/i,
    ]) {
        const match = value.match(pattern);
        if (match) {
            return (match[1] ?? '').replaceAll('-', '');
        }
    }
    return '';
}

export function deriveRecordingDate(name: string, ...candidates: string[]): string {
    for (const candidate of [...candidates, name]) {
        const value = candidate.trim();
        const dashed = value.match(/^(\d{4}-\d{2}-\d{2})/);
        if (dashed) {
            return dashed[1] ?? '';
        }
        const compact = value.match(/(\d{8})/);
        if (compact?.[1]) {
            return `${compact[1].slice(0, 4)}-${compact[1].slice(4, 6)}-${compact[1].slice(6, 8)}`;
        }
    }
    return '';
}

export function dateFromUnix(value: number): string {
    if (!value) {
        return '';
    }
    return new Date(value * 1000).toISOString().slice(0, 10);
}

export function extractItems(payload: Record<string, unknown>): Record<string, unknown>[] {
    for (const key of ['items', 'data', 'meeting_sessions', 'recordings']) {
        const value = payload[key];
        if (Array.isArray(value)) {
            return value.flatMap((item) => (isRecord(item) ? [item] : []));
        }
    }
    return [];
}

export function hasNextPage(payload: Record<string, unknown>, currentPage: number): boolean {
    const pagination = payload.pagination;
    if (isRecord(pagination)) {
        const perPage = numberFromAny(pagination.per_page, pagination.perPage);
        const total = numberFromAny(pagination.total_records, pagination.total, pagination.totalCount);
        if (perPage > 0 && total > 0) {
            return currentPage < Math.ceil(total / perPage);
        }
    }

    for (const key of ['total_pages', 'totalPages', 'page_count', 'pages']) {
        if (numberFromAny(payload[key]) > currentPage) {
            return true;
        }
    }
    return payload.has_more === true || payload.hasMore === true;
}

export function stringFromAny(...values: unknown[]): string {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
        if (typeof value === 'number' && value !== 0) {
            return String(value);
        }
    }
    return '';
}

export function numberFromAny(...values: unknown[]): number {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = Number.parseFloat(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }
    return 0;
}

export function stringFromAnyPath(root: Record<string, unknown>, ...paths: string[][]): string {
    for (const path of paths) {
        let current: unknown = root;
        for (const part of path) {
            if (!isRecord(current)) {
                current = null;
                break;
            }
            current = current[part];
        }
        const text = stringFromAny(current);
        if (text) {
            return text;
        }
    }
    return '';
}

export function sanitizeCoverURL(value: string): string {
    if (!value) {
        return '';
    }
    try {
        const parsed = new URL(value);
        if (parsed.host.endsWith('.webex.com') && parsed.searchParams.has('ticket')) {
            return '';
        }
    } catch {
        return value;
    }
    return value;
}

export function asRecord(value: unknown): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new TypeError('Unexpected response shape.');
    }
    return value;
}

export function firstNonEmpty(...values: string[]): string {
    return values.find((value) => value.trim())?.trim() ?? '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function escapeHTML(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}
