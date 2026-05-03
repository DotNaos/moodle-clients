# Moodle Clients

User-facing Moodle clients for Project School.

## TODO Before TestFlight

- Rename the iOS app before any TestFlight or App Store review. The current
  `Moodle Client` name and `com.dotnaos.moodleclient` bundle id are temporary
  development names. Use a neutral name before Apple review to avoid Moodle
  trademark/branding issues.

## Apps

- `apps/mobile`: Expo mobile app for Moodle login, course browsing, and pairing.
- `apps/web`: Expo web app / PWA target that reuses the same Moodle client app code.
- `apps/extension`: Chrome extension for replacing or augmenting the Moodle web UI.

## Packages

- `packages/app`: shared Expo app surface used by mobile and web.
- `packages/shared-types`: shared TypeScript types for client apps.

## Development

Install dependencies:

```sh
bun install
```

Run the web app:

```sh
bun run web:dev
```

Run the mobile app:

```sh
bun run mobile:start
```

Build the Expo web app:

```sh
bun run web:build
```

Build the extension:

```sh
bun run extension:build
```

## Web deploy on Vercel

The repository already includes a root `vercel.json` for the Expo web app:

- install: `bun install --frozen-lockfile`
- build: `bun run --filter @moodle-clients/web build`
- output: `apps/web/dist`

So you can import the repository into Vercel and deploy the web version directly.

### Camera support on phone web

The web QR scanner uses the browser camera API. It works when the app is opened on a secure origin:

- `https://` deployments such as Vercel work
- `http://localhost` works for local development
- insecure non-localhost `http://` URLs do **not** get camera access

Open the deployed Vercel URL on your phone, tap **Scan QR Code**, and allow camera access in the browser.

### Web session persistence

On web, the Moodle connection is already stored in `localStorage` under the key `moodle-clients.connection.v1`.

That means a Vercel-hosted web session on your phone stays local to that browser until you clear it or log out.
