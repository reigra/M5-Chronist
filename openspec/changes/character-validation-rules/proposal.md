## Why

Der Character-Validator prüft Midgard-M5-Charaktere regelkonform, ohne sie zu mutieren. Heute fehlt diese Prüfung komplett — Fehler in Eigenschaften, Fertigkeiten oder EP-Verbrauch werden erst beim Spielen merklich. Gleichzeitig ist `migrate()` aufgebläht mit Innate-Skill-Logik, die eigentlich ins Regelwerk gehört.

Ziel: Einen Validator bauen, der aus dem Regelwerk selbst weiss, was gültig ist. `autoFix()` ergänzt leise Pflicht-Skills beim Laden. `validate()` zeigt dem User Abweichungen. Die Formeln für Boni, abgeleitete Eigenschaften und Innate-Skills werden als Daten im Regelwerk abgelegt — nicht hartkodiert.

## What Changes

- **Neuer Service `CharacterValidator`** mit `validate(character, rules)` und `autoFix(character, rules)`
- **Neuer Service `CharacterLoadService`** als Orchestrator: `load(id)` lädt Character + Rules, ruft `migrate()` → `autoFix()` → `validate()` in Kette
- **Neue `FormulaEngine`** (Recursive-Descent-Parser) wertet Formel-Strings aus dem Regelwerk aus — inkl. M5-Konvention: Divisionen einzeln abgerundet (`Math.floor` pro `/`)
- **Erweiterung `RulebookData`** um `universalRules.formulas[]` (Bonus-Formeln, Skill-Formeln) und `universalRules.innateSkills[]` (welche Skills obligatorisch sind)
- **Erweiterung `Race`** um `skillBonuses` (rassenspezifische Modifier auf Skills, z.B. Zwerg +1 auf Raufen)
- **Merge-Logik in `RulesStorage.loadActive()`** für `universalRules` per `mergeById`
- **`migrate()` wird entschlackt**: Innate-Skill-Injektion fliegt raus (übernimmt `autoFix`)
- **UI-Integration**: validate-Issues als Banner und Feld-Markierungen in CharacterView, CharacterEditView und Import-Dialog
- **Keine Breaking Changes**: Alte Rulebook-JSONs ohne `universalRules` funktionieren weiter (leere Defaults)

## Capabilities

### New Capabilities

- `character-validation`: Validierungssystem für Charaktere — `ValidationIssue`/`ValidationResult`-Typen, `validate()` mit 7 Prüfkategorien (Struktur, Eigenschaften, Fertigkeiten, Zauber, EP/Gold, Boni, Grad-abhängige Skills), `autoFix()` zum Ergänzen fehlender Pflicht-Skills und Defaults, `FormulaEngine` als Recursive-Descent-Parser für Formel-Strings aus dem Regelwerk
- `rulebook-universal-rules`: Erweiterung des Rulebook-Schemas um `universalRules.formulas[]` (Bonus-Formeln, Skill-Formeln mit `target`, `formula`, `allowsDice`), `universalRules.innateSkills[]` (obligatorische Skills mit `skillId`, `formula`/`formulaId`, `gradValues`, `condition`), und `race.skillBonuses` (rassenspezifische Skill-Modifier). Merge-Logik in `RulesStorage.loadActive()` per `mergeById`

### Modified Capabilities

Keine — dies sind die ersten OpenSpec-Specs des Projekts.

## Impact

- **Neue Dateien:**
  - `src/services/CharacterValidator.ts` — validate() + autoFix()
  - `src/services/CharacterLoadService.ts` — Orchestrator
  - `src/services/FormulaEngine.ts` — Recursive-Descent-Parser
  - `src/types/CharacterValidation.ts` — ValidationIssue, ValidationResult, FixResult, FixDescription
- **Geänderte Dateien:**
  - `src/types/Rules.ts` — RulebookData + Race Interfaces um universalRules/skillBonuses erweitert
  - `src/services/RulesStorage.ts` — Merge-Logik für universalRules
  - `src/services/CharacterService.ts` — migrate() entschlacken (Innate-Skill-Block entfernen)
  - `src/services/CharacterStorage.ts` — ggf. Anpassung der Lade-Pfade (oder entfällt durch CharacterLoadService)
  - `src/views/CharacterView.vue` — validate-Banner + Feld-Markierungen
  - `src/views/CharacterEditView.vue` — validate-Banner + Feld-Markierungen
  - `src/views/HomeView.vue` — Import-Dialog mit validate-Ergebnis
  - `src/services/RulesLoader.ts` — ggf. Anpassung falls nötig
- **Keine neuen Abhängigkeiten** — alles in TypeScript, keine externen Libraries
