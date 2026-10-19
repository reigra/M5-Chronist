# Magus NG — Development Plan

This document describes the planned development phases, open technical decisions, and component breakdown for the Magus NG app.

---

## Open Decisions

The following technical decisions must be made before implementation starts. Options and trade-offs are listed below.

### Decision 1: Backend Technology — **Decided**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| Node.js + Express | Lightweight REST API server, runs locally | Simple, well-known, easy file I/O | Requires running a local server process |
| Node.js + Fastify | Like Express, but faster and TypeScript-first | Better TypeScript support, good performance | Less documentation/examples than Express |
| **Browser-only (File System Access API)** ✓ | No server — all file access via browser API | No install required, true PWA | Limited browser support, no write access on all platforms |

**Decision:** Browser-only. No backend server. All file access uses the File System Access API. This is required for offline PWA support and eliminates the need to run a local server process.

**Browser requirement:** The File System Access API (`showOpenFilePicker`, `showSaveFilePicker`) is only supported in **Chromium-based browsers** (Chrome, Edge, Opera). Firefox and Safari are explicitly out of scope for this project.

---

### Decision 2: Offline Strategy — **Decided**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| Service Worker + Cache | Cache app shell and rules data in browser | Standard PWA approach, works offline after first load | Requires careful cache invalidation strategy |
| IndexedDB | Store characters in browser database | No file system needed, always available | Characters are locked to the browser/device |
| **Hybrid** ✓ | Service Worker for app, IndexedDB for characters, File System API for export/import | Best UX | More complex to implement |

**Decision:** Hybrid approach. Service Worker caches the app shell and all rules data. Characters are stored in IndexedDB (always available, no permission needed). File System Access API is used for JSON export and import of characters. Requires a Chromium-based browser (see Decision 1).

---

### Decision 3: Rules Data Storage — **Decided**

Rules data is split across multiple source books (core: Kodex + Arkanum, extensions: Das Mysterium, Dunkle Mächte, etc.). The app must be able to load only the activated sources.

| Option | Pros | Cons |
|--------|------|------|
| One large JSON file | Atomic, simple caching | Everything loads always, hard to scale, full cache invalidation on any change |
| ZIP archive | ~75% smaller files | Requires JS library, complex Service Worker handling, extra decompression step |
| **One JSON file per rulebook** ✓ | Clean separation, only active sources load, easy to extend, efficient cache invalidation | Multiple requests on first start (solved by Service Worker pre-caching) |
| Binary format (MessagePack/CBOR) | Smaller + faster parsing | Not human-readable, requires library, no benefit at this data size |

**Decision:** One JSON file per rulebook 

Each source file contains all data from that book (spells, skills, types, races, etc.) in a single JSON object.

**Copyright strategy:** The deployed app includes no or only a minimal base rule set. Users can import their own full rulebook JSON files via a file picker. Imported rules are stored in IndexedDB and loaded automatically on every subsequent visit — no file picker needed after the first import. This keeps the deployment copyright-safe while allowing users with the physical books to use the full data set.

**Future optimization (Phase 2+):** After first load, parsed rule data can be stored in IndexedDB to avoid repeated JSON parsing on startup.

---

## Development Phases

### Phase 1 — Foundation (Setup & Data) ✅

**Goal:** Project skeleton is running. Rules data files exist and can be loaded.

| Task | Description |
|------|-------------|
| 1.1 | Initialize Vite + Vue 3 + TypeScript project |
| 1.2 | Set up project folder structure (see below) |
| 1.3 | Create all rules JSON files with placeholder data |
| 1.4 | Create a `RulesLoader` service that reads and validates JSON files |
| 1.5 | Write TypeScript interfaces for all data schemas |
| 1.6 | Set up basic routing (Vue Router) |
| 1.7 | Configure Web App Manifest for PWA |

**Deliverable:** App starts in browser, rules data loads without errors.

---

### Phase 2 — Minimal Viable App (MVP) ✅

**Goal:** An example character can be loaded, skills can be learned and advanced, and the result can be saved. This is the first end-to-end working version of the app.

| Task | Description |
|------|-------------|
| 2.1 | Create example character JSON file for development and testing |
| 2.2 | Build `CharacterStorage` service — load character from JSON file, save to IndexedDB |
| 2.3 | Build `AdvancementService` — EP cost calculation for Lernen and Steigern |
| 2.4 | Implement EP tracking — add earned EP, deduct on learning and advancement |
| 2.5 | Implement skill learning (Lernen) — learn an unknown skill at base level |
| 2.6 | Implement skill advancement (Steigern) — raise a known skill by one level |
| 2.7 | Build minimal UI — character overview with EP balance, skill list, Lernen/Steigern actions |
| 2.8 | Show EP cost preview before confirming an action |
| 2.9 | Save updated character |

**Deliverable:** User can load the example character, spend EP to learn and advance skills, and save the result.

---

### Phase 3 — Manual Character Input ✅

**Goal:** A user can enter an existing character (created on paper) into the app by filling in a form with the character's current values.

| Task | Description |
|------|-------------|
| 3.1 | Build character input form UI — identity, race, type, origin, social status |
| 3.2 | Enter base and derived properties manually |
| 3.3 | Enter total earned EP and current available EP |
| 3.4 | Select known skills and enter their current FW levels |
| 3.5 | Validate entered character data against loaded rules |
| 3.6 | Save entered character to IndexedDB |
| 3.7 | Allow export to JSON file (File System Access API) |

**Deliverable:** User can digitize an existing paper character and save it to the app.

---

### Phase 4 — Character Sheet ✅

**Goal:** A user can view a saved character in a readable format.

| Task | Description |
|------|-------------|
| 4.1 | Build character sheet layout (Vue component) |
| 4.2 | Display all base and derived properties |
| 4.3 | Display full skill list with levels |
| 4.4 | Display identity, race, type, origin, status |
| 4.5 | Load character from IndexedDB |
| 4.6 | Import character from JSON file |

**Deliverable:** User can view any saved character in detail.

---

### Phase 5 — Character Creation ⏳ Not started

**Goal:** A user can create a new character from scratch through a step-by-step wizard.

| Task | Description |
|------|-------------|
| 5.1 | Build `CharacterCreationView` — multi-step wizard shell with step navigation |
| 5.2 | Step 1: Race selection (filtered list from rules) |
| 5.3 | Step 2: Type selection (filtered by chosen race) |
| 5.4 | Step 3: Origin and social status selection |
| 5.5 | Step 4: Base property assignment (manual input; derived properties calculated live) |
| 5.6 | Step 5: Starting skill selection from the type's available skills |
| 5.7 | Step 6: Summary screen — review all choices before saving |
| 5.8 | Save finished character to IndexedDB |
| 5.9 | Allow export to JSON file (File System Access API) |

**Deliverable:** User can create a complete new character step-by-step and save it.

---

### Phase 6 — PWA & Offline ⏳ Not started

**Goal:** App works fully offline after first load.

| Task | Description |
|------|-------------|
| 6.1 | Set up Vite PWA plugin (`vite-plugin-pwa`) |
| 6.2 | Configure Service Worker with Workbox |
| 6.3 | Cache app shell, rules data, and assets |
| 6.4 | Test full offline usage (no network after first load) |
| 6.5 | Add install prompt for PWA |

**Deliverable:** App can be installed and used without internet access.

---

### Phase 7 — Custom Rules Loading ✅

**Goal:** Users can import their own rulebook JSON files. Imported rules are stored in IndexedDB and loaded automatically on the next visit, without requiring a file picker again.

| Task | Description |
|------|-------------|
| 7.1 | Create `RulesStorage` service — read/write rulebook data in IndexedDB |
| 7.2 | Update `RulesLoader` — check IndexedDB first, fall back to server rules |
| 7.3 | Add "Import rules" button — file picker (same pattern as character import) |
| 7.4 | Add "Clear custom rules" option — revert to the base rule set |
| 7.5 | Show active source info on the home screen (which rulebooks are loaded) |

**Deliverable:** User imports their full rulebook JSON once. From that point on, their rules load automatically — offline and without any user interaction.

---

### Phase 8 — Polish & Testing ⏳ Not started

**Goal:** App is stable, usable, and tested.

| Task | Description |
|------|-------------|
| 7.1 | Input validation across all forms |
| 7.2 | Error messages and loading states |
| 7.3 | Unit tests for `CharacterCreatorService` and `AdvancementService` |
| 7.4 | Unit tests for `RulesLoader` (invalid JSON, missing fields) |
| 7.5 | Manual testing on Chrome, Firefox, Edge |
| 7.6 | Responsive layout adjustments (desktop focus) |

**Deliverable:** App is ready for regular use.

---

## Folder Structure

This reflects the actual current state of the repository.

```
MagusNG-PWA/
├── .gitignore
├── .gitlab-ci.yml                 ← GitLab CI/CD: Pages deploy + SAST + Secret Detection
├── docs/                          ← Documentation (this folder)
│   ├── app-description.md
│   ├── character-creation.md
│   ├── character-system.md
│   ├── data-schema.md
│   ├── development-plan.md
│   └── specs/                     ← Archived behavior specs (plain Markdown)
├── index.html
├── package.json
├── public/
│   └── manifest.json              ← PWA manifest (name, icons, display mode)
├── src/
│   ├── App.vue                    ← Root component: top nav bar + <RouterView />
│   ├── main.ts                    ← App entry point
│   ├── constants/
│   │   └── ui.ts                  ← All user-visible UI strings (centralised for i18n)
│   ├── router/
│   │   └── index.ts               ← Vue Router config (7 routes)
│   ├── services/                  ← Business logic layer
│   │   ├── AdvancementService.ts  ← EP cost calculation, Lernen / Steigern logic
│   │   ├── CharacterStorage.ts    ← IndexedDB: save/load characters; JSON export/import
│   │   ├── GradUtils.ts           ← Grad thresholds and ES calculations
│   │   ├── RulesLoader.ts         ← Public API: merges all active sources into RulesData
│   │   └── RulesStorage.ts        ← IndexedDB: import, store, and enable/disable rulebooks
│   ├── types/                     ← TypeScript interfaces
│   │   ├── Character.ts
│   │   ├── CharacterType.ts
│   │   ├── Race.ts
│   │   ├── Rules.ts
│   │   ├── Skill.ts
│   │   └── Spell.ts
│   └── views/                     ← Page-level Vue components
│       ├── AdvancementView.vue    ← EP management: Lernen / Steigern for skills
│       ├── CharacterEditView.vue  ← Create a new character or edit an existing one
│       ├── CharacterView.vue ← Read-only character display with JSON export
│       ├── HomeView.vue           ← Dashboard: character list + active rulebooks
│       ├── RulesView.vue          ← Import and manage rulebook sources (IndexedDB)
│       └── SpellsView.vue         ← EP-based spell learning for caster types
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts
```

**Not yet built:** `src/components/` (reusable sub-components), Service Worker / offline caching.

---

## Component Responsibilities

| Component / Service | Responsibility |
|---------------------|---------------|
| `constants/ui.ts` | Single source of truth for all user-visible strings; enables i18n |
| `RulesLoader` | Public API: merges all enabled sources from `RulesStorage` into a `RulesData` object |
| `RulesStorage` | IndexedDB store for imported rulebook JSON files; toggle sources on/off |
| `AdvancementService` | EP cost calculation, skill-access validation by character type, Lernen/Steigern |
| `CharacterStorage` | IndexedDB: list/load/save characters; JSON file export and import |
| `GradUtils` | Pure functions for Grad thresholds and next-Grad ES targets |
| `HomeView` | Dashboard: character list, active-rulebook summary, JSON import entry point |
| `CharacterEditView` | Unified create/edit form; validates against loaded rules |
| `CharacterView` | Read-only display of all character data with JSON export |
| `AdvancementView` | EP management UI: add EP, learn new skills, advance known skills |
| `SpellsView` | Spell learning UI: displays learnable spells by type, deducts EP on confirm |
| `RulesView` | Rules management: import rulebook JSON files, enable/disable sources |

---

## Key Constraints

- **No hardcoded rules.** All game rules must come from the JSON files. This makes the app adaptable if rules change.
- **No external backend required.** The app must work without a server for offline use.
- **Offline first.** Every feature must work without a network connection after the initial load.
- **TypeScript strict mode.** All types must be explicit. No `any`.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| File System Access API not supported in all browsers | Low | Low | Firefox/Safari are out of scope — only Chromium-based browsers are supported |
| Midgard M5 rules data is incomplete or incorrect | Medium | High | Flag all data as placeholder until officially verified |
| Cost tables are more complex than the schema assumes | Medium | Medium | Keep cost table schema flexible; review against rulebook early |
| PWA install/offline not working correctly | Low | Medium | Test early with `vite-plugin-pwa` in Phase 5 |
