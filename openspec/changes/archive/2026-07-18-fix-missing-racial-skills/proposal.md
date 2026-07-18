## Why

`autoFix()` ergänzt beim Laden des Charakters fehlende Skills aus `rules.universalRules.innateSkills[]`, ignoriert aber `race.skills[]` (rassenspezifische Start-Fertigkeiten wie "Bergbau" für Zwerge). `validate()` meldet diese als `MISSING_RACIAL_SKILL`, aber `autoFix()` behebt sie nicht — weder beim Laden noch über den "Automatisch reparieren"-Button, der `correctIssues()` aufruft.

## What Changes

- `CharacterValidator.autoFix()` SHALL nach der innateSkills-Schleife auch fehlende Einträge aus `race.skills[]` ergänzen
- FW-Berechnung: `race.skills[].value` als Startwert, ggf. + `race.skillBonuses[id]`
- `autoFix()` bleibt immutable (gibt neuen Character zurück)
- Die Spec `character-validation` wird aktualisiert: `autoFix()`-Requirement um race.skills ergänzt

## Capabilities

### New Capabilities

- *(none)*

### Modified Capabilities

- `character-validation`: Requirement `autoFix() — Pflicht-Skills ergänzen` um race.skills erweitert

## Impact

- **Geändert:** `src/services/CharacterValidator.ts` — `autoFix()` um race.skills-Schleife erweitert
- **Keine neuen Abhängigkeiten**
