# Mobile Testing

## Moodle QR Login

Use the Go-based `moodle-cli` project as the source of fresh Moodle mobile QR login sessions when testing this app. This avoids testing against expired QR links.

From the `moodle-cli` repository, the current smoke-test flow is:

```sh
go run ./cmd/moodle --mobile-session /tmp/moodle-client-mobile-session.json mobile qr login --json --skip-check
```

The app itself needs the raw `moodlemobile://...` QR payload for end-to-end deep-link testing. If the CLI command only redeems the QR session internally, add or use a CLI mode that prints the raw QR payload before token exchange.

## iOS OTA Update Checks

Use an EAS simulator build to test app self-updates before asking someone to install a new phone build. The installed app and the published update must use the same channel and runtime version.

Build a simulator app from the same profile/channel used by the phone build:

```sh
cd apps/mobile
eas build --platform ios --profile preview-simulator --non-interactive --wait
```

Download the artifact from EAS, extract it, boot a simulator, and install the app:

```sh
xcrun simctl boot "iPhone 17" || true
xcrun simctl install booted /path/to/MoodleClient.app
xcrun simctl launch booted com.dotnaos.moodleclient
```

Publish an app-only update to the matching channel:

```sh
cd apps/mobile
eas update --channel preview --message "OTA test update" --non-interactive
```

Then open Profile in the simulator and press `Check now`. The App updates section should show self-update as enabled, the expected channel, and runtime version `1.0.2`. If it says self-update is disabled, that installed build cannot receive OTA updates and must be replaced by a fresh native build once.

For production-channel testing, use `production-simulator` and publish with `--channel production`.
