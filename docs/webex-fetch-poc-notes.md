# Webex Fetch POC Notes

Date: 2026-05-23

This document tracks the fetch-only Webex LTI investigation so we do not repeat false assumptions later.

## Goal

Build a minimal, observable fetch-only path that can load Webex meeting sessions and recordings without using the mobile simulator or parallel deep-loading every course.

## Current POC

- Script: `scripts/webex-fetch-poc.mjs`
- Moodle browser login refresh: `scripts/fhgr-fetch-login.mjs`
- FS26 lazy verification summary: `test-artifacts/webex-lazy-fs26-check/summary.json`
- Command:

```bash
bun run moodle:fetch-login -- --target "/mod/lti/launch.php?id=<course-module-id>"
bun run webex:fetch-poc -- --course "Algorithmen des wissenschaftlichen Rechnens"
bun run webex:fetch-poc -- --course "Algorithmen des wissenschaftlichen Rechnens" --all-recordings
```

- Local credentials are in `.env`, which is ignored by git.
- `MOODLE_USERNAME` is the username expected by FHGR/Shibboleth. It is the Moodle/FHGR account name, not necessarily an email address.
- `MOODLE_PASSWORD` is the password for FHGR/Shibboleth.
- `WEBEX_USERNAME` can be the email-style Webex login. Do not use it for the FHGR/Shibboleth form unless it is actually the same account identifier.
- `WEBEX_PASSWORD` can be used for Webex login automation. In this environment the password matches `MOODLE_PASSWORD`, but the usernames do not match.
- Practical rule: when the page host is `aai-login.fhgr.ch`, use `MOODLE_USERNAME` and `MOODLE_PASSWORD`; when the page is a Webex-owned login surface, use `WEBEX_USERNAME` and `WEBEX_PASSWORD`.
- `test-artifacts/` is gitignored because Webex responses can include playable `recording_url` values and recording passwords.

## Do Not Forget

- The app must be lazy by design: load Webex only for the course the user opens.
- The app must not deep-load all courses in parallel.
- The app must not call Moodle mobile autologin per course, per retry, or per recording.
- The course list should come from the normal Moodle mobile APIs.
- Webex data should be cached per course. A retry should reuse a valid Webex/browser session where possible.
- Use stable Moodle course IDs after course selection. Human-readable names are only fallback/search input.
- Decode Moodle HTML entities before matching names. `&amp;` broke the Hyperautomation course name match.
- Treat Moodle browser cookies and Webex session cookies as separate from the Moodle mobile token.
- Never log, send to Sentry, or commit raw cookies, tokens, `id_token`, `SAMLResponse`, `recording_url`, or recording passwords.
- Any artifact containing Webex API responses is local evidence only and must stay ignored.
- The current fetch-only scripts are proof-of-concept code. `scripts/webex-fetch-poc.mjs` is intentionally not the final app module and must be split before product code reuse.

## Confirmed Findings

1. Moodle mobile APIs work for course and LTI discovery:
   - `core_enrol_get_users_courses`
   - `mod_lti_get_ltis_by_courses`
   - `mod_lti_get_tool_launch_data`

2. Directly POSTing the mobile `id_token` to `https://lti.webex.com/lti/launch` is not enough.
   - Webex returns a page with CSRF metadata, but it is a launch-error page.
   - The hidden `react-root` error says Webex LTI could not be launched.
   - Going from there to `/application` or `/api/webex/...` returns 401.

3. The browser-style Moodle launch starts at:

```text
https://moodle.fhgr.ch/mod/lti/launch.php?id=<course-module-id>
```

   That page returns an auto-submitted POST form to:

```text
https://lti.webex.com/lti/login
```

   with these fields:

```text
client_id, iss, login_hint, lti_deployment_id, lti_message_hint, target_link_uri
```

4. Webex requires `lti1p3_new_window=1` on the `/lti/login` request.
   - Without it, Webex returns only the login SPA and `/launches/check_session` stays `session_set: false`.
   - With it, Webex redirects correctly to Moodle:

```text
https://moodle.fhgr.ch/mod/lti/auth.php?...response_mode=form_post...
```

5. Moodle `auth.php` may show a repost bridge:

```text
<form id="autopostme" method="POST">
  <input type="hidden" name="repost" value="true">
</form>
```

   The POC must follow this form, but it must not blindly submit unrelated Moodle forms like the global search form.

6. The local `~/.moodle/session.json` browser cookies were stale for the OIDC auth step.
   - They could open `launch.php`.
   - `auth.php` still rendered with Moodle body class `notloggedin`.
   - A fetch-only implementation therefore needs a real Moodle/Shibboleth session refresh or a controlled single autologin request.

7. Do not use `tool_mobile_get_autologin_key` as the default fetch strategy.
   - It causes Moodle's 6-minute autologin lockout.
   - It is acceptable only as a single explicit fallback, never per course or per recording load.

8. Fetch-only Shibboleth login can reach the FHGR "Information Release" consent page when using `MOODLE_USERNAME`.
   - Using the email-style Webex username loops back to the login form.
   - The consent form has duplicate input names. It must preserve all `_shib_idp_consentIds` values and submit `_eventId_proceed=Accept`.
   - A bad `_eventId_proceed` submission produced "Release of Information Prevented".

9. The Shibboleth target must be Moodle's auth callback, not the LTI page directly.
   - Good target:

```text
https://moodle.fhgr.ch/auth/shibboleth/index.php?wantsurl=<original target>
```

   - Bad target:

```text
https://moodle.fhgr.ch/mod/lti/launch.php?id=<course-module-id>
```

   - The bad target sets Apache/Shibboleth cookies but leaves Moodle `auth.php` with body class `notloggedin`, which makes the LTI auth repost fail with 404.

10. End-to-end fetch verification now works with a refreshed Moodle browser session.
    - `Algorithmen des wissenschaftlichen Rechnens (cds-116) FS26`: Webex returned 8 meeting sessions.
    - `Data Science und Informatik bei Banken (cds-305) FS26`: Webex returned 5 meeting sessions.
    - Both courses reached `https://lti.webex.com/application` and returned HTTP 200 from `/api/webex/meeting_sessions`.
    - Both courses returned at least one recording item from `/api/webex/meeting_sessions/:id/recordings`.

11. FS26 lazy-per-course verification passed on 2026-05-23.
    - This was not a product batch flow. It refreshed the Moodle browser session once, then opened each course's Webex LTI one at a time and fetched that course's sessions and recording lists serially.
    - No Moodle mobile autologin requests were used during the course checks.
    - Artifacts are under `test-artifacts/webex-lazy-fs26-check/`.

| Course | Webex sessions | Recording API items |
| --- | ---: | ---: |
| Algorithmen des wissenschaftlichen Rechnens (cds-116) FS26 | 8 | 8 |
| Data Science und Informatik bei Banken (cds-305) FS26 | 5 | 5 |
| Deep Learning (cds-108) FS26 | 10 | 10 |
| Design Thinking (cds-4082) FS26 | 1 | 1 |
| High Performance Computing (cds-110) FS26 | 9 | 9 |
| Hyperautomation und Robotics Process Automation (RPA) / Process Automation & Mining (cds-309/dsc_23/dsc_22/dbmWPM) FS26 | 4 | 4 |
| Natural Language Processing (cds-1091) FS26 | 5 | 5 |

12. Course matching must decode Moodle HTML entities before fuzzy matching.
    - Moodle returned the Hyperautomation course fullname with `&amp;`.
    - Matching against the human name with `&` failed until the POC normalized the decoded name.
    - The app should prefer stable Moodle course IDs once a user selects a course, and use name matching only as a fallback.

## Auth And Session Model

The working model has three different sessions. Do not merge them mentally:

1. Moodle mobile token
   - Source: `~/.moodle/mobile-session.json` in the POC.
   - Purpose: course list, LTI activity discovery, launch metadata discovery.
   - This is not enough to open Webex recordings directly.

2. Moodle browser/Shibboleth session
   - Source: `~/.moodle/session.json` in the POC.
   - Purpose: browser-style Moodle LTI launch and Moodle `auth.php` OIDC bridge.
   - This must be refreshed through FHGR/Shibboleth when stale.

3. Webex LTI session
   - Source: cookies set by `lti.webex.com` after the Moodle/Webex LTI flow.
   - Purpose: `https://lti.webex.com/application` and `/api/webex/...` calls.
   - It is course-contextual. Open the selected course's LTI launch before calling that course's Webex API.

The fetch chain that actually works is:

```text
Moodle mobile API: course list
Moodle mobile API: mod_lti_get_ltis_by_courses
Moodle browser: /mod/lti/launch.php?id=<coursemodule>
Webex: /lti/login?lti1p3_new_window=1
Moodle browser: /mod/lti/auth.php
Webex: /lti/launch
Webex: /application
Webex API: /api/webex/meeting_sessions?with_recordings=true
Webex API: /api/webex/meeting_sessions/:id/recordings
```

## App Implementation Rules

Recommended lazy load sequence for the iOS app:

1. Show courses from normal Moodle mobile data.
2. When the user opens one course's videos, check a per-course recording cache.
3. If cache is fresh, render it immediately and refresh only on explicit retry or stale TTL.
4. If cache is missing/stale, discover that course's Webex LTI activity.
5. Open the course's browser-style Moodle LTI launch.
6. Follow the Webex/Moodle LTI redirect chain with the browser session.
7. Fetch all Webex meeting-session pages for that course.
8. Fetch recording pages only for sessions that report recordings.
9. Store normalized replay items keyed by Moodle course ID and Webex session/recording ID.
10. Keep user-visible errors course-scoped. One failed course must not poison other courses.

Recommended cache keys:

- `courseId`
- `courseModuleId`
- `webexSessionId`
- `webexRecordingId`
- `recordingUrl` only in secure/local storage if needed for playback; never in analytics logs

Recommended cache invalidation:

- explicit user retry;
- browser/Webex session expired;
- course LTI launch changed;
- TTL expired;
- Webex API returns unauthorized or launch context changed.

## Observability Boundaries

Log one event at every boundary, with safe metadata only:

- `moodle_courses_start` / `moodle_courses_done`
- `webex_course_lazy_load_start`
- `moodle_lti_lookup_start` / `moodle_lti_lookup_done`
- `moodle_lti_launch_data_start` / `moodle_lti_launch_data_done`
- `moodle_browser_session_source`
- `moodle_launch_php_start` / `moodle_launch_php_done`
- `webex_lti_login_start` / `webex_lti_login_done`
- `moodle_lti_auth_start` / `moodle_lti_auth_done`
- `webex_application_start` / `webex_application_done`
- `webex_meeting_sessions_start` / `webex_meeting_sessions_done`
- `webex_recordings_start` / `webex_recordings_done`
- `webex_course_lazy_load_done`
- `webex_course_lazy_load_failed`

Safe fields:

- course ID, course shortname, course module ID;
- endpoint host and path, not full query strings;
- HTTP status;
- page number and item count;
- boolean flags such as `hasCsrfToken`, `hasWebexApplication`, `hasRecordings`;
- redacted error code/message.

Never log:

- Moodle mobile token;
- Moodle browser cookie values;
- Webex cookie values;
- `id_token`;
- `SAMLResponse`;
- CSRF token value;
- full `recording_url`;
- recording password;
- full Webex API payload.

## Known Failure Modes

- Moodle mobile autologin lockout: `tool_mobile_get_autologin_key` can lock out token generation for 6 minutes. Avoid it in the normal Webex lazy path.
- Webex login SPA dead end: `/lti/login` without `lti1p3_new_window=1` returns the Webex SPA and does not establish the needed session.
- Stale Moodle browser cookies: `launch.php` can still open, but `auth.php` may render as `notloggedin`; refresh the Shibboleth/Moodle browser session.
- Wrong Shibboleth target: target Moodle's Shibboleth callback with `wantsurl`, not the final LTI page directly.
- Wrong username: FHGR/Shibboleth expects `MOODLE_USERNAME`, not necessarily the email-style `WEBEX_USERNAME`.
- Consent form bug: FHGR consent has duplicate `_shib_idp_consentIds`; preserve all duplicate fields and submit `_eventId_proceed=Accept`.
- Over-eager form submission: only follow the intended Moodle/Webex bridge forms. Do not submit unrelated Moodle forms such as search.
- HTML entity mismatch: decode Moodle names before matching.
- Course without Webex LTI: surface "no Webex recordings for this course" without retry storms.
- Course with sessions but no recordings: render empty state without treating it as auth failure.
- Unauthorized Webex API response: treat as expired Webex/LTI session and refresh only that course/session path.

## iOS Integration Notes

- The mobile app should use the same lazy course-local boundary as the POC: normal Moodle APIs for the course list, then a single selected course's Webex LTI path only when the user opens or retries that course.
- The iOS app should not call Moodle mobile autologin for Webex by default. The Webex bridge starts from Moodle's browser LTI launch URL and signs in through FHGR/Shibboleth inside the in-app WebView.
- FHGR/Shibboleth credentials mean the short Moodle/FHGR username and password. Do not store or submit an email-style Webex username for this page.
- If a saved WebView login is rejected, clear the saved entry and return to the editable login form. Do not keep retrying the rejected credentials.
- The WebView bridge must force Webex `/lti/login` forms through `lti1p3_new_window=1`; otherwise Webex opens the SPA path and never reaches the meeting-session APIs.
- Logs must keep full URLs, cookies, launch tokens, recording URLs, and recording passwords out of the console. Host names, path names, query-key names, counts, and status names are enough for diagnosis.
- iOS verification on 2026-05-24 showed that Webex LTI meeting sessions are course-contextual even when session objects do not include Moodle course IDs. The app therefore falls back to "selected LTI session scope" when no course metadata is exposed.
- Webex recording items from the LTI API can contain only `created_at`, `duration`, `id`, `name`, `password`, and `recording_url`. The WebView can see the item list, but it cannot reliably resolve the `fhgr.webex.com/fhgr/ldr.php` recording URL because of the WebView/CORS boundary.
- The native cookie fallback is required only after the WebView has proven there are recording items but could not create stream URLs. It must not run in parallel with the normal WebView API path.
- The native fallback can resolve `recording_url` with Webex cookies, then call the Webex stream endpoint and return playable HLS URLs to the app.
- Automatic FHGR login may submit credentials once. After that, normal SAML redirects must be allowed, but a second automatic credential submit must stop and switch to manual mode.
- Verified in the iOS simulator with real credentials:
  - `Data Science und Informatik bei Banken`: 5 playable episodes shown; first episode opened in the native video player.
  - `Algorithmen des wissenschaftlichen Rechnens`: 8 episodes shown.

## Productization Notes

- Split the POC before reuse. It currently combines Moodle API access, cookie jar behavior, browser-flow following, Webex API calls, logging, and CLI concerns.
- Keep the browser-flow implementation isolated behind a small interface so the app can swap between native WebView-cookie reuse and fetch-only behavior.
- Keep Webex-specific scraping/normalization in the app/client layer, not in Moodle-owned service code.
- Normalize recordings into the existing replay model with stable IDs, names, start dates, duration, source course ID, and secure playback data.
- The UI should show course-local loading, empty, retry, and expired-login states.
- A background refresh may refresh already-opened or recently-opened courses, but it must be concurrency-limited and must never deep-scan the full semester by default.
- Before shipping, test on a real iOS device against at least:
  - one course with many recordings;
  - one course with a long/special-character name;
  - one course with no Webex LTI, if available;
  - an expired Moodle browser session;
  - an expired Webex session;
  - offline or network failure.

## Remaining Work

There is no longer a fetch-only auth blocker for the tested FS26 courses. The remaining work is productizing this safely:

- split the POC into smaller modules before moving logic into app code;
- cache the Moodle/Webex browser session;
- load Webex data lazily per course;
- avoid Moodle mobile autologin except as an explicit, rate-limited fallback;
- map Webex sessions/recordings into the mobile app's existing replay model.

The verified fetch chain is:

```text
Moodle launch.php
Webex /lti/login?lti1p3_new_window=1
Moodle /mod/lti/auth.php
Webex /lti/launch
Webex /application
Webex /api/webex/meeting_sessions
Webex /api/webex/meeting_sessions/:id/recordings
```

## Design Implications For The App

- Course lists can come from normal Moodle mobile APIs.
- Webex recordings must be loaded lazily for one selected course, not for every course in parallel.
- Cache by course and session validity.
- Never burst Moodle autologin or Webex login requests.
- Treat Webex loading as a browser-session boundary until the fetch-only path is proven end to end.
- Logs should mark each boundary:
  - Moodle course lookup
  - Moodle LTI activity lookup
  - Moodle LTI launch data lookup
  - Moodle browser/autologin session source
  - Webex LTI login
  - Moodle LTI auth
  - Webex application session check
  - Webex meeting sessions API
  - Webex recordings API
