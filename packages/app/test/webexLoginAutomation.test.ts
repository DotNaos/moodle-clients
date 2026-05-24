import { describe, expect, test } from 'bun:test';

import {
    buildWebexLoginAutomationScript,
    normalizeWebexLoginCredentials,
} from '../src/webexLoginAutomation';

describe('Webex login automation', () => {
    test('normalizes complete credentials', () => {
        expect(
            normalizeWebexLoginCredentials({
                username: '  user@fhgr.ch ',
                password: 'secret',
            }),
        ).toEqual({
            username: 'user@fhgr.ch',
            password: 'secret',
        });
    });

    test('rejects incomplete credentials', () => {
        expect(
            normalizeWebexLoginCredentials({
                username: 'user@fhgr.ch',
                password: '',
            }),
        ).toBeNull();
    });

    test('builds a script that submits username and password without logging values', () => {
        const script = buildWebexLoginAutomationScript(
            {
                username: 'user@example.test',
                password: 'p@ss"word',
            },
            'https://moodle.example.test/mod/lti/view.php?id=1',
            'https://moodle.example.test/Shibboleth.sso/Login?entityID=fhgr',
        );

        expect(script).toContain('USER');
        expect(script).toContain('PASS');
        expect(script).toContain('webex-login-automation');
        expect(script).toContain('setValue(usernameInput, USERNAME)');
        expect(script).toContain('setValue(passwordInput, PASSWORD)');
        expect(script).toContain('Opening Webex from the existing browser session.');
        expect(script).toContain('https://moodle.example.test/mod/lti/view.php?id=1');
        expect(script).toContain('Automatic login stopped to avoid repeated login requests.');
        expect(script).toContain('https://moodle.example.test/Shibboleth.sso/Login?entityID=fhgr');
        expect(script).toContain('manual-required');
        expect(script).toContain('Automatic login already submitted once.');
        expect(script).toContain('Automatic login did not find a supported login form.');
        expect(script).toContain('__studyReplayWebexLoginAutomationActive');
        expect(script).toContain('now - lastPageStatusAt < 3500');
        expect(script).not.toContain('console.log');
    });

    test('does not build credential automation without complete credentials', () => {
        const script = buildWebexLoginAutomationScript(
            null,
            'https://moodle.example.test/mod/lti/view.php?id=1',
            'https://moodle.example.test/Shibboleth.sso/Login?entityID=fhgr',
        );

        expect(script.trim()).toBe('true;');
        expect(script).not.toContain('USERNAME');
        expect(script).not.toContain('PASSWORD');
        expect(script).not.toContain('webex-login-automation');
    });
});
