import { describe, expect, test } from 'bun:test';

import { buildFhgrDirectLoginUrl } from '../src/fhgrLogin';
import { buildMoodleBrowserSSOLaunchUrl } from '../src/moodleBrowserSSOLaunchUrl';
import { buildMoodleAutoLoginUrl } from '../src/moodleAutoLoginUrl';
import { deriveRecordingDate } from '../src/replayHelpers';
import { buildWebexNavigationGuardScript } from '../src/screens/videos/webexBridgeScript';

describe('Replay Webex Moodle login URL', () => {
    test('uses the FHGR Shibboleth entry directly for FHGR Moodle', () => {
        const targetUrl = 'https://moodle.fhgr.ch/mod/lti/view.php?id=123';
        const loginUrl = new URL(
            buildFhgrDirectLoginUrl('https://moodle.fhgr.ch', targetUrl),
        );

        expect(loginUrl.origin).toBe('https://moodle.fhgr.ch');
        expect(loginUrl.pathname).toBe('/Shibboleth.sso/Login');
        expect(loginUrl.searchParams.get('entityID')).toBe(
            'https://aai-login.fhgr.ch/idp/shibboleth',
        );
        const target = new URL(loginUrl.searchParams.get('target') ?? '');

        expect(target.origin).toBe('https://moodle.fhgr.ch');
        expect(target.pathname).toBe('/auth/shibboleth/index.php');
        expect(target.searchParams.get('wantsurl')).toBe(targetUrl);
    });

    test('falls back to Moodle login for non-FHGR sites', () => {
        const targetUrl = 'https://moodle.example.test/mod/lti/view.php?id=123';
        const loginUrl = new URL(
            buildFhgrDirectLoginUrl('https://moodle.example.test', targetUrl),
        );

        expect(loginUrl.pathname).toBe('/login/index.php');
        expect(loginUrl.searchParams.get('wantsurl')).toBe(targetUrl);
    });

    test('builds a Moodle mobile autologin URL for a local LTI target', () => {
        const loginUrl = new URL(
            buildMoodleAutoLoginUrl({
                autologinUrl: 'https://moodle.fhgr.ch/admin/tool/mobile/autologin.php',
                key: 'single-use-key',
                userId: 42,
                urlToGo: '/mod/lti/launch.php?id=123',
            }),
        );

        expect(loginUrl.origin).toBe('https://moodle.fhgr.ch');
        expect(loginUrl.pathname).toBe('/admin/tool/mobile/autologin.php');
        expect(loginUrl.searchParams.get('userid')).toBe('42');
        expect(loginUrl.searchParams.get('key')).toBe('single-use-key');
        expect(loginUrl.searchParams.get('urltogo')).toBe('/mod/lti/launch.php?id=123');
    });

    test('starts FHGR browser SSO through direct Shibboleth login', () => {
        const launchUrl = buildMoodleBrowserSSOLaunchUrl({
            siteUrl: 'https://moodle.fhgr.ch',
            launchUrl: 'https://moodle.fhgr.ch/admin/tool/mobile/launch.php',
            service: 'moodle_mobile_app',
            passport: 'passport-123',
            urlScheme: 'moodle-client',
        });
        const loginUrl = new URL(launchUrl);
        const target = loginUrl.searchParams.get('target') ?? '';

        expect(loginUrl.pathname).toBe('/Shibboleth.sso/Login');
        expect(loginUrl.searchParams.get('entityID')).toBe(
            'https://aai-login.fhgr.ch/idp/shibboleth',
        );
        expect(target).toStartWith(
            'https://moodle.fhgr.ch/auth/shibboleth/index.php?',
        );
        const wantsUrl = new URL(target).searchParams.get('wantsurl') ?? '';

        expect(wantsUrl).toStartWith(
            'https://moodle.fhgr.ch/admin/tool/mobile/launch.php?',
        );
        expect(new URL(wantsUrl).searchParams.get('urlscheme')).toBe(
            'moodle-client',
        );
    });

    test('rewrites Webex LTI login forms to include the new-window flag', () => {
        const script = buildWebexNavigationGuardScript();

        expect(script).toContain('lti1p3_new_window');
        expect(script).toContain('https://lti.webex.com/lti/login');
        expect(script).toContain('location.href = url.toString()');
    });

    test('prefers the lecture date embedded in the Webex recording name', () => {
        expect(
            deriveRecordingDate(
                'Vorlesung-20260515 1038-1',
                '2026-05-16T00:04:00Z',
            ),
        ).toBe('2026-05-15');
    });
});
