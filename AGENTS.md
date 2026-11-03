# MagusNG

German PWA for Midgard M5 character management. Fully client-side — Vue 3 + Vite + TypeScript, no backend. Characters and rules live in the browser (IndexedDB or user-picked files).

## Commands

- Node 20+ (CI uses `node:20`; `.node-version` is v20.20.2), npm. Install with `npm install`.
- `npm run dev` — Vite dev server.
- `npm run build` — `vue-tsc -b && vite build`. **Only verification gate**: no tests, lint, or formatter. Use `npx vue-tsc -b` for a typecheck-only run.
- `npm run preview` — serve the production build.
- `npm run build:dev` — build with `VITE_APP_VERSION=<version>-dev.<sha>` and `VITE_PWA_NAME='Magus NG - DEV'`; the `-dev.` suffix drives `DevBanner`.
- `npm run build:prod` — same as `npm run build`.
- `npm run bump:prod` — patch bump, CHANGELOG header, commit. Requires `master` and no uncommitted tracked files.
- `npm run deploy:dev` / `npm run deploy:prod` — build then deploy to Cloudflare Pages (`magus-ng-dev` / `magus-ng`). Needs an authenticated global `wrangler` (not a package dependency) and all four Google vars in env or `.env`. `deploy:prod` additionally requires `master` and no uncommitted tracked changes (untracked files are allowed). Release order: `bump:prod` → `deploy:prod`.

TypeScript is strict and sets `noUnusedLocals` / `noUnusedParameters`: unused imports or parameters break `npm run build`.

## Architecture

```
src/
  main.ts / App.vue      — bootstrap; nav, banners, notifications
  router/index.ts        — HomeView is the only eager route; all other views lazy
  views/                 — Home, Character (sheet), CharacterEdit, Advancement, Spells, Equipment, Rules, Help
  components/            — DevBanner, GradUpPopup, NotificationChips, UpdateBanner
  composables/           — useNotifications (global queue)
  services/              — framework-free business logic; views import singletons directly
  types/                 — plain interfaces
  constants/ui.ts        — German UI strings in the `UI` object
  help/                  — Markdown topics + images, loaded via import.meta.glob in HelpView
  styles/buttons.css     — global button classes
```

Services:
- `CharacterStorage` / `RulesStorage` — IndexedDB CRUD, import/export; `RulesStorage` owns source merging.
- `CharacterService` — migration, diff, default character factory.
- `CharacterValidator` — validation categories A–I plus `autoFix`; returns new objects.
- `CharacterLoadService` — load → autoFix → validate chain.
- `AdvancementService` — EP costs, learn/advance skills; returns a new `Character`, never mutates.
- `GradUtils` — pure `computeGrad` / `esForNextGrad`. Grad is derived from `totalEs`, never stored.
- `GradUpService` — grad-step logic (W%, property dice, AP); rules may come from loaded data.
- `FormulaEngine` — M5 formula tokenizer/parser; no `eval`.
- `SheetSkillService` — sheet display values (EW, Fertigkeitsbonus, PP).
- `FileProvider` — FS Access API + Google Drive OAuth/Picker.
- `BackupService` — ZIP backup/restore (characters + rules + metadata).
- `LatexExportService` — LaTeX sheet generation and TeXLive.net PDF compile.
- `HouseRulesService` — per-character house-rule sources at priority 0.

## Conventions

- **Language**: code, identifiers, docs, and plans in English; German for UI strings, M5 rules, and domain terms. Chat responses in German. Comments may be German when they explain game mechanics.
- **Service docs**: public service classes and methods use short JSDoc (purpose, parameters, return value); keep that style for new service APIs.
- **Types**: avoid `any` in new code; reuse the interfaces in `src/types/`.
- **Immutable service results**: `AdvancementService`, `CharacterValidator.autoFix`, etc. return new objects; do not mutate input characters.
- **Singletons**: services export one shared instance (`export const characterStorage = ...`). Views use these directly; there is no Pinia or global store.
- **UI text**: add German strings to `src/constants/ui.ts` and use `UI.key`. Do not hardcode new text in templates.
- **No CSS framework**: plain scoped `<style>` per component; shared button classes live in `src/styles/buttons.css`.
- **Routes stay lazy**: only `HomeView` is eagerly imported in `src/router/index.ts`.
- **Build-time values**: `__APP_VERSION__` is injected from `package.json`; override with `VITE_APP_VERSION`. `VITE_PWA_NAME` changes the manifest name. A version containing `-dev.` activates the DEV banner.
- **Google Drive UI** only appears when `VITE_GOOGLE_CLIENT_ID` is set (`isDriveAvailable()`); without `.env`, local development still works but Drive buttons are hidden.
- **Browser limits**: local file import/export uses the File System Access API (Chromium only). Drive works in all browsers but needs OAuth credentials.
- **IndexedDB values**: Vue reactive proxies cannot be structured-cloned; `CharacterStorage.save()` JSON round-trips the object. Follow that pattern for new stored data.

## Data and rules

| Database            | Store        | Key  |
|---------------------|--------------|------|
| `M5-Chronist`       | `characters` | `id` |
| `M5-Chronist-Rules` | `sources`    | `id` |

- `loadActive()` sorts enabled sources by ascending `priority` (lower number wins), then merges by `id` with first-wins per field. House rules are stored at priority 0; imported sources use `metadata.priority` (or 999 when absent), while legacy entries without priority fall back to houseRule 0 / core 1 / other 999. `skillRules`, `costColumns`, `costPatterns`, `gradThresholds`, and `techniqueRules` are whole-object first-wins.
- The README's `MagusM5` database names are stale; the code above is authoritative.
- Rules JSON format: `docs/data-schema.md`.
- Behavior specs (archived, plain Markdown): `docs/specs/` — the code is authoritative.

## Generated rule data — do not edit

- `tools/rules/*.json` is gitignored and generated. **Never edit these files**; fixes go into the parser scripts, then regenerate.
- `tools/Start-Installation.cmd` runs the Windows GUI parser (`tools/scripts/download_parse_rules_gui.py`), downloading EVA/Mogadil sources and writing `tools/rules/`. Individual parsers live in `tools/scripts/parse_*.py`; `tools/VERSION` is written by CI for them.
- The app ships no rule data. Users import the generated JSON at runtime, so a fresh checkout has no usable rules until parsing/importing.
- `scripts/merge-sim.ts` (merge conflict inspection) and `scripts/verify-costs.ts` (EVA vs Mogadil cost check) are ad-hoc diagnostics, not part of the build; run with `npx tsx` and generated rule files present.

## CI / release

- `master` → `npm ci && npm run build`, deploy to GitLab Pages (no version bump).
- `release` → install, `npm version minor --no-git-tag-version`, prepend CHANGELOG header, write `tools/VERSION`, commit/tag `v<version>`, build, publish GitLab Pages + release asset, then fast-forward `master` from `release`.
- The version commit is pushed with `-o ci.skip`; the subsequent merge-back push to `master` triggers the Pages deploy.
- `.npmrc` sets `git-tag-version=false`, so local `npm version` never creates tags; CI overrides with `NPM_CONFIG_GIT_TAG_VERSION=true`.
- GitLab CI is separate from the local Cloudflare `deploy:*` scripts.
