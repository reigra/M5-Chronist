# MagusM5 — Data Schema

This document defines the JSON data structures for both **rules data files** (read-only) and **character save files** (read/write).

All files use UTF-8 encoding and the `.json` file extension.

---

## File Structure Overview

Rules data is organized by source book, not by data type (see [Decision 3 in development-plan.md](development-plan.md)). Each rulebook is a single JSON file. A manifest file lists all available sources.

```
data/
├── sources.json               ← Rulebook manifest
├── sources/
│   ├── arkanum.json           ← Core: spells + descriptions
│   ├── kodex.json             ← Core: skills, types, races, origins, statuses
│   ├── mysterium.json         ← Extension: new spells, skills, types
│   └── dunkle-maechte.json    ← Extension: dark magic content
└── characters/
    └── <character-name>.json  ← One file per character
```

Each source file follows this top-level shape — only the sections present in that book are included:

```json
{
  "spells": [...],
  "spellDescriptions": [...],
  "skills": [...],
  "types": [...],
  "races": [...],
  "origins": [...],
  "socialStatuses": [...]
}
```

The schemas below define the structure of each section. They apply regardless of which source file the data lives in.

---

## Rules Data Schemas

### `sources.json` — Rulebook Manifest

Lists all available source books. Loaded once at app startup to build the source selection UI.

```json
{
  "sources": [
    {
      "id": "arkanum",
      "title": "Das Arkanum",
      "version": "1402",
      "isCore": true,
      "file": "sources/arkanum.json"
    },
    {
      "id": "kodex",
      "title": "Der Kodex",
      "version": "1402",
      "isCore": true,
      "file": "sources/kodex.json"
    },
    {
      "id": "mysterium",
      "title": "Das Mysterium",
      "version": "1702",
      "isCore": false,
      "file": "sources/mysterium.json"
    },
    {
      "id": "dunkle-maechte",
      "title": "Dunkle Mächte",
      "version": "1",
      "isCore": false,
      "file": "sources/dunkle-maechte.json"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier, used as key in user settings |
| `title` | `string` | Display name shown in the UI |
| `version` | `string` | Edition or print year, for display only |
| `isCore` | `boolean` | `true` = cannot be deactivated by the user |
| `file` | `string` | Path to the source JSON file, relative to `data/` |

---

### `races.json`

Defines all available races and their effects on base properties.

```json
{
  "races": [
    {
      "id": "human",
      "name": "Mensch",
      "description": "The most common race. No restrictions on type selection.",
      "propertyModifiers": {
        "St": 0,
        "Gs": 0,
        "Gw": 0,
        "Ko": 0,
        "In": 0,
        "Zt": 0
      },
      "baseMovement": 10,
      "availableTypes": ["warrior", "ranger", "thief", "merchant", "sorcerer", "wizard", "healer", "bard", "priest", "knight", "assassin", "scout"],
      "startingLanguages": ["common"],
      "specialAbilities": []
    },
    {
      "id": "dwarf",
      "name": "Zwerg",
      "description": "Sturdy and strong, but less agile.",
      "propertyModifiers": {
        "St": 2,
        "Gs": -1,
        "Gw": 0,
        "Ko": 2,
        "In": 0,
        "Zt": -2
      },
      "baseMovement": 8,
      "availableTypes": ["warrior", "thief", "merchant", "healer", "knight"],
      "startingLanguages": ["common", "dwarvish"],
      "specialAbilities": ["darkvision", "stone_sense"]
    }
  ]
}
```

**Field Reference:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier (used in character files and references) |
| `name` | `string` | Display name |
| `description` | `string` | Human-readable description |
| `propertyModifiers` | `object` | Adjustments applied to base properties during character creation |
| `baseMovement` | `number` | Base movement range in meters |
| `availableTypes` | `string[]` | List of type IDs this race can choose |
| `startingLanguages` | `string[]` | Languages the character knows at creation |
| `specialAbilities` | `string[]` | IDs of special racial abilities |

---

### `types.json`

Defines all character types and their EP costs per Trainingseinheit (TE) for each skill group.

The ID uses the official Midgard abbreviation (e.g., `Kr` for Krieger, `Hä` for Händler, `Dr` for Druide).

```json
{
  "types": [
    {
      "id": "Kr",
      "name": "Krieger",
      "category": "Kämpfer",
      "groupCosts": {
        "Alltag": 3,
        "Freil.": 3,
        "Halbw.": 5,
        "Kampf": 2,
        "Körper": 3,
        "Sozial": 5,
        "Unterw.": 6,
        "Waffen": 2,
        "Wissen": 5
      }
    }
  ]
}
```

> **Note:** All `groupCosts` values are placeholders and must be replaced with the official Midgard M5 cost tables.

**Field Reference:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Official Midgard type abbreviation (e.g., `Kr`, `Hä`, `Dr`) |
| `name` | `string` | Full display name |
| `category` | `string` | Type category: `"Kämpfer"`, `"KampfZauberer"`, or `"Zauberer"`. Used for derived property calculations. |
| `groupCosts` | `object` | EP cost of one TE for each skill group. LE cost = 3 × TE cost (fixed rule). |
| `spellCosts` | `object` | EP cost per spell group. Only present for types with `category` `"Zauberer"` or `"KampfZauberer"`. Groups with `-` in the rulebook are omitted entirely. Spell groups: `Beherr.`, `Beweg.`, `Erkenn.`, `Erschaff.`, `Formen`, `Veränd.`, `Zerstören`, `Wunder`, `Dweom.`, `Lied`. |

**Skill Groups:**

| ID | Full Name |
|----|-----------|
| `Alltag` | Alltagsfertigkeiten |
| `Freil.` | Freilandfertigkeiten |
| `Halbw.` | Halbweltfertigkeiten |
| `Kampf` | Kampffertigkeiten |
| `Körper` | Körperbeherrschungsfertigkeiten |
| `Sozial` | Soziale Fertigkeiten |
| `Unterw.` | Unterweltfertigkeiten |
| `Waffen` | Waffenfertigkeiten |
| `Wissen` | Wissensfertigkeiten |

---

### `origins.json`

Defines character origins (backgrounds).

```json
{
  "origins": [
    {
      "id": "city",
      "name": "Stadt",
      "description": "Grew up in a large city. Good knowledge of urban life.",
      "startingSkills": ["streetwise", "haggling"],
      "availableSocialStatuses": ["serf", "free_citizen", "craftsman", "merchant_class"],
      "propertyModifiers": {}
    },
    {
      "id": "wilderness",
      "name": "Wildnis",
      "description": "Grew up far from civilization.",
      "startingSkills": ["survival", "tracking"],
      "availableSocialStatuses": ["free_citizen", "outcast"],
      "propertyModifiers": {}
    }
  ]
}
```

---

### `social-statuses.json`

Defines social standings and their starting resources.

```json
{
  "socialStatuses": [
    {
      "id": "serf",
      "name": "Leibeigener",
      "description": "Bound to land or a lord. Few rights, little money.",
      "startingGold": 5,
      "startingEquipmentPool": "poor"
    },
    {
      "id": "free_citizen",
      "name": "Freier Bürger",
      "description": "A free person with basic rights.",
      "startingGold": 30,
      "startingEquipmentPool": "common"
    }
  ]
}
```

---

### `skills.json`

Defines all available skills with metadata, learning costs, and advancement costs.

The ID uses the official skill name from the rulebook (e.g., `Reiten`, `Gassenwissen`, `Bootfahren`).

```json
{
  "skills": [
    {
      "id": "Reiten",
      "name": "Reiten",
      "groups": ["Alltag", "Kampf"],
      "difficulty": { "Alltag": "leicht", "Kampf": "leicht" },
      "learnCost": 1,
      "advancementCosts": [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5],
      "baseValue": 6,
      "maxValue": 20,
      "linkedProperty": "Gs",
      "notes": ""
    },
    {
      "id": "Gassenwissen",
      "name": "Gassenwissen",
      "groups": ["Halbw.", "Unterw.", "Sozial"],
      "difficulty": { "Halbw.": "schwer", "Unterw.": "schwer", "Sozial": "schwer" },
      "learnCost": 2,
      "advancementCosts": [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5],
      "baseValue": 4,
      "maxValue": 18,
      "linkedProperty": "In",
      "notes": ""
    }
  ]
}
```

> **Note:** All `learnCost`, `advancementCosts`, and `baseValue` values are placeholders and must be replaced with the official Midgard M5 data.

**`advancementCosts` array:**

The array starts at the skill's `baseValue`. Index 0 is the cost to advance from `baseValue` to `baseValue + 1`, index 1 from `baseValue + 1` to `baseValue + 2`, and so on up to `maxValue - 1`. The array length equals `maxValue - baseValue`.

Example: if `baseValue` is 4 and the rulebook says advancing Reiten from FW 14 to FW 15 costs 5 TE, then `advancementCosts[10] = 5` (because 14 - 4 = 10).

**EP Cost Calculation:**

| Action | Formula |
|--------|----------|
| Learn a skill | `learnCost × 3 × type.groupCosts[chosenGroup]` |
| Advance FW N → N+1 | `advancementCosts[N] × type.groupCosts[chosenGroup]` |

The factor of 3 (1 LE = 3 × TE cost in EP) is a fixed game rule, not stored in the data.

**Field Reference:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Official skill name from the rulebook (e.g., `Reiten`) |
| `name` | `string` | Display name |
| `groups` | `string[]` | Skill groups this skill belongs to. Determines EP cost via the character's type. |
| `difficulty` | `object` | Rulebook reference only — not used for calculations. Maps each group to its difficulty label (`"leicht"`, `"normal"`, `"schwer"`, `"sehr schwer"`). A skill can have different labels in different groups (e.g., `{ "Halbw.": "normal", "Körper": "schwer" }`). |
| `learnCost` | `number \| null` | Number of LE required to learn this skill. `null` for the `Zaubersprüche` special entry. Same regardless of chosen group. |
| `advancementCosts` | `number[] \| null` | TE required per advancement step, starting at `baseValue`. Index 0 = cost to go from `baseValue` to `baseValue + 1`. Length = `maxValue - baseValue`. `null` for the `Zaubersprüche` special entry. Same regardless of chosen group. |
| `spellLevelCosts` | `number[] \| null` | Only present on the `Zaubersprüche` special entry. 12 values — index 0 = LE to learn a spell of Stufe 1, index 11 = Stufe 12. EP cost = `spellLevelCosts[stufe-1] × type.spellCosts[chosenSpellGroup]`. `null` for all regular skills. |
| `baseValue` | `number \| null` | Starting FW when the skill is first learned. `null` for `Zaubersprüche`. |
| `maxValue` | `number \| null` | Maximum possible FW. `null` for `Zaubersprüche`. |
| `linkedProperty` | `string \| null` | Base property used for skill checks. `null` for `Zaubersprüche`. |
| `notes` | `string` | Optional rule notes |

---

### `spells.json`

Contains all spells with core metadata. Split from full descriptions to keep the file lean for display in lists and on character sheets.

The `id` uses the official spell name from the rulebook.

```json
{
  "spells": [
    {
      "id": "Laufen wie der Wind",
      "name": "Laufen wie der Wind",
      "level": 5,
      "spellType": "Gestenzauber",
      "spellGroup": "Veränd.",
      "elements": ["Holz", "Erde"],
      "material": null,
      "apCost": "3",
      "castingTime": "10 sec",
      "range": "-",
      "targetType": "Körper",
      "effectArea": "Zauberer",
      "duration": "10 min",
      "origin": "druidisch",
      "shortDescription": "Der Zauberer läuft bis zu 10 min lang mit vierfacher Geschwindigkeit.",
      "source": "Arkanum S. 142"
    }
  ]
}
```

**Field Reference:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Official spell name from the rulebook |
| `name` | `string` | Display name |
| `level` | `number` | Spell level (Stufe), 1–12 |
| `spellType` | `string` | `"Gestenzauber"` \| `"Wortzauber"` \| `"Gedankenzauber"` |
| `spellGroup` | `string` | Spell group — matches key in `type.spellCosts` (e.g., `"Veränd."`) |
| `elements` | `[string, string]` | Always exactly 2 elements |
| `material` | `string \| null` | Required material component. `null` if none. |
| `apCost` | `string` | AP cost. String because values like `"1 je Wesen"` are possible. |
| `castingTime` | `string` | e.g., `"10 sec"`, `"1 min"` |
| `range` | `string` | e.g., `"-"`, `"Berührung"`, `"20 m"` |
| `targetType` | `string` | e.g., `"Körper"`, `"Umgebung"` |
| `effectArea` | `string` | e.g., `"Zauberer"`, `"bis zu 6 Wesen"` |
| `duration` | `string` | e.g., `"10 min"`, `"0"` |
| `origin` | `string` | e.g., `"druidisch"`, `"arkane Magie"` |
| `shortDescription` | `string` | 1–2 sentence summary for character sheets |
| `source` | `string` | Rulebook reference, e.g., `"Arkanum S. 142"` |

---

### `spell-descriptions.json`

Contains the full rulebook description texts for each spell, keyed by `spellId`. Kept separate to allow loading on demand (e.g., when the user clicks on a spell for details).

```json
{
  "spellDescriptions": [
    {
      "spellId": "Laufen wie der Wind",
      "description": "Der Zauberer läuft bis zu 10 min lang rasend (mit dem Vierfachen seiner normalen Geschwindigkeit) dahin. Er kann weder kämpfen noch zaubern, solange dieser Zauber wirkt."
    }
  ]
}
```

**Field Reference:**

| Field | Type | Description |
|-------|------|-------------|
| `spellId` | `string` | Must match a `spell.id` in `spells.json` |
| `description` | `string` | Full rulebook description text |

---

## Character Save File Schema

### `characters/<name>.json`

One file per character. This is the complete saved state of a character.

```json
{
  "version": "1.0",
  "meta": {
    "id": "c1f3d8a2-...",
    "name": "Aldric von Tannwald",
    "playerName": "Max Mustermann",
    "createdAt": "2026-05-22T10:00:00Z",
    "lastModifiedAt": "2026-05-22T12:00:00Z"
  },
  "raceId": "human",
  "typeId": "warrior",
  "originId": "city",
  "socialStatusId": "free_citizen",
  "experiencePoints": {
    "total": 500,
    "spent": 380,
    "available": 120
  },
  "baseProperties": {
    "St": 16,
    "Gs": 12,
    "Gw": 11,
    "Ko": 14,
    "In": 10,
    "Zt": 5
  },
  "secondaryProperties": {
    "pA": 9,
    "Wk": 11,
    "Au": 9,
    "AusB": 2,
    "LP": 35,
    "AP": 20,
    "SchB": 1,
    "B": 10,
    "AnB": 3,
    "AbB": 2,
    "ZauB": 0,
    "ResB": 1
  },
  "skills": [
    {
      "skillId": "Reiten",
      "level": 12,
      "chosenGroup": "Alltag",
      "learnedAt": "2026-05-22T10:00:00Z"
    },
    {
      "skillId": "Gassenwissen",
      "level": 8,
      "chosenGroup": "Sozial",
      "learnedAt": "2026-05-22T10:00:00Z"
    }
  ],
  "languages": ["common"],
  "notes": "Optional freetext notes by the player."
}
```

**Field Reference:**

| Field | Type | Description |
|-------|------|-------------|
| `version` | `string` | Schema version — used for future migration |
| `meta.id` | `string` | UUID — unique character identifier |
| `meta.name` | `string` | Character name |
| `meta.playerName` | `string` | Name of the player |
| `raceId` | `string` | References a race in `races.json` |
| `typeId` | `string` | References a type in `types.json` (abbreviation, e.g., `Kr`) |
| `originId` | `string` | References an origin in `origins.json` |
| `socialStatusId` | `string` | References a status in `social-statuses.json` |
| `experiencePoints` | `object` | Tracks total, spent, and available EP |
| `baseProperties` | `object` | The 6 base property values after race modifiers (`St`, `Gs`, `Gw`, `Ko`, `In`, `Zt`) |
| `secondaryProperties` | `object` | Secondary/derived values (`pA`, `Wk`, `Au`, `AusB`, `LP`, `AP`, `SchB`, `B`, `AnB`, `AbB`, `ZauB`, `ResB`) — recalculated on load |
| `skills` | `array` | List of known skills. Each entry: `skillId` (rulebook name), `level` (current FW), `chosenGroup` (group used for EP cost), `learnedAt` |
| `languages` | `string[]` | Known languages |
| `notes` | `string` | Optional freetext field |

---

## Versioning

The `version` field in character files allows for future schema migrations. When the app reads a character file, it checks this version and applies any necessary upgrade logic before use.

Current version: `"1.0"`
