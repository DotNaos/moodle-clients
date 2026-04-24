# Moodle Clients

User-facing Moodle clients for Project School.

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
pnpm install
```

Run the web app:

```sh
pnpm web:dev
```

Run the mobile app:

```sh
pnpm mobile:start
```

Build the Expo web app:

```sh
pnpm web:build
```

Build the extension:

```sh
pnpm extension:build
```
