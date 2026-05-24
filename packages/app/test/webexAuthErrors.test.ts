import { describe, expect, test } from 'bun:test';

import { isWebexAuthFailureMessage } from '../src/screens/videos/webexAuthErrors';

describe('Webex auth error detection', () => {
    test('treats Webex HTTP 401 and 403 failures as sign-in problems', () => {
        expect(isWebexAuthFailureMessage('Webex API failed with HTTP 401.')).toBe(true);
        expect(isWebexAuthFailureMessage('Webex API failed with HTTP 403.')).toBe(true);
    });

    test('does not treat unrelated Webex failures as sign-in problems', () => {
        expect(isWebexAuthFailureMessage('Webex API failed with HTTP 500.')).toBe(false);
    });
});
