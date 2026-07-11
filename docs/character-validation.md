# Character Validation — Plan

Ziel: Einen Character regelkonform prüfen, Abweichungen melden, ohne ihn zu mutieren.
Später: Checks aus `migrate()` rausziehen, UI-Integration.

---

## Übersicht

```
CharacterValidator
├── validate(character, rules) → ValidationResult   (nur Lesen, keine Änderungen)
└── autoFix(character, rules)  → FixResult          (gibt neuen Character zurück, mutiert nicht)
```

- `validate` prüft den Character gegen das geladene Regelwerk.
- `autoFix` ergänzt fehlende Pflicht-Skills und Defaults (non-mutating).
- `migrate()` wird später entschlackt — keine Innate-Skill-Injektion mehr, nur Legacy-Format-Konvertierung.
- Die Regeln für die Prüfung kommen aus `RulesData`. Wo nötig, werden zusätzliche Validierungskonfigurationen in den Rulebook-Schema ergänzt (später).

---

## Schritt 1 — Typendefinition

**Datei:** `src/types/CharacterValidation.ts` (neu)

```typescript
import type { Character } from './Character'

/**
 * Ein einzelnes Validierungs-Problem.
 */
export interface ValidationIssue {
  /** Pfad zum Feld, z.B. "properties.St" oder "skills[raufen].value" */
  path: string
  /** Schweregrad */
  severity: 'error' | 'warning' | 'info'
  /** Maschinenlesbarer Code, z.B. "PROPERTY_OUT_OF_RANGE" */
  code: string
  /** Für den User lesbare Beschreibung (deutsch) */
  message: string
  /** Erwarteter Wert (optional) */
  expected?: unknown
  /** Tatsächlicher Wert (optional) */
  actual?: unknown
}

/**
 * Ergebnis einer vollständigen Validierung.
 */
export interface ValidationResult {
  issues: ValidationIssue[]
  /** true wenn mindestens ein Issue mit severity 'error' existiert */
  hasErrors: boolean
  /** true wenn mindestens ein Issue mit severity 'warning' existiert */
  hasWarnings: boolean
}

/**
 * Beschreibt eine durchgeführte Korrektur (für Logging/Diff).
 */
export interface FixDescription {
  /** Code der Aktion, z.B. "ADD_MISSING_SKILL" */
  action: string
  /** Pfad oder ID, z.B. "Raufen" */
  target: string
  /** Beschreibung, z.B. "Skill 'Raufen' mit FW 3 hinzugefügt" */
  description: string
}

/**
 * Ergebnis einer autoFix-Operation.
 */
export interface FixResult {
  /** Neuer Character (unkodiert) */
  fixed: Character
  /** Liste aller durchgeführten Korrekturen */
  applied: FixDescription[]
}
```

---

## Schritt 2 — CharacterValidator-Service

**Datei:** `src/services/CharacterValidator.ts` (neu)

Zwei exportierte Funktionen + interne Helfer.

### 2.1 `validate(character, rules)`

Führt alle unten stehenden Prüfungen durch. Reihenfolge nach Kategorie:

#### Kategorie A — Struktur & Referenzen (errors)

| Check | Beschreibung | Code |
|-------|-------------|------|
| `raceId` existiert in `rules.races` | `MISSING_RACE` |
| `typeId` existiert in `rules.types` | `MISSING_TYPE` |
| `typeId` in `race.availableTypes` | `TYPE_NOT_ALLOWED_FOR_RACE` |
| Jede `skillId` in `character.skills` existiert in `rules.skills` | `UNKNOWN_SKILL` |
| `originId` existiert in `rules.origins` | `MISSING_ORIGIN` |
| `socialStatusId` existiert in `rules.socialStatuses` | `MISSING_SOCIAL_STATUS` |
| Keine verbotenen Skills (`race.forbiddenSkills`) | `FORBIDDEN_SKILL` |

#### Kategorie B — Eigenschaften (errors)

| Check | Beschreibung | Code |
|-------|-------------|------|
| `St` innerhalb `race.propertyRestrictions.St` | `PROPERTY_OUT_OF_RANGE` |
| `Gs` innerhalb `race.propertyRestrictions.Gs` | `PROPERTY_OUT_OF_RANGE` |
| `Gw` innerhalb `race.propertyRestrictions.Gw` | `PROPERTY_OUT_OF_RANGE` |
| `Ko` innerhalb `race.propertyRestrictions.Ko` | `PROPERTY_OUT_OF_RANGE` |
| `In` innerhalb `race.propertyRestrictions.In` | `PROPERTY_OUT_OF_RANGE` |
| `Zt` innerhalb `race.propertyRestrictions.Zt` | `PROPERTY_OUT_OF_RANGE` |
| `Au` innerhalb `race.derivedRestrictions.Au` | `DERIVED_OUT_OF_RANGE` |

#### Kategorie C — Fertigkeiten (warnings + errors)

| Check | Beschreibung | Code |
|-------|-------------|------|
| Skill-Wert < `skill.baseValue` | `SKILL_BELOW_BASE` |
| Skill-Wert > `skill.maxValue` | `SKILL_ABOVE_MAX` |
| Universelle Basis-Skills fehlen (siehe 2.3) | `MISSING_INNATE_SKILL` (warning) |
| Angeborene Skills aus `race.skills` fehlen | `MISSING_RACIAL_SKILL` (warning) |
| Skill mit `baseSkillId` ohne Basis-Skill | `MISSING_BASE_SKILL` |
| PP auf Skill obwohl keiner im Regelsystem | `UNEXPECTED_PP` (info) |

#### Kategorie D — Zauber (warnings)

| Check | Code |
|-------|------|
| Zauber vorhanden, aber Typ hat keine `spellCosts` | `SPELLS_WITHOUT_CASTER_TYPE` |
| `spellId` existiert in `rules.spells` | `UNKNOWN_SPELL` |

#### Kategorie E — EP/Gold (warnings)

| Check | Code |
|-------|------|
| `availableEp > totalEs` | `EP_EXCEEDS_ES` |
| Gold negativ | `NEGATIVE_GOLD` |

#### Kategorie F — Boni (info, später ausbaufähig)

| Check | Code |
|-------|------|
| Boni-Werte auffällig (z.B. alle 0) | `BONUS_VALUE_SUSPICIOUS` |

### 2.2 `autoFix(character, rules)`

Erzeugt einen neuen Character (via Spread/Map), bei dem folgende Korrekturen
nur dann angewendet werden, wenn das Ziel **nicht existiert oder undefined** ist:

| Korrektur | Bedingung | Beschreibung |
|-----------|-----------|-------------|
| Skill `Raufen` hinzufügen | fehlt | FW = `(St+Gw)/20 + AnB`, +1 falls `raceId === 'zwerg'` |
| Skill `Trinken` hinzufügen | fehlt | FW = `Ko/10` |
| Skill `Wahrnehmung` hinzufügen | fehlt | FW = 6 |
| Skills `Hören`, `Nachtsicht`, `Riechen`, `Sechster Sinn`, `Sehen` | fehlen | FW = 0 (gestapelt auf Wahrnehmung) |
| Skill `Abwehr` hinzufügen | fehlt | FW = 11 |
| Skill `Resistenz` hinzufügen | fehlt | FW = 11 |
| Skill `Zaubern` hinzufügen | fehlt + `spells` nicht leer | FW = 11 |
| `pp: 0` auf Skills ohne `pp` | `s.pp === undefined` | |
| `pp: 0` auf Zauber ohne `pp` | `s.pp === undefined` | |
| String-Zauber in `CharacterSpell` konvertieren | `typeof s === 'string'` | `{ spellId: s, pp: 0 }` |

**Wichtig:** Ändert niemals vorhandene Werte — nur ergänzen.
Ziel: Nach `migrate()` gelaufene `autoFix()` liefert immer einen vollständigen Character.

### 2.3 Universelle Basis-Skills

Derzeit hartkodiert. Später aus Regelwerk (geplantes Feld `innateSkills` in `RulebookData`):

```typescript
// Zukünftiges Format (noch nicht implementiert)
interface InnateSkillRule {
  skillId: string
  formula?: string   // z.B. "(St+Gw)/20 + AnB"
  condition?: string // z.B. "raceId === 'zwerg'"
  defaultFw: number
  stacked?: boolean
  baseSkillId?: string
}
```

Aktuell hartkodierte Liste:

| Skill-ID | FW | Bedingung |
|----------|----|-----------|
| `Raufen` | `Math.max(0, (St+Gw)/20 + AnB + (raceId === 'zwerg' ? 1 : 0))` | immer |
| `Trinken` | `Math.max(0, Ko/10)` | immer |
| `Wahrnehmung` | `6` | immer |
| `Hören` | `0` | immer (gestapelt) |
| `Nachtsicht` | `0` | immer (gestapelt) |
| `Riechen` | `0` | immer (gestapelt) |
| `Sechster Sinn` | `0` | immer (gestapelt) |
| `Sehen` | `0` | immer (gestapelt) |
| `Abwehr` | `11` | immer |
| `Resistenz` | `11` | immer |
| `Zaubern` | `11` | nur wenn `spells.length > 0` |

---

## Schritt 3 — `migrate()` entschlacken

**Datei:** `src/services/CharacterService.ts`

**Vorher:** Legacy-Format + Innate-Skills + PP/Spell-Defaults
**Nachher:** Nur Legacy-Format (baseProperties → properties) + PP/Spell-Defaults

Entfernt werden:

- Zeilen 182–227 (Innate-Skill-Block: Raufen, Trinken, Wahrnehmung, Hören, Nachtsicht, Riechen, Sechster Sinn, Sehen, Abwehr, Resistenz, Zaubern)
- Die Funktion heisst weiterhin `migrate()` und hat dieselbe Signatur.

**Achtung:** Aufrufer, die auf die Innate-Skill-Injektion angewiesen sind, müssen stattdessen `autoFix()` aufrufen.

---

## Schritt 4 — CharacterStorage anpassen

**Datei:** `src/services/CharacterStorage.ts`

In allen Lade-Pfaden (`load`, `readFromFile`, `importFromFile`, `readFromDrive`) nach `migrate()` auch `autoFix()` aufrufen:

```typescript
// Vorher
resolve(migrate(raw) as Character)

// Nachher
const migrated = migrate(raw)
const { fixed } = autoFix(migrated, rules)  // rules müssen geladen sein
resolve(fixed)
```

**Problem:** `CharacterStorage` hat derzeit keinen Zugriff auf `RulesData`.
Lösungsvarianten:

| Variante | Beschreibung | |
|----------|-------------|---|
| A | `load()` bekommt optionalen `rules`-Parameter | Einfach, aber API-Änderung an allen Aufrufern |
| B | `storage` lädt RulesData selbst (via `RulesStorage.loadActive()`) | Kopplung, async |
| C | `autoFix` wird erst in den Views/der Import-Logik aufgerufen, nicht in `storage` | Schlanker Storage, aber Aufrufer müssen dran denken |

**Entscheidung:** Noch offen. Für Phase 1 (erstmal nur `validate` + `autoFix` bauen) ist das egal.
Für Phase 2 (migrate entschlacken) muss eine Entscheidung her.

---

## Schritt 5 — UI-Integration (später)

### 5.1 CharacterEditView

- Nach `buildCharacter()` Validierung laufen lassen
- Issues unter den entsprechenden Formularfeldern anzeigen
- Roter Rand / Icon bei Fehlern
- Gelbes Warn-Dreieck bei Warnings
- Zusammenfassung als Banner oben (z.B. "3 Fehler, 2 Warnungen")

### 5.2 CharacterSheetView / CharacterView

- `onMounted` Validierung laufen lassen
- Skill-Liste: Icons bei Skills außerhalb erlaubter Range
- Eigenschaften: Icons bei Werten außerhalb der Rassen-Restriktion
- Banner: "Dieser Character hat X Abweichungen vom Regelwerk"

### 5.3 Import-Dialog (HomeView)

- Nach dem Parsen der JSON-Datei: `validate()` + Ergebnis im Diff-Dialog anzeigen
- Auto-Fix als Option anbieten: "Fehlende Skills ergänzen"

---

## Abhängigkeiten

| Schritt | Blockiert durch | Liefert |
|---------|---------------|---------|
| 1 – Typen | nichts | Grundlage für Schritt 2 |
| 2 – Validator | Schritt 1 | `validate()` + `autoFix()` |
| 3 – migrate ändern | Schritt 2 (autoFix muss existieren) | Schlankeres migrate |
| 4 – Storage anpassen | Schritt 3 | Durchgängige autoFix-Kette |
| 5 – UI | Schritt 2 | Sichtbare Validierung für User |

---

## Ausbaustufen (später)

1. **Regelwerk-Integration:** `innateSkills[]` und `validationRules[]` in `RulebookData` definieren
2. **Bonus-Prüfung:** Formeln für Boni (AusB, SchB, AnB, AbB, ZauB, ResBg, ResBk) im Regelwerk definieren und gegen die Ist-Werte prüfen
3. **Live-Validierung:** Während der Eingabe im Edit-Formular Felder einzeln validieren (on blur / on input)
