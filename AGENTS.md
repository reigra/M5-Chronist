# MagusNG

German PWA for Midgard M5 character management. All client-side — no backend.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — **vue-tsc -b && vite build** (typecheck then build, must pass both)
- `npm run preview` — Vite preview of production build

No test/lint/formatter configured. No pre-commit hooks.

## Architecture

```
src/
  main.ts              — Vue app bootstrap (createApp + useRouter)
  App.vue              — Nav bar + RouterView + UpdateBanner
  router/index.ts      — vue-router, lazy-loaded views
  views/               — Page-level components (Home, Sheet, Form, Advancement, Equipment, Spells, Rules)
  components/          — Only UpdateBanner.vue today
  services/            — Business logic, no framework dependency
    CharacterStorage   — IndexedDB CRUD + file export/import via FS Access API
    RulesStorage       — IndexedDB CRUD, multi-source merge
    RulesLoader        — Thin facade over RulesStorage.loadActive()
    AdvancementService — EP cost calc, learn/advance skills (returns new Character, never mutates)
    GradUtils          — Pure functions: computeGrad, esForNextGrad
    SheetSkillService  — Sheet display helpers
  types/               — Plain interfaces (Character, CharacterType, Equipment, Race, Rules, Skill, SkillRules, Spell, etc.)
  constants/ui.ts      — All UI strings exported as `UI` object (German), import via `import { UI } from '../constants/ui'`
```

## Key Conventions

- **Immutable updates**: Services (AdvancementService) return new Character objects, do NOT mutate in place
- **Singleton services**: Each service exports a shared instance (e.g. `export const characterStorage = new CharacterStorage()`)
- **`__APP_VERSION__`** injected at build time from package.json via Vite `define`. Just reassign the constant — no manual version bumps needed.
- **API version** injected into component templates automatically via vite-plugin-pwa
- **Browser requirement**: File System Access API needed — only Chromium browsers. Components check `'showOpenFilePicker' in window`
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

- Only `release` branch triggers GitLab CI pages deploy
- CI runs `npm version patch --no-git-tag-version`, then `npm ci && npm run build`
- `.npmrc` sets `git-tag-version=false` — `npm version` never creates git tags
- Version commits are pushed as `chore: release v${VERSION} [skip ci]`

## Copilot Instructions

See `.github/copilot-instructions.md` for detailed language, workflow, and code style rules. Loaded automatically by this project's `opencode.json`.
