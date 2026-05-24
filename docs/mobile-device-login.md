# Moodle Mobile Device Login

This documents the non-QR Moodle Mobile login flow used by the official Moodle app and by the Moodle Client mobile app.

## Observed FHGR Configuration

Public site config is fetched without authentication:

```text
POST https://moodle.fhgr.ch/lib/ajax/service.php?info=tool_mobile_get_public_config
```

with body:

```json
[
  {
    "index": 0,
    "methodname": "tool_mobile_get_public_config",
    "args": {}
  }
]
```

FHGR returns:

- `wwwroot`: `https://moodle.fhgr.ch`
- `typeoflogin`: `2`
- `launchurl`: `https://moodle.fhgr.ch/admin/tool/mobile/launch.php`
- `identityproviders`: Shibboleth Login
- `showloginform`: `1`

`typeoflogin = 2` means browser SSO. The app should open the system browser, not scan a QR code and not render Moodle inside the app UI.

## Launch Flow

The app creates a random `passport`, stores it locally, and opens:

```text
https://moodle.fhgr.ch/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=<passport>&urlscheme=<app-scheme>
```

For this app, the scheme should be `moodle-client` so it does not conflict with the official Moodle app's `moodlemobile` scheme.

Moodle stores a temporary `tool_mobile_launch` cookie and redirects the browser to the normal Moodle/FHGR login flow. After the user signs in, Moodle returns to the app through:

```text
moodle-client://token=<base64-payload>
```

The official Moodle app uses the same shape with `moodlemobile://token=...`.

## Token Payload

The `token` value is base64 encoded text:

```text
md5(siteUrl + passport):::moodleMobileToken:::privateToken
```

The app must:

1. Decode the base64 payload.
2. Split it by `:::`.
3. Recompute `md5(siteUrl + passport)` from the locally stored launch data.
4. Accept either the original `siteUrl` protocol or the opposite HTTP/HTTPS variant, matching the official app behavior.
5. Reject the callback if the signature does not match.
6. Store the Moodle mobile token in SecureStore.
7. Fetch `core_webservice_get_site_info` with the token to learn the real Moodle user id.

## Boundaries

- QR login stays as a legacy fallback only.
- The mobile app must use the system browser for this login path.
- After login, Moodle API calls are direct on-device HTTP requests using the mobile token.
- No Playwright, Chromium, or Mac-local API is involved.
- Webex recordings must not be downloaded; playback may only stream URLs.
