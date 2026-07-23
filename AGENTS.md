# MagusNG

German PWA for Midgard M5 character management. All client-side — no backend.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — **vue-tsc -b && vite build** (typecheck then build, must pass both)
- `npm run preview` — Vite preview of production build
- `npm run build:dev` — dev build with `VITE_APP_VERSION=<version>-dev.<sha>` + `VITE_PWA_NAME='Magus NG - DEV'`
- `npm run build:prod` — production build (same as `npm run build`)
- `npm run deploy:dev` / `npm run deploy:prod` — deploy via rsync

No test/lint/formatter configured. No pre-commit hooks.

## Architecture

```
src/
  main.ts              — Vue app bootstrap (createApp + useRouter)
  App.vue              — Nav bar + RouterView + UpdateBanner + DevBanner + NotificationChips
  router/index.ts      — vue-router, lazy-loaded views
  views/               — Page-level components (Home, Sheet, Form, Advancement, Equipment, Spells, Rules, Help)
  components/          — DevBanner, GradUpPopup, NotificationChips, UpdateBanner
  composables/         — useNotifications (global notification queue)
  services/            — Business logic, no framework dependency
    CharacterStorage   — IndexedDB CRUD + file export/import via FS Access API
    CharacterService   — Migration, diff computation, default character factory
    CharacterValidator — Rules validation + autoFix (7 categories A–H)
    RulesStorage       — IndexedDB CRUD, multi-source merge
    RulesLoader        — Thin facade over RulesStorage.loadActive()
    AdvancementService — EP cost calc, learn/advance skills (returns new Character, never mutates)
    GradUtils          — Pure functions: computeGrad, esForNextGrad
    GradUpService      — Grad advancement step logic (W%, dice, AP)
    SheetSkillService  — Sheet display helpers
    FileProvider       — LocalFileProvider (FS Access API) + GoogleDriveProvider
    BackupService      — Full backup/restore as ZIP (JSZip)
    LatexExportService — LaTeX + PDF character sheet generation
    FormulaEngine      — Dice formula range validation
    HouseRulesService  — Per-character house rule sources
    CharacterLoadService — Load character + rules, compute derived values
  types/               — Plain interfaces (Character, CharacterType, Equipment, Race, Rules, Skill, SkillRules, Spell, CharacterValidation)
  constants/ui.ts      — All UI strings exported as `UI` object (German)
  help/                — Markdown help pages (rendered via markdown-it)
  styles/buttons.css   — Global button styles
```

## Key Conventions

- **Immutable updates**: Services (AdvancementService) return new Character objects, do NOT mutate in place
- **Singleton services**: Each service exports a shared instance (e.g. `export const characterStorage = new CharacterStorage()`)
- **`__APP_VERSION__`** injected at build time from package.json via Vite `define`. Override via `VITE_APP_VERSION` env var (dev builds) or `VITE_PWA_NAME` for the PWA display name.
- **Browser requirement**: File System Access API needed — only Chromium browsers. Components check `'showOpenFilePicker' in window`
- **Google Drive** works in all browsers via OAuth + Google Picker API (requires `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_APP_ID` in `.env`)
- **No CSS framework**: Scoped `<style>` in each component, plain CSS
- **No state library**: Vue `ref` / `reactive` only (no Pinia)
- **Lazy routes**: All views except Home are `() => import(...)` — do NOT add eager imports to routes
- **All visible text** lives in `src/constants/ui.ts` as `UI` object. Import and use `UI.key` — never hardcode German strings in templates

## IndexedDB

| Database          | Store       | Key     |
|-------------------|-------------|---------|
| `MagusNG`         | `characters`| `id`    |
| `MagusNG-Rules`   | `sources`   | `id`    |

Rules merge priority: houseRule → isCore → other (first-wins per field).

## CI / Release

- Only `release` branch triggers GitLab CI pages deploy, version bump, and GitLab release
- `master` branch builds and deploys to GitLab Pages (no version bump)
- CI runs `npm version minor --no-git-tag-version`, then `npm ci && npm run build`
- `.npmrc` sets `git-tag-version=false` — local `npm version` never creates git tags. CI overrides with `NPM_CONFIG_GIT_TAG_VERSION=true`
- Version commits are pushed as `chore: release v${VERSION} [skip ci]` with a git tag
- `tools/VERSION` file written during CI release build (for Python scripts)
- CI merges `release` back to `master` after release

## OpenSpec

Change tracking via `openspec/` directory. Use OpenSpec skills (`openspec-propose`, `openspec-apply-change`, etc.) for structured changes.

## Copilot Instructions

See `.github/copilot-instructions.md` for detailed language, workflow, and code style rules. Loaded automatically by this project's `opencode.json`.

## Rule Data — DO NOT TOUCH (CRITICAL)

**NEVER, under any circumstances, modify files under `tools/rules/*.json`.**

Parser scripts under `tools/` are the single source of truth. Rule files are generated artifacts — any manual edit will be overwritten on the next parse run. If rule data needs fixing, fix the parser script, then regenerate.
