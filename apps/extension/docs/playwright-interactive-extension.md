# Playwright Interactive With This Extension

Use the normal `playwright-interactive` skill, but for this project launch
Chromium as a **persistent context** so the unpacked extension from `dist/` is
loaded.

## Moodle credentials

For Playwright-based Moodle login in this repo, use the 1Password references
from `scripts/playwright-op-config.mjs`:

- username: `op://Personal/FHGR/username`
- password: `op://Personal/FHGR/password`

Do not hardcode the resolved values into the repo. Resolve them via `op read`
or by importing the helper from `scripts/playwright-op-config.mjs`.

## One-time setup

```bash
pnpm install
pnpm build
pnpm playwright:install
```

## Quick local launch

```bash
pnpm playwright:extension
```

Optional URL override:

```bash
pnpm playwright:extension "https://moodle.fhgr.ch/course/view.php?id=22583"
```

## `playwright-interactive` js_repl launch cell

Use this instead of the plain `ensureWebBrowser()` flow from the generic skill:

```javascript
var path = await import("node:path");
var fs = await import("node:fs");
var extensionPath = path.resolve(process.cwd(), "dist");
var userDataDir = path.resolve(process.cwd(), ".playwright/chromium-extension-profile");
var TARGET_URL = "https://moodle.fhgr.ch/my/courses.php";

if (!fs.existsSync(extensionPath)) {
  throw new Error("Missing dist/ build. Run `pnpm build` first.");
}

if (context && context.browser()) {
  await context.close().catch(() => {});
}

context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1600, height: 900 },
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});

page = context.pages()[0] ?? await context.newPage();
await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
console.log("Loaded with extension:", await page.title());
```

## Resolve Moodle credentials in `js_repl`

```javascript
var {
  MOODLE_USERNAME_OP_REF,
  MOODLE_PASSWORD_OP_REF,
  readMoodleCredentials,
} = await import(`file://${process.cwd()}/scripts/playwright-op-config.mjs`);

var credentials = readMoodleCredentials();
if (!credentials.ok) {
  throw new Error(credentials.error);
}

console.log("Using 1Password refs:", {
  usernameRef: MOODLE_USERNAME_OP_REF,
  passwordRef: MOODLE_PASSWORD_OP_REF,
});
```

You can then use:

```javascript
await page.getByLabel(/username|benutzername|anmeldename/i).fill(credentials.username);
await page.getByLabel(/password|passwort|kennwort/i).fill(credentials.password);
```

## Important note

For Chrome extensions, `launchPersistentContext()` is the important part. A
normal `chromium.launch()` plus `browser.newContext()` flow will not reliably
load the unpacked extension the way we need here.
