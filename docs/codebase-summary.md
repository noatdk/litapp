# Codebase Summary

## Project Overview
**Litapp** is an unofficial Literotica mobile app built with Ionic v3 and Cordova for Android/iOS. The codebase is in low-effort maintenance mode following upstream Literotica site changes that broke feed functionality.

**Current Status:** Visual restyle (phase-01 through phase-05, May 2026) completed. Light-theme design system established with unified color palette and component styling.

## Project Structure

```
litapp/
├── src/                          # TypeScript/Angular source
│   ├── app/                      # Main app module & shell
│   │   ├── app.component.ts      # App initialization, status bar config
│   │   ├── app.scss              # Global styles, Mulish font
│   │   ├── app.module.ts         # Angular module definition
│   │   ├── env.ts                # Environment variables
│   │   └── pages/                # Page components (home, search, auth, etc.)
│   ├── theme/                    # SCSS theming system
│   │   ├── _tokens.scss          # Design tokens (colors, typography, spacing)
│   │   ├── variables.scss        # Ionic component variable overrides
│   │   ├── _row.scss             # Shared row component styling
│   │   └── _series-card.scss     # Series card component styling
│   ├── assets/                   # Static assets (images, fonts excluded)
│   ├── providers/                # Services & API providers
│   └── index.html                # HTML entry point, theme-color meta
├── config.xml                    # Cordova platform config (status bar prefs)
├── package.json                  # Dependencies
├── app.json                       # App metadata (Ionic)
├── platforms/                    # Generated Android/iOS build output
│   ├── android/                  # Android native project
│   └── ios/                      # iOS native project (not visually QA'd)
├── resources/                    # App icons & splash screens
├── docs/                         # GitHub Pages output (public docs)
└── plans/                        # Development plans & roadmaps
    └── 2026-05-02-visual-restyle-litapp/  # Active restyle plan
```

## Theming System

### Architecture
The theming system is built on SCSS variables with three layers:

1. **Design Tokens** (`src/theme/_tokens.scss`)
   - Single source of truth for all color hex values
   - Typography scales (font sizes, weights, line heights)
   - Spacing scale (4px–32px)
   - Border radius scale (4px–pill)
   - Shadow definitions

2. **Ionic Variable Overrides** (`src/theme/variables.scss`)
   - Maps design tokens to Ionic v3 component slots
   - MD (Material Design) and iOS mode-specific overrides
   - Includes native Cordova prefs (spinner colors, header colors)

3. **Component-Specific Styling**
   - `_row.scss` — shared story/author row layout
   - `_series-card.scss` — series chapter card styling
   - Individual page SCSS files reference tokens via `@import 'src/theme/_tokens'`

### Color Palette (Tokens)
- **Primary:** Lit-blue `#0066cc` (links, active states, spinners, header)
- **Accent:** Hot red `#ff3b30` (HOT badge only)
- **Surfaces:** White `#ffffff` (rows, cards) + faint blue-gray `#f1f4f9` (page bg)
- **Text:** Primary black `#111111` + gray spectrum (`#555555`, `#888888`)
- **Drawer:** Dark `#1f1f1f` background + white text

See `docs/design-guidelines.md` for complete palette + contrast ratios.

### Native Integration
- **Status Bar:** Configured in `config.xml` (white bg, dark text)
- **Splash Spinner:** Lit-blue spinner `#0066cc`
- **Theme Color Meta:** `index.html` `<meta name="theme-color" content="#ffffff">` (browser Chrome)

## Key Pages & Components

### Page Structure (src/app/pages/)
| Page | Purpose | Key Components |
|---|---|---|
| `home/` | Tab root, wordmark, featured stories | Tabs bar, story rows, featured carousel |
| `explore/` | Browse stories by category | Category tiles, filters |
| `author/` | Author profile, bio, story list | Avatar, stats, story rows |
| `story-detail/` | Story metadata & interaction | Rating, read button, series info |
| `story-view/` | Reader (immersive story text) | Light theme reader |
| `search/` | Search stories/authors | Searchbar, highlight matches, result rows |
| `history/` | Read history | Time-sorted rows, clear action |
| `feed/` | Subscribed author feed (status: broken) | Author rows, follow toggle |
| `following/` | Following list | Author rows, unfollow action |
| `top-list/` | Trending stories | Top stories by rank, sort popover |
| `user-list/` | Collections (read later, etc.) | Create/edit/delete lists |
| `list-view/` | List detail | Stories in collection, reorder |
| `story-related/` | Related stories / series | Related story rows + series chapters |
| `login/` | Authentication | Primary blue button, error handling |
| `settings/` | App preferences | Toggles, theme selection (removed), profile |

### Shared Components
- **Story Row** — `src/theme/_row.scss` — title, author, tags, star rating
- **Series Card** — `src/theme/_series-card.scss` — chapter list for multi-part stories
- **Popover** — modal-like menu (white bg, dark text, drop shadow)
- **Alert Dialog** — error/confirmation (white bg, dark text)
- **Searchbar** — white bg with divider border, light placeholder text

## Services & Providers (src/providers/)

| Provider | Purpose |
|---|---|
| `api-provider.ts` | Literotica API v3 client (slug-vs-id endpoints, auth tiers) |
| `globals.ts` | App version, device info, shared state |
| `auth-provider.ts` | Session mgmt, login/logout |
| `toast-provider.ts` | Toast notifications |
| `share-provider.ts` | Native sharing (text, images) |

## Dependencies

### Major Packages
- **Ionic:** v3.9.2 — mobile framework (components, routing, native integration)
- **Angular:** v5 — TS framework, DI, modules
- **Cordova:** v8.1.2 — native build bridge
- **Cordova Plugins:**
  - `cordova-plugin-statusbar` — status bar styling
  - `cordova-plugin-headercolor` — native header tint (Android)
  - `cordova-plugin-splashscreen` — splash screen mgmt
  - `cordova-plugin-file-opener2` — open files (PDFs, etc.)
  - `cordova-plugin-fingerprint-aio` — biometric auth
  - `cordova-plugin-x-socialsharing` — share dialogs

### Build & Dev
- **Node-sass:** SCSS compilation
- **TypeScript:** Language support
- **Webpack:** Module bundling (via Ionic CLI)

## Build & Release

### Local Development
```bash
npm install && npm install -g ionic@3.9.2 cordova@8.1.2
npm start                        # Browser dev at localhost:8100
npm run android                  # Build & run on Android device
```

### Production Release
- Automated via `./release.sh` or `./update_version.sh`
- Updates version in: `config.xml`, `package.json`, `src/providers/globals.ts`, `app.json`, `docs/index.md`
- Built APK output: `platforms/android/app/build/outputs/apk/release/`
- Signed with `platforms/litapp-key.jks`

See `BUILDINFO.md` for full build & release instructions.

## Recent Changes (Visual Restyle, May 2026)

### Phase Completion Status
- **Phase-01:** Design tokens defined (`src/theme/_tokens.scss`) ✓
- **Phase-02:** Global chrome (toolbar, tabs, shell) restyled ✓
- **Phase-03:** Shared parts (rows, popovers, series cards) restyled ✓
- **Phase-04:** All page designs updated ✓
- **Phase-05:** QA & polish — status bar + spinner colors synced ✓
  - `config.xml` status bar: white `#ffffff`
  - Spinner color: Lit-blue `#0066cc` (iOS & MD vars defined symmetrically)
  - iOS mode variables defined for upstream compatibility (not visually QA'd)
- **Phase-06:** UX improvements (TBD)

### Files Changed in Phase-05
- `config.xml` — status bar background `#ffffff`, splash spinner `#0066cc`
- `src/theme/variables.scss` — added iOS spinner vars (`$spinner-ios-*`)
- `src/index.html` — theme-color meta `#ffffff`

## Known Limitations & Gaps

### Maintenance Mode
- Feed (subscribed authors) broken due to upstream Literotica changes
- Account-based features (login, history sync) may fail
- No public API — scrapes from web (fragile)

### iOS
- Visual design not QA'd in phase-05; iOS mode SCSS vars defined for compilation only
- No immersive reader toggle implemented

### Future Work (Phase-06+)
- Author + Story-detail page redesign requested
- Potential immersive reader mode for iOS
- UX improvements TBD

## Documentation & Planning

| Document | Purpose |
|---|---|
| `docs/design-guidelines.md` | Color palette, theming, accessibility |
| `docs/codebase-summary.md` | This file — architecture overview |
| `plans/2026-05-02-visual-restyle-litapp/` | Restyle plan phases, progress, checklists |
| `README.md` | Project intro, links, status |
| `BUILDINFO.md` | Build, debug, release instructions |
| `TODO.md` | Known issues & feature requests |

## Development Rules & Standards

### Coding Style
- **TypeScript:** Angular conventions (services, components, decorators)
- **SCSS:** Token-first approach; no hard-coded hex values in components
- **Naming:** camelCase (TS/JS), kebab-case (CSS classes), UPPER_SNAKE_CASE (constants)

### Version & Testing
- Current version: 1.25 (see `src/providers/globals.ts`)
- No automated test suite (manual QA on device)
- Android device: CPH1933 (debug target)

### Git Workflow
- Main branch: `master` (upstream tracking)
- Feature branches: topic branches for PRs
- Commit messages: descriptive, no brand shorthand (Discord, Slack, etc.)

## Related Resources
- GitHub: https://github.com/theilluminatus/litapp
- Releases: https://github.com/theilluminatus/litapp/releases
- Literotica API docs: (community-maintained, v3 quirks in dev memory)
- Ionic v3 docs: http://ionicframework.com/docs/v2/theming/

---

**Last Updated:** 2026-05-02 (phase-05 completion)  
**Maintainer:** Development team  
**Status:** Active restyle phase complete; maintenance mode ongoing
