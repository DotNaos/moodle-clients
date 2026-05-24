import { afterEach, describe, expect, mock, test } from 'bun:test';

import type { MoodleConnection } from '../src/moodle';

const apiCalls: Array<{ functionName: string; params: Record<string, string> }> = [];
const infoLogs: string[] = [];
let nextResponse: Promise<unknown> | unknown = {
    autologinurl: 'https://moodle.fhgr.ch/admin/tool/mobile/autologin.php',
    key: 'single-use-key',
};

mock.module('../src/debug', () => ({
    logDevInfo: (scope: string) => {
        infoLogs.push(scope);
    },
}));

mock.module('../src/moodleTransport', () => ({
    callMoodleApi: async (
        _connection: MoodleConnection,
        functionName: string,
        params: Record<string, string>,
    ) => {
        apiCalls.push({ functionName, params });
        return await nextResponse;
    },
}));

const {
    createMoodleAutoLoginUrl,
    resetMoodleAutoLoginRequestStateForTests,
} = await import('../src/moodleAutoLogin');

describe('Moodle mobile autologin request guard', () => {
    afterEach(() => {
        apiCalls.length = 0;
        infoLogs.length = 0;
        nextResponse = {
            autologinurl: 'https://moodle.fhgr.ch/admin/tool/mobile/autologin.php',
            key: 'single-use-key',
        };
        resetMoodleAutoLoginRequestStateForTests();
    });

    test('does not issue a second Moodle autologin request during the lockout window', async () => {
        const first = await createMoodleAutoLoginUrl(connection(), '/mod/lti/launch.php?id=1');
        const second = await createMoodleAutoLoginUrl(connection(), '/mod/lti/launch.php?id=2');

        expect(first).toContain('key=single-use-key');
        expect(second).toBeNull();
        expect(apiCalls.map((call) => call.functionName)).toEqual([
            'tool_mobile_get_autologin_key',
        ]);
        expect(infoLogs).toEqual([
            'Moodle autologin request started',
            'Moodle autologin request completed',
            'Moodle autologin request skipped during lockout window',
        ]);
    });

    test('deduplicates concurrent requests for the same Moodle LTI target', async () => {
        let resolveResponse: (value: unknown) => void = () => undefined;
        nextResponse = new Promise((resolve) => {
            resolveResponse = resolve;
        });

        const first = createMoodleAutoLoginUrl(connection(), '/mod/lti/launch.php?id=1');
        const second = createMoodleAutoLoginUrl(connection(), '/mod/lti/launch.php?id=1');

        expect(apiCalls).toHaveLength(1);

        resolveResponse({
            autologinurl: 'https://moodle.fhgr.ch/admin/tool/mobile/autologin.php',
            key: 'shared-key',
        });

        expect(await Promise.all([first, second])).toEqual([
            'https://moodle.fhgr.ch/admin/tool/mobile/autologin.php?userid=42&key=shared-key&urltogo=%2Fmod%2Flti%2Flaunch.php%3Fid%3D1',
            'https://moodle.fhgr.ch/admin/tool/mobile/autologin.php?userid=42&key=shared-key&urltogo=%2Fmod%2Flti%2Flaunch.php%3Fid%3D1',
        ]);
        expect(apiCalls).toHaveLength(1);
    });
});

function connection(): MoodleConnection {
    return {
        moodleSiteUrl: 'https://moodle.fhgr.ch',
        moodleUserId: 42,
        moodleMobileToken: 'mobile-token',
        moodlePrivateToken: 'private-token',
    };
}
