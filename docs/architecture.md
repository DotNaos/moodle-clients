# Architecture

`moodle-clients` keeps user-facing clients together without mixing them into the CLI, GPT API, or backend services.

## Split

- `apps/mobile` is the native Expo app.
- `apps/web` is temporary. The durable target is a dedicated web/fullstack app, not Expo Web.
- `apps/extension` is the Chrome extension.
- `packages/app` contains the shared Expo app implementation used by mobile and web.
- `packages/shared-types` contains client-safe data contracts.
- `packages/api-client` contains the generated TypeScript client for the Moodle Services OpenAPI API.

## Durable Client Direction

Mobile and web should not be the same application target.

### Mobile

The mobile app must remain autonomous. It should be able to scan Moodle mobile QR codes, store the Moodle session locally, and talk to Moodle directly from the device. It may optionally talk to Moodle Services, but it must not require Moodle Services to keep working.

This keeps the mobile app useful even if the hosted backend is later removed.

### Web

The web UI should become a proper browser-first fullstack app. It can depend on Moodle Services, Neon, API keys, and later Clerk because it is the hosted control surface for the server-side Moodle integration.

The web app should not use Expo Web long-term. The preferred direction is a normal TypeScript web app using the generated OpenAPI client from `packages/api-client`.

### Shared Code

Shared logic should live below `packages/`, but only when it is genuinely shared:

- Moodle DTOs and API contracts: `packages/shared-types`
- Generated Moodle Services API client: `packages/api-client`
- Pure parsing and formatting helpers: a future shared package if duplication appears

Do not put backend-only session handling or secrets into shared client packages.

## Auth Direction

The mobile app can scan Moodle QR links and complete pairing flows. Web stores browser-local session data. The extension should use `chrome.storage.local` when it gains the same pairing flow.

## Services Boundary

Custom GPT APIs, CLI behavior, MCP servers, Docker images, and server-only Moodle integrations stay in the existing `moodle-cli` repository for now.

`moodle-cli` is being renamed conceptually and remotely to `moodle-services`. New documentation, URLs, OpenAPI specs, and generated clients should use Moodle Services naming.
