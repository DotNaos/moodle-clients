# custom-moodle-ui

Chrome extension MVP that replaces the Moodle course overview on
`https://moodle.fhgr.ch/my/courses.php` with a cleaner React UI while Moodle
stays the source of truth for authentication, links, and course data already in
the DOM.

## Stack

- TypeScript
- React
- Vite
- Chrome Extension Manifest V3
- Tailwind CSS
- shadcn/ui

## Architecture

- `src/content/index.tsx`
  Bootstraps the content script, waits for the Moodle overview DOM, mounts a
  Shadow DOM host, injects compiled Tailwind styles into that shadow root, and
  renders the React takeover app.
- `src/moodle/`
  Contains Moodle-specific logic:
  - `page.ts` detects the target page, finds the overview root, creates the
    injected host, and suppresses the original overview block.
  - `extract-courses.ts` extracts raw course data from the existing Moodle DOM
    using selector fallbacks instead of a single brittle selector.
- `src/domain/`
  Contains normalization, semester parsing, current semester detection, and
  grouping into `Aktuelles Semester`, `Frühere Semester`,
  `Künftige Semester`, and `Sonstiges`.
- `src/app/` and `src/components/`
  Render the compact UI with shadcn/ui primitives inside the Shadow DOM only.
- `src/styles/shadow.css`
  Tailwind theme/utilities compiled for the injected app only. Tailwind
  preflight is intentionally not imported, so Moodle’s document is not reset.

## File Structure

```text
.
├── components.json
├── eslint.config.js
├── package.json
├── src
│   ├── app
│   │   └── takeover-app.tsx
│   ├── components
│   │   ├── bucket-section.tsx
│   │   ├── course-row.tsx
│   │   └── ui
│   │       ├── accordion.tsx
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── scroll-area.tsx
│   │       └── separator.tsx
│   ├── content
│   │   └── index.tsx
│   ├── domain
│   │   ├── course.ts
│   │   ├── group-courses.ts
│   │   └── semester.ts
│   ├── lib
│   │   └── utils.ts
│   ├── moodle
│   │   ├── extract-courses.ts
│   │   └── page.ts
│   ├── styles
│   │   └── shadow.css
│   ├── manifest.ts
│   └── ...
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts
```

## Setup

1. Install Bun if it is not already available.
2. Install dependencies:

```bash
bun install
```

## Build

Build the extension into `dist/`:

```bash
bun run build
```

Optional checks:

```bash
bun run lint
bun run typecheck
```

## Automated ZIP Builds

Every push to `main` triggers the GitHub Actions workflow in
`.github/workflows/extension-release.yml`.

It does three things:

- installs dependencies and builds the extension
- creates `custom-moodle-ui.zip` from `dist/`
- uploads that ZIP both as a workflow artifact and to the rolling GitHub release
  tagged `extension-latest`

That gives you a stable place to download the newest packaged extension ZIP
without rebuilding locally.

## Playwright With Extension

For interactive browser debugging with the unpacked extension already loaded:

```bash
bun run build
bun run playwright:install
bun run playwright:extension
```

Project-specific notes for the `playwright-interactive` workflow live in
`docs/playwright-interactive-extension.md`.

For Moodle login automation, this repo uses 1Password references from
`scripts/playwright-op-config.mjs` instead of storing credentials directly in
the repository.

## Load Unpacked In Chrome

1. Run `bun run build`.
2. Open Chrome and go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this project’s `dist` folder.
6. Open `https://moodle.fhgr.ch/my/courses.php`.
7. The original overview block should be hidden and replaced with the custom
   grouped UI.

## Moodle Extraction Assumptions

The extractor is designed to be reasonably defensive and currently relies on
these assumptions:

- The course overview contains links matching `a[href*="/course/view.php"]`.
- The course overview is usually inside one of these containers:
  `.block_myoverview`, `[data-region="courses-view"]`,
  `[data-region="course-content"]`, or `#frontpage-course-list`.
- Titles are inferred from common Moodle course-card selectors such as
  `[data-region="course-title"]`, `.coursename`, `.multiline`, `.card-title`,
  heading tags, or the course link text itself.
- Area/category text is inferred from common metadata selectors like
  `[data-region="course-category"]`, `.categoryname`, `.text-muted`, and
  `small`, with text fallbacks when those are missing.
- Favorite state is inferred from common Moodle favorite toggle patterns such as
  `[data-toggletype="favorite"]` / `[data-toggletype="favourite"]` and
  pressed-state controls.
- Progress is inferred from either explicit progress selectors or a text match
  like `100% abgeschlossen`.
- Semester detection is regex-based and supports both compact labels like
  `FS26` / `HS25` and spaced variants like `2025 HS`.

## Notes

- This is a browser extension only. There is no backend and no standalone app.
- The React UI is mounted inside a Shadow DOM root for style isolation.
- Tailwind preflight is disabled by omission, so Moodle’s page styles are not
  globally reset.
