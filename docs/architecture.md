# Architecture

`moodle-clients` keeps user-facing clients together without mixing them into the CLI, GPT API, or backend services.

## Split

- `apps/mobile` is the native Expo app.
- `apps/web` is the Expo web/PWA deployment target.
- `apps/extension` is the Chrome extension.
- `packages/app` contains the shared Expo app implementation used by mobile and web.
- `packages/shared-types` contains client-safe data contracts.

## Auth Direction

The mobile app can scan Moodle QR links and complete pairing flows. Web stores browser-local session data. The extension should use `chrome.storage.local` when it gains the same pairing flow.

## Services Boundary

Custom GPT APIs, CLI behavior, MCP servers, Docker images, and server-only Moodle integrations stay in the existing `moodle-cli` repository for now.
