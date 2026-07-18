# Character Validation — Delta Spec

## MODIFIED Requirements

### Requirement: validate() — Kategorie C (Fertigkeiten)

`validate()` SHALL folgende Fertigkeiten-Prüfungen durchführen:

| Check | Code | Severity |
|-------|------|----------|
| Skill-Wert < `skill.baseValue` | `SKILL_BELOW_BASE` | error |
| Skill-Wert > `skill.maxValue` | `SKILL_ABOVE_MAX` | error |
| Universelle Basis-Skills aus `innateSkills[]` fehlen | `MISSING_INNATE_SKILL` | warning |
| Angeborene Skills aus `race.skills` fehlen | `MISSING_RACIAL_SKILL` | **error** (was warning) |
| Skill mit `baseSkillId` ohne Basis-Skill | `MISSING_BASE_SKILL` | error |

#### Scenario: Skill-Wert unter baseValue

- **WHEN** ein Character-Skill einen `value` kleiner als `skill.baseValue` hat
- **THEN** validate() erzeugt ein Issue mit `code: "SKILL_BELOW_BASE"` und `severity: "error"`

#### Scenario: Innate-Skill fehlt

- **WHEN** ein Eintrag in `rules.universalRules.innateSkills[]` keinen passenden Skill in `character.skills` hat (und die condition erfüllt ist)
- **THEN** validate() erzeugt ein Issue mit `code: "MISSING_INNATE_SKILL"` und `severity: "warning"`

#### Scenario: Rassen-Skill fehlt (blockiert Save)

- **WHEN** ein Eintrag in `race.skills[]` keinen passenden Skill in `character.skills` hat
- **THEN** validate() erzeugt ein Issue mit `code: "MISSING_RACIAL_SKILL"` und `severity: "error"`

#### Scenario: Innate-Skill mit condition=nicht erfüllt fehlt

- **WHEN** ein innateSkills-Eintrag eine condition hat (z.B. `"hasSpells"`) und diese nicht erfüllt ist
- **THEN** validate() erzeugt kein Issue für diesen Skill

---

## ADDED Requirements

### Requirement: correctIssues() — Fehlende Rassen-Skills ergänzen

`correctIssues(character, rules)` SHALL zusätzlich zu den bestehenden Korrekturen auch fehlende Rassen-Skills aus `rules.races[raceId].skills[]` ergänzen. Die Ergänzungslogik ist analog zu `autoFix()`:

1. Rasse aus `rules.races` anhand `character.raceId` ermitteln
2. Für jeden Eintrag in `race.skills[]` prüfen, ob `character.skills` den Skill bereits enthält
3. Wenn nicht: Skill mit FW = `rs.value + (race.skillBonuses[skillId] ?? 0)` hinzufügen
4. `pp: 0` für den neuen Skill

correctIssues() SHALL vorhandene Skills weder überschreiben noch deren FW ändern.

#### Scenario: Fehlenden Bergbau-Skill für Zwerg ergänzen

- **WHEN** `correctIssues()` für einen Zwerg-Charakter aufgerufen wird und `race.skills` den Eintrag `{ skillId: "Bergbau", value: 12 }` enthält, der Character aber keinen Skill "Bergbau" hat
- **THEN** wird `{ skillId: "Bergbau", value: 12, pp: 0 }` zu `skills` hinzugefügt

#### Scenario: Vorhandenen Rassen-Skill nicht überschreiben

- **WHEN** `correctIssues()` aufgerufen wird und ein Rassen-Skill bereits mit abweichendem FW existiert
- **THEN** bleibt der vorhandene Wert unverändert

#### Scenario: Rassen-Bonus wird auf race.skill addiert

- **WHEN** ein Zwerg-Character `correctIssues()` durchläuft, "Bergbau" fehlt, `race.skills` hat `{ skillId: "Bergbau", value: 12 }` und `race.skillBonuses` hat `{ "Bergbau": 2 }`
- **THEN** wird "Bergbau" mit FW 14 (= 12 + 2) ergänzt

#### Scenario: Rasse ohne skills-Feld

- **WHEN** eine Rasse kein `skills[]`-Feld hat (z.B. Mensch)
- **THEN** überspringt `correctIssues()` die Rassen-Skills-Ergänzung ohne Fehler

#### Scenario: correctIssues nach autoFix ist idempotent

- **WHEN** `autoFix()` bereits alle fehlenden Rassen-Skills ergänzt hat und danach `correctIssues()` aufgerufen wird
- **THEN** `correctIssues()` ergänzt keine weiteren Rassen-Skills (alle sind bereits vorhanden)

---

### Requirement: CharacterLoadService — autoFix persistieren

`CharacterLoadService.load()` SHALL nach `autoFix()` prüfen, ob Änderungen vorgenommen wurden (`applied.length > 0`). Wenn ja, SHALL der gefixte Character sofort in IndexedDB gespeichert werden (`characterStorage.save(fixed)`).

Der Service SHALL dabei keine `updatedAt`-Änderung vornehmen — autoFix verändert den Timestamp nicht, und `save()` speichert das Objekt wie übergeben.

#### Scenario: autoFix ergänzt Skills und persistiert

- **WHEN** `CharacterLoadService.load()` aufgerufen wird und autoFix fehlende Skills ergänzt (`applied.length = 2`)
- **THEN** wird `characterStorage.save(fixed)` aufgerufen, bevor der Character zurückgegeben wird
- **AND** `fixed.updatedAt` entspricht dem ursprünglichen Wert (kein TimeStamp-Update durch autoFix)

#### Scenario: autoFix ohne Änderungen

- **WHEN** `CharacterLoadService.load()` aufgerufen wird und autoFix keine Änderungen vornimmt (`applied.length = 0`)
- **THEN** wird `characterStorage.save()` NICHT aufgerufen

---

### Requirement: CharacterEditView — Live-Validierung bei Rasse/Klassen-Wechsel

Die `CharacterEditView` SHALL bei Änderung der Rasse (`raceId`) oder Klasse (`typeId`) durch den User eine Validierung des aktuellen Formularstands auslösen. Die Validierung SHALL das Formular NICHT verändern — sie dient nur der Information.

Implementierung: `@change`-Handler auf den `<select>`-Elementen, die `characterValidator.validate(buildCharacter(), rules)` aufrufen und das Ergebnis in `validationResult.value` setzen.

Der Handler SHALL vorzeitig abbrechen, wenn `raceId` oder `typeId` nicht gesetzt sind.

#### Scenario: Rasse geändert — Validierung zeigt Fehler

- **WHEN** ein User im Create-Formular die Rasse wechselt und `characterValidator.validate()` einen `PROPERTY_OUT_OF_RANGE`-Fehler meldet
- **THEN** wird `validationResult.value` mit dem Fehler gesetzt
- **AND** der Fehler wird im Validation-Banner angezeigt

#### Scenario: Klasse geändert — Validierung zeigt Warnungen

- **WHEN** ein User im Create-Formular die Klasse wechselt und `characterValidator.validate()` einen `BONUS_FORMULA_MISMATCH`-Warning meldet
- **THEN** wird `validationResult.value` mit dem Warning gesetzt
- **AND** das Warning wird im Validation-Banner angezeigt

#### Scenario: Handler bricht bei fehlender Klasse ab

- **WHEN** `raceId` gesetzt wird während `typeId` noch leer ist (z.B. beim fillForm())
- **THEN** der `@change`-Handler bricht vor `validate()` ab
- **AND** `validationResult.value` bleibt unverändert

#### Scenario: Handler verändert keine Formularfelder

- **WHEN** der `@change`-Handler durchläuft und `validate()` einen Fehler meldet
- **THEN** bleiben `skills.value`, `properties.*`, `boni.*` und alle anderen Formularfelder unverändert
- **AND** nur `validationResult.value` wird aktualisiert
