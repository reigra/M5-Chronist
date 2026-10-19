# Regelwerk: Universal Rules

> Archivierter Stand (OpenSpec, 2026). Maßgeblich ist der Code in `src/services/RulesStorage.ts`, `src/services/CharacterValidator.ts`, `src/types/Rules.ts`.

## Purpose

Defines the schema extensions to `RulebookData` for universal rules, including formulas and innate
skills that apply across all characters, as well as race-specific skill bonuses.

## Requirements

### UniversalRules-Schema in RulebookData

`RulebookData` SHALL ein optionales Feld `universalRules` erhalten mit folgender Struktur:

```typescript
interface RulebookData {
  // ... bestehende Felder
  universalRules?: UniversalRules
}

interface UniversalRules {
  formulas: UniversalFormula[]
  innateSkills: InnateSkill[]
}
```

Das Feld SHALL optional sein — Regelwerk-JSONs ohne `universalRules` bleiben gültig (Rückwärtskompatibilität).

#### Regelwerk ohne universalRules

- **WHEN** ein Rulebook-JSON kein `universalRules`-Feld enthält
- **THEN** `loadActive()` merged das Feld nicht, autoFix und validate arbeiten mit leeren Default-Arrays

#### Regelwerk mit universalRules

- **WHEN** ein Rulebook-JSON `universalRules` mit `formulas[]` und `innateSkills[]` enthält
- **THEN** die Arrays werden via `mergeById` in das gemergte RulesData übernommen

### UniversalFormula-Schema

Ein `UniversalFormula`-Eintrag SHALL folgende Felder haben:

```typescript
interface UniversalFormula {
  /** Eindeutige ID (z.B. "AnB", "raufen", "lp-formel") */
  id: string
  /** Formel-String in der definierten Formelsprache */
  formula: string
  /** Ob Würfel-Notation (W) in der Formel vorkommen darf */
  allowsDice: boolean
  /** Optionale Beschreibung (UI/Debug) */
  description?: string
}
```

Die `id` SHALL als Merge-Key dienen (first-wins pro id).

#### Formel mit ID definieren

- **WHEN** ein Rulebook-JSON `{ id: "AnB", formula: "bonus(Gs)", allowsDice: false }` enthält
- **THEN** der Eintrag wird mit `id: "AnB"` in das gemergte `formulas[]`-Array übernommen

#### House-Rule überschreibt einzelne Formel

- **WHEN** eine House-Rule `{ id: "AnB", formula: "bonus(Gs)+1", allowsDice: false }` definiert und höhere Priority hat als die Core-Quelle
- **THEN** im gemergten Ergebnis wird `formulas["AnB"]` die Formel `"bonus(Gs)+1"` haben

### InnateSkill-Schema

Ein `InnateSkill`-Eintrag SHALL folgende Felder haben:

```typescript
interface InnateSkill {
  /** Skill-ID (z.B. "Raufen", "Abwehr") — dient auch als Merge-Key */
  id: string
  /** Optionale direkte Formel für den FW (z.B. "Ko/10") */
  formula?: string
  /** Referenz auf eine formula.id (z.B. "raufen") */
  formulaId?: string
  /** Wenn true: FW kommt aus Skill.gradValues[]-Tabelle */
  gradValues?: boolean
  /** Fallback-FW wenn keine Formel/gradValues */
  defaultFw: number
  /** Optional: gestapelt auf einen Basis-Skill (z.B. Hören → Wahrnehmung) */
  stacked?: boolean
  /** Optional: Basis-Skill-ID für gestapelte Skills */
  baseSkillId?: string
  /** Optional: Bedingung für das Anlegen des Skills */
  condition?: 'hasSpells' | string
}
```

Die FW-Berechnung folgt dieser Priorität:
1. `formula` → FormulaEngine.evaluate()
2. `formulaId` → Lookup in `formulas[]` → FormulaEngine.evaluate()
3. `gradValues` → lookupGradValue(skill, grad) aus `Skill.gradValues[]`
4. `defaultFw` → einfacher Zahlenwert

#### InnateSkill mit direkter Formel

- **WHEN** ein InnateSkill `{ id: "Trinken", formulaId: "trinken", defaultFw: 0 }` definiert ist
- **THEN** autoFix() berechnet den FW via FormulaEngine: `evaluate("Ko/10", ctx)`

#### InnateSkill mit formulaId

- **WHEN** ein InnateSkill `{ id: "Raufen", formulaId: "raufen", defaultFw: 0 }` definiert ist und `formulas` einen Eintrag `{ id: "raufen", formula: "(St+Gw)/20 + AnB" }` enthält
- **THEN** autoFix() lookup't die Formel und evaluiert sie

#### InnateSkill mit gradValues

- **WHEN** ein InnateSkill `{ id: "Abwehr", gradValues: true, defaultFw: 11 }` definiert ist
- **THEN** autoFix() verwendet `lookupGradValue(skill, grad)` für den FW

#### InnateSkill mit defaultFw

- **WHEN** ein InnateSkill `{ id: "Wahrnehmung", defaultFw: 6 }` definiert ist
- **THEN** autoFix() setzt den FW direkt auf 6

#### InnateSkill mit condition hasSpells

- **WHEN** ein InnateSkill `{ id: "Zaubern", gradValues: true, defaultFw: 11, condition: "hasSpells" }` definiert ist
- **THEN** autoFix() legt den Skill nur an, wenn `character.spells.length > 0`

#### Gestapelter InnateSkill

- **WHEN** ein InnateSkill `{ id: "Hören", defaultFw: 0, stacked: true, baseSkillId: "Wahrnehmung" }` definiert ist
- **THEN** autoFix() legt den Skill mit FW 0 an und markiert ihn als gestapelt auf Wahrnehmung

### race.skillBonuses

Das `Race`-Interface SHALL ein optionales Feld `skillBonuses?: Record<string, number>` erhalten.

```typescript
// Erweiterung des bestehenden Race-Interface
interface Race {
  // ... bestehende Felder
  /** Rassenspezifische Skill-Modifier, z.B. { "Raufen": 1 } für Zwerg */
  skillBonuses?: Record<string, number>
}
```

Der Merge für `race` (via mergeById) SHALL bestehende Race-Einträge um `skillBonuses` ergänzen können — ein House-Rule-Race kann neue skillBonuses hinzufügen oder bestehende überschreiben.

#### Rasse mit skillBonuses definieren

- **WHEN** eine Race `{ id: "zwerg", name: "Zwerg", skillBonuses: { "Raufen": 1 } }` definiert
- **THEN** `race.skillBonuses` enthält `{ "Raufen": 1 }`

#### autoFix berücksichtigt skillBonuses

- **WHEN** ein Zwerg-Character über autoFix läuft und Raufen angelegt wird
- **THEN** zum berechneten FW wird `race.skillBonuses["Raufen"]` (1) addiert

### Merge-Logik in RulesStorage.loadActive()

`RulesStorage.loadActive()` SHALL um die Merge-Logik für `universalRules` erweitert werden:

```typescript
// Initialisierung
rules.universalRules = { formulas: [], innateSkills: [] }

// Merge pro Quelle (nach bestehendem Muster)
for (const entry of active) {
  const u = entry.data.universalRules
  if (u?.formulas)     this.mergeById(rules.universalRules.formulas, u.formulas)
  if (u?.innateSkills) this.mergeById(rules.universalRules.innateSkills, u.innateSkills)
}
```

Die Merge-Reihenfolge ist identisch mit den existierenden Arrays: Hausregeln zuerst (höchste Priority = first-wins).

#### Zwei Quellen mit unterschiedlichen Formeln

- **WHEN** Core-Quelle `{ id: "AnB", formula: "bonus(Gs)" }` und House-Rule `{ id: "raufen", formula: "(St+Gw)/20 + AnB" }` definiert
- **THEN** das gemergte `formulas[]` enthält beide Einträge

#### House-Rule überschreibt Core-Formel

- **WHEN** Core-Quelle `{ id: "AnB", formula: "bonus(Gs)" }` und House-Rule `{ id: "AnB", formula: "bonus(Gs)+1" }` definiert (House hat höhere Priority)
- **THEN** das gemergte Ergebnis hat `formula: "bonus(Gs)+1"` für id "AnB"

#### Keine Quelle hat universalRules

- **WHEN** keine aktive Quelle `universalRules` definiert
- **THEN** die Default-Initialisierung bleibt: `{ formulas: [], innateSkills: [] }`


