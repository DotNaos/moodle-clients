# Mobile Testing

## Moodle QR Login

Use the Go-based `moodle-cli` project as the source of fresh Moodle mobile QR login sessions when testing this app. This avoids testing against expired QR links.

From the `moodle-cli` repository, the current smoke-test flow is:

```sh
go run ./cmd/moodle --mobile-session /tmp/moodle-client-mobile-session.json mobile qr login --json --skip-check
```

The app itself needs the raw `moodlemobile://...` QR payload for end-to-end deep-link testing. If the CLI command only redeems the QR session internally, add or use a CLI mode that prints the raw QR payload before token exchange.

