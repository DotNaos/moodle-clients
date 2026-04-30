# Design System

A record of the foundational design decisions, UI rules, and component styles to be used by all contributors and AI agents across the Moodle Clients project. This ensures a cohesive UI look and feel across platforms.

## 1. Core Principles

- **Minimal & High Contrast:** Emphasize critical user paths by removing unnecessary borders and layout containers. Use pronounced contrast and negative space.
- **Cross-platform Compatibility:** Our unified UI targets both Expo React Native and Web.

## 2. Shapes & Layouts

- **Pill-shaped Actions & Inputs:** All buttons, input fields, and search bars use a fully-rounded pill shape (`borderRadius: 9999`).
- **Borderless Interfaces:** Primary actionable elements like inputs and buttons (`PrimaryButton`, `SecondaryButton`, `GhostButton`, `<TextField>`) are strictly borderless (`borderWidth: 0`, `borderColor: "transparent"`).
- **Overlays / Modals:** Modals and Pop-ups do not have borders (`borderWidth: 0`). They use dark high-contrast backgrounds (e.g., `#18181A` on top of a dark overlay) and drop shadows to establish elevation without requiring thick line borders.

## 3. Typography & Text

- **No Wrapping in Containers:** Buttons and distinct UI inputs must not wrap text. Enforce `numberOfLines={1}` in React Native on `<Button.Label>` elements, and `whiteSpace: "nowrap"` in web styles.
- **Hierarchical Weight:** Let font sizes and weights dictate importance rather than container bounding boxes.

## 4. Components

- **Inputs (`TextField`):** Internally leverages `<HeroInput>` from `heroui-native`, combined with the `styles.input` configuration to ensure the field inherits the pill-shaped, borderless aesthetic with its `rgba(255,255,255,0.06)` background.
- **Buttons (`AppButton` wrappers):** Primary, Secondary, and Ghost versions abstract away manual styling. They default to strict pill shapes. They use the HeroUI `variant="primary"|"secondary"|"ghost"` props with `feedbackVariant="scale"`.
- **Dividers:** Use visual dividers (e.g. `--- or ---` with 1px low opacity lines) instead of bounding boxes to separate disparate elements vertically.
