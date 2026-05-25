# MagusM5 — App Description

## Purpose

MagusM5 is a Progressive Web App (PWA) for creating and advancing RPG characters in the **Midgard M5** tabletop role-playing system. The app targets desktop browsers and can be installed as a PWA for offline use.

---

## Goals

- Allow users to create new Midgard M5 characters step by step.
- Allow users to manage and advance existing characters.
- Support offline usage after the first load.
- Store characters as local files (no cloud account required).
- Read all game rules (skills, costs, races, types) from local JSON data files.

---

## Architecture Overview

The app is divided into three layers:

```
┌──────────────────────────────────────────────┐
│                  Frontend (UI)                │
│   Vue 3 + Vite + TypeScript                  │
│   - Character creation wizard                │
│   - Character sheet view                     │
│   - Skill management                         │
└─────────────────┬────────────────────────────┘
                  │ HTTP / local calls
┌─────────────────▼────────────────────────────┐
│               Middleware (API)                │
│   TypeScript service layer                   │
│   - Business logic                           │
│   - Validation                               │
│   - Character & rules data access            │
└─────────────────┬────────────────────────────┘
                  │ File I/O
┌─────────────────▼────────────────────────────┐
│                 Backend                       │
│   Node.js server OR browser File System API  │
│   - Read rules from JSON files               │
│   - Read / write character files             │
└──────────────────────────────────────────────┘
```

> **Note:** The exact backend technology is not yet decided. See `development-plan.md` for the options and trade-offs.

---

## Modules

### 1. Character Creator
- Step-by-step wizard for creating a new character.
- Steps: Race → Type → Origin → Social Status → Base Properties → Derived Properties → Starting Skills.
- Validates all inputs against the rules.
- Writes the finished character to a JSON file.

### 2. Character Sheet
- Read-only view of a character's current state.
- Shows all base and derived properties, skills, and metadata.
- Allows loading an existing character from a file.

### 3. Character Advancement
- Allows advancing an existing character between adventures.
- Skill learning and improvement (cost validation against rules).
- Tracks experience points (EP) and spending.

### 4. Rules Data Browser *(optional, later)*
- Read-only view of loaded rules data.
- Useful for looking up skill costs, who can learn what, etc.

### 5. File Manager
- Save a character to a local JSON file.
- Load a character from a local JSON file.
- Used by the Creator and Advancement modules.

---

## Data Flow

```
Rules JSON files  →  Backend  →  Middleware  →  Frontend
Character JSON files ←→ Backend ←→ Middleware ←→ Frontend
```

- Rules data is **read-only** and loaded at startup.
- Character data is **read/write** — created and modified by the user.

---

## Offline Strategy *(to be decided)*

Two options are being evaluated:

| Option | Description |
|--------|-------------|
| **Service Worker + Cache** | Standard PWA approach. App shell and rules data are cached. Characters stored via File System Access API or IndexedDB. |
| **IndexedDB** | Characters are stored in the browser's built-in database. Rules data is bundled with the app. |

See `development-plan.md` for the full analysis.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vue 3, Vite, TypeScript |
| Middleware | TypeScript (service/logic layer) |
| Backend | To be decided (see `development-plan.md`) |
| Data format | JSON |
| PWA | Service Worker, Web App Manifest |

---

## Non-Goals (for now)

- No user accounts or cloud sync.
- No multiplayer or game master tools.
- No dice roller.
- No combat tracker.

These features may be added in later phases.
