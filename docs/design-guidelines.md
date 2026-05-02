# Design Guidelines

## Overview
Litapp uses a light-theme design system with a restricted color palette focused on white, black, and Lit-blue. The visual restyle (phase-01 through phase-05, May 2026) established a cohesive design language across all pages and components.

**Design Tokens Reference:** See `src/theme/_tokens.scss` for the single source of truth for all color hex values and typography scales.

## Color Palette

### Brand Color
- **Lit-blue (Primary):** `#0066cc` — main interactive color; used for buttons, links, active tabs, spinners, headers
- **Lit-blue Hover:** `#004c99` — darker variant for hover/active states
- **Lit-blue Tint:** `#cfe3ff` — light background for search highlights or subtle indicators
- **Lit-blue Active (pressed):** `rgba(0, 102, 204, 0.18)` — semi-transparent overlay for pressed surfaces

### Surface & Structure
- **Page Background:** `#f1f4f9` — faint blue-gray surround behind main content (body + content container)
- **Surface Background:** `#ffffff` — pure white for rows, cards, reader, toolbar, drawer header
- **Surface Alt:** `#eef2f7` — subtle off-white for item dividers and `color="light"` Ionic components
- **Divider:** `#dde3ec` — line dividers (cool gray tuned for blue-tinted page bg)

### Text & Typography
- **Text Primary:** `#111111` — body text, headings
- **Text Secondary:** `#555555` — description text, metadata
- **Text Muted:** `#888888` — subtle labels, timestamps, refresher icons
- **Text Inverse:** `#ffffff` — text on dark backgrounds (sidebar, dark surfaces)

### Sidebar (Navigation Drawer)
- **Sidebar Background:** `#1f1f1f` — near-black drawer surface
- **Sidebar Row Active:** `#2a2a2a` — active menu item bg
- **Sidebar Text:** `#ffffff` — drawer text
- **Sidebar Text Muted:** `#b3b3b3` — secondary drawer text
- **Sidebar Accent:** `#0066cc` — active nav indicator (same as Lit-blue)

### Accent Exception
- **Accent Hot (HOT Badge):** `#ff3b30` — the sole non-monochrome non-blue color; reserved for HOT content badge and Ionic `danger` slot. By necessity, `red`, `yellow`, and `danger` color slots collapse onto this value.

### Search Highlighting
- **Highlight All Background:** `#cfe3ff` — pale blue bg for all search matches
- **Highlight All Foreground:** `#111111` — dark text on pale blue
- **Highlight Current Background:** `#0066cc` — Lit-blue bg for current/active match
- **Highlight Current Foreground:** `#ffffff` — white text on Lit-blue

## Native Platform Integration

### Status Bar (Cordova config.xml)
The status bar is configured at the native level to match the light theme:

- **StatusBarBackgroundColor:** `#ffffff` — white background
- **StatusBarStyle:** `default` — renders dark text on light status bar background (standard native behavior)

Location: `config.xml` lines 18–19. Must stay in sync with:
- `src/index.html` `<meta name="theme-color" content="#ffffff">` (browser Chrome tab color)
- App toolbar background color (`$surface-bg` = `#ffffff`)

### Splash Screen & Header
- **SplashScreenSpinnerColor:** `#0066cc` — Lit-blue spinner during app load
- **HeaderColor:** `#0066cc` — native header tint color (Android)

## Component Styling

### Spinners (Loading Indicators)
Ionic spinners are styled via SCSS variables:

**iOS Mode:**
```scss
$spinner-ios-crescent-color: $lit-blue;
$spinner-ios-bubbles-color:  $lit-blue;
$spinner-ios-circles-color:  $lit-blue;
$spinner-ios-dots-color:     $lit-blue;
$spinner-ios-ios-color:      $lit-blue;
```

**Material Design Mode:**
```scss
$spinner-md-crescent-color: $lit-blue;
$spinner-md-bubbles-color:  $lit-blue;
$spinner-md-circles-color:  $lit-blue;
$spinner-md-dots-color:     $lit-blue;
$spinner-md-ios-color:      $lit-blue;  // completeness; rarely used
```

All spinners render in Lit-blue (`#0066cc`) to match primary interactive color and ensure sufficient contrast on white backgrounds.

**Note:** iOS mode variables are defined symmetrically alongside Material Design variants for upstream compatibility. iOS pages are not visually QA'd in this phase but must compile and render without missing/inverted styles.

### Toolbar & Header
- **Background:** `$surface-bg` (`#ffffff`)
- **Text Color:** `$text-primary` (`#111111`)
- Both MD and iOS modes use matching variables for consistency

### Tabs Bar
- **Background:** `$surface-bg` (`#ffffff`)
- **Tab Color Active:** `$lit-blue` (`#0066cc`)
- **Top Border:** `$divider` (`#dde3ec`)

### Content & List Backgrounds
- **Page/Content Background:** `$page-bg` (`#f1f4f9`)
- **List Background:** `$page-bg` (faint blue-gray)
- **Item Background:** `$surface-bg` (pure white)
- **Item Divider:** `$divider` (cool gray line)

### Cards
- **Background:** `$surface-bg` (`#ffffff`)
- **Header Text:** `$text-primary` (`#111111`)
- **Body Text:** `$text-secondary` (`#555555`)

## Contrast & Accessibility
- Link blue (`#0066cc`) on white (`#ffffff`): **4.5:1 contrast ratio** — WCAG AA compliant
- Body text (`#111111`) on white (`#ffffff`): **19.1:1 contrast ratio** — WCAG AAA
- Muted text (`#888888`) on white (`#ffffff`): **5.9:1 contrast ratio** — WCAG AA

**Minimum contrast requirement:** 4.5:1 for normal text (AA), 3:1 for large text (AA). All palette values meet or exceed WCAG AA standards.

## Typography

### Font Stack
```scss
$font-sans: 'Mulish', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
```
- **Wordmark/System Font:** Mulish (loaded as variable font weight 1–1000 via `@font-face` in `src/app/app.scss`)
- **Fallback:** System fonts (Segoe UI on Windows, SF Pro Display on macOS/iOS, Roboto on Android)

### Size & Weight Scale
| Role | Font Size | Line Height | Font Weight |
|---|---|---|---|
| Page Title | 28px | 1.2 | 600 |
| Section Header | 18px | 1.3 | 600 |
| Row Title | 16px | 1.4 | 600 |
| Meta/Label | 13px | 1.5 | 400 |

## Spacing Scale
- `$sp-1: 4px`
- `$sp-2: 8px`
- `$sp-3: 12px`
- `$sp-4: 16px` — default padding
- `$sp-5: 24px`
- `$sp-6: 32px`

## Border Radius Scale
- `$radius-sm: 4px` — small components (badge, tag)
- `$radius-md: 8px` — medium components (card, button, popover)
- `$radius-pill: 999px` — pill shape (avatar, button-pill)

## Shadows
Shadows use black with low opacity for subtle depth:
- **Small Shadow:** `0 1px 2px rgba(0, 0, 0, 0.06)` — subtle depth for popovers
- **Medium Shadow:** `0 2px 6px rgba(0, 0, 0, 0.08)` — moderate depth for cards, modals

## Dark Theme (Deprecated)
The dark theme (`black-theme.css`) was removed in phase-02 of the visual restyle. References to `amoledBlackTheme` setting key, dynamic CSS injection in `app.component.ts`, and Discord palette comments have been purged. The app is light-theme-only as of May 2026.

## Implementation & Maintenance
- **Single Source of Truth:** All hex values live in `src/theme/_tokens.scss`
- **Color Name Mapping:** `src/theme/variables.scss` maps design tokens to Ionic component color slots
- **Component-Specific Overrides:** MD/iOS-specific vars in `variables.scss` (prefixed `$*-md-*` and `$*-ios-*`)
- **Row & Card Styling:** `src/theme/_row.scss` and `src/theme/_series-card.scss` apply token values to structural components

**Do not add hard-coded hex values to component SCSS files.** Always reference tokens from `_tokens.scss`.

## Resources
- Visual restyle plan: `plans/2026-05-02-visual-restyle-litapp/`
- Phase-05 QA & Polish: `plans/2026-05-02-visual-restyle-litapp/phase-05-qa-and-polish.md`
- Ionic v3 theming docs: http://ionicframework.com/docs/v2/theming/
