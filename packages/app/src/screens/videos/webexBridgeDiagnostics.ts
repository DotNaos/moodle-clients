import { logDevInfo } from '../../debug';

export function logWebexBridge(event: string, details: Record<string, unknown>) {
    logDevInfo('Webex bridge', {
        event,
        ...Object.fromEntries(
            Object.entries(details).map(([key, value]) => [
                key,
                key.toLowerCase().includes('url') && typeof value === 'string'
                    ? describeWebexBridgeUrl(value)
                    : value,
            ]),
        ),
    });
}

export function webexBrowserPageStatus(url: string | undefined): string {
    if (!url) {
        return '';
    }
    try {
        const parsed = new URL(url);
        if (parsed.hostname === 'aai-login.fhgr.ch') {
            return 'Opening FHGR login page.';
        }
        if (parsed.hostname === 'moodle.fhgr.ch') {
            return 'Opening Moodle course activity.';
        }
        if (parsed.hostname === 'lti.webex.com') {
            return 'Opening Webex course recordings.';
        }
        if (parsed.hostname.endsWith('webex.com')) {
            return 'Opening Webex stream session.';
        }
    } catch {
        return '';
    }
    return '';
}

function describeWebexBridgeUrl(value: string): string {
    try {
        const parsed = new URL(value);
        const queryKeys = Array.from(parsed.searchParams.keys()).sort();
        return [
            `${parsed.hostname}${parsed.pathname}`,
            queryKeys.length > 0 ? `?keys=${queryKeys.join(',')}` : '',
        ].join('');
    } catch {
        return value ? '[invalid-url]' : '';
    }
}
