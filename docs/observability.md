# Observability

The mobile app is wired for Sentry error reporting and structured logs.

## Required Sentry settings

Create a Sentry React Native project, then configure these values outside the repo:

- `EXPO_PUBLIC_SENTRY_DSN`: public DSN used by the app at runtime.
- `SENTRY_AUTH_TOKEN`: Sentry token for release/source-map uploads and smoke-test verification.
- `SENTRY_ORG`: Sentry organization slug.
- `SENTRY_PROJECT`: Sentry project slug.
- `SENTRY_PROJECT_ID`: numeric Sentry project id for log smoke-test verification.
- `SENTRY_URL`: Sentry region URL. Use `https://de.sentry.io` for the current `oliver-schuetz` organization.

For GitHub/EAS iOS builds, add these as GitHub repository secrets. The release workflow forwards them to EAS. `SENTRY_ALLOW_FAILURE=true` is set in the workflow so a temporary Sentry upload problem does not block installing the app.

For local development, copy `apps/mobile/.env.example` to `apps/mobile/.env` and set only the public DSN when you want local events to be sent.

## What gets reported

- Unhandled React Native errors through `Sentry.wrap`.
- App log entries from `logDevInfo` and `logDevError` as Sentry breadcrumbs and structured logs.
- Captured handled errors, including Moodle API failures, QR exchange failures, app update failures, and Moodle WebView load/HTTP failures.
- Release tags for app version, platform, Expo channel, runtime version, update id, and update group when available.

The app does not enable `sendDefaultPii`. Moodle mobile links and token-like query parameters are scrubbed before app logs are sent.

## Testing

Before trusting a DSN, run the smoke test from the repo root:

```sh
SENTRY_AUTH_TOKEN=... bun run mobile:sentry:smoke
```

Use a Sentry token with `org:read`, `project:read`, and `event:read`. The test sends one handled error and one info-level app log event, then fails unless both can be read back from Sentry. It also sends a raw structured-log envelope and reports whether Sentry Logs indexed it, but the pass/fail signal uses the visible Sentry events because Sentry Logs may be unavailable for the project.

After setting `EXPO_PUBLIC_SENTRY_DSN`, run the app and trigger a handled error, for example by opening the Moodle browser login while the device has no internet connection. The app should show the local error, and Sentry should receive a `Moodle browser login failed` event with the WebView code/status details.

For release builds, verify the build log contains the Sentry source-map upload step. If the upload fails while Sentry secrets are still missing, the workflow should continue because `SENTRY_ALLOW_FAILURE=true` is set.

After publishing an OTA update manually, upload the generated source maps from `apps/mobile/dist`:

```sh
cd apps/mobile
eas update --channel preview --message "..."
npx @sentry/expo-upload-sourcemaps dist
```
