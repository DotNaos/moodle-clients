# Mobile App Redesign Plan

## Product Frame

The app should stop feeling like a QR utility with course browsing bolted on. It should feel like a small Moodle operating system for a student: open the app, know whether Moodle is connected, see what matters next, and move into courses or pairing without reading instructions.

The core mental model is:

1. Connect once.
2. Land on a useful study home.
3. Browse courses as the main work area.
4. Use pairing only as a supporting tool.

## Navigation Model

Use four top-level destinations:

- Today: connection state, study summary, recent/next actions, quick course entry.
- Courses: course list and selected course contents.
- Connect: Moodle QR login and browser pairing tools.
- Profile: account/session details and low-frequency controls.

This is a better split than the old Home/Courses/Connect layout because it separates daily use from setup. The user should not have to stare at authentication controls once the app is connected.

## Screen Strategy

### Today

Purpose: make the app feel useful even before a full Moodle client exists.

Content:

- compact header with connection state
- primary action based on state:
  - disconnected: connect Moodle
  - connected with courses: continue into courses
  - connected but empty: refresh Moodle
- small metrics for courses, site, and pairing readiness
- a short "next best action" panel
- recent courses once data exists

### Courses

Purpose: make course browsing the real center of the app.

Content:

- search/filter input placeholder for the future
- horizontally scannable course selector or compact list
- selected course details
- section list with modules
- loading and empty states that explain what is happening without sounding like docs

### Connect

Purpose: keep authentication powerful but contained.

Content:

- two-step connection flow:
  - Moodle account
  - browser pairing
- show connected state at the top if available
- make scanner actions primary
- keep paste fields available but visually secondary

### Profile

Purpose: hold session facts and future preferences.

Content:

- connected Moodle site
- Moodle user ID
- local-session explanation
- placeholders for future preferences such as pinned courses, display density, and sync behavior

## Layout Direction

Use a mobile-first "study console" layout:

- no oversized hero after the first viewport
- persistent bottom navigation for thumb use
- dense but calm cards
- clear section headers
- stable button sizes
- fewer nested cards
- content cards should feel like work surfaces, not marketing panels

The visual tone should stay dark and focused, but the structure should be more practical:

- slate/stone base
- warm white text
- green for connected/ready
- blue for pairing/network actions
- amber only for warnings

## Component Split

Move away from a single giant `App.tsx`.

Target package structure:

- `App.tsx`: state orchestration only
- `src/screens/TodayScreen.tsx`
- `src/screens/CoursesScreen.tsx`
- `src/screens/ConnectScreen.tsx`
- `src/screens/ProfileScreen.tsx`
- `src/components/BottomNav.tsx`
- `src/components/ScannerModal.tsx`
- `src/components/StatusBanner.tsx`
- `src/components/ui.tsx`
- `src/styles.ts`
- `src/format.ts`

This keeps screen decisions readable and makes later redesign work cheaper.

## First Implementation Scope

Keep existing Moodle behavior intact:

- QR login still works
- pairing still works
- courses still load after connection
- course contents still load on selection

Change the experience:

- replace top tabs with bottom navigation
- make Today the default daily-use screen
- demote pairing from the whole app identity into Connect
- add Profile for session and future preferences
- improve course browsing hierarchy
- split files to keep code maintainable

## Verification

Before reporting back:

- run `pnpm typecheck`
- run `pnpm build`
- run `pnpm lint`
- render Expo Web locally
- inspect mobile viewport visually
- click through Today, Courses, Connect, and Profile
- verify no clipped or overlapping text in the tested mobile viewport
