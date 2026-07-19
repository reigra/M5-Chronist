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

#### Scenario: Rassen-Skill-Wert weicht von Rassen-Definition ab

- **WHEN** ein Character einen Skill hat, der in `race.skills[]` definiert ist, aber der FW weicht vom erwarteten Wert ab (inkl. race.skillBonuses)
- **THEN** validate() erzeugt ein Issue mit `code: "RACE_SKILL_VALUE_MISMATCH"` und `severity: "warning"`

#### Scenario: Rassen-Skill-Wert stimmt mit Rassen-Definition überein

- **WHEN** ein Character einen Skill hat, der in `race.skills[]` definiert ist, und der FW entspricht `rs.value + race.skillBonuses[skillId]`
- **THEN** validate() erzeugt KEIN Issue für diesen Skill

---

## ADDED Requirements

### Requirement: correctIssues() — Fehlende Rassen-Skills ergänzen (VOR InnateSkills)

`correctIssues(character, rules)` SHALL zusätzlich zu den bestehenden Korrekturen auch fehlende Rassen-Skills aus `rules.races[raceId].skills[]` ergänzen. **Die Rassen-Skills werden VOR den universellen InnateSkills verarbeitet**, damit rassen-spezifische Werte Vorrang vor universellen Defaults haben.

Logik:
1. Rasse aus `rules.races` anhand `character.raceId` ermitteln
2. `knownIds = Set aller bereits im Character vorhandenen Skill-IDs`
3. **Zuerst**: Für jeden Eintrag in `race.skills[]` prüfen, ob `character.skills` den Skill bereits enthält. Wenn nicht: Skill mit FW = `rs.value + (race.skillBonuses[skillId] ?? 0)` hinzufügen, `pp: 0`, `knownIds` aktualisieren.
4. **Dann**: Für jeden Eintrag in `rules.universalRules.innateSkills[]` prüfen, ob `character.skills` den Skill bereits enthält (oder durch Schritt 3 hinzugefügt wurde). Wenn nicht und condition erfüllt: Skill mit berechnetem FW hinzufügen, `pp: 0`.

correctIssues() SHALL vorhandene Skills weder überschreiben noch deren FW ändern.

#### Scenario: Rassen-Wert gewinnt über universellen Default (Nachtsicht Elf)

- **WHEN** `correctIssues()` für einen Elfen-Charakter aufgerufen wird, `race.skills` den Eintrag `{ skillId: "Nachtsicht", value: 2 }` enthält, UND `innateSkills` einen Eintrag `{ id: "Nachtsicht", defaultFw: 0 }` definiert, der Character aber keinen Skill "Nachtsicht" hat
- **THEN** wird `{ skillId: "Nachtsicht", value: 2, pp: 0 }` zu `skills` hinzugefügt (rassen-spezifischer Wert 2, nicht 0)

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

### Requirement: CharacterLoadService — autoFix persistieren UND race.skills vor innateSkills

`CharacterLoadService.load()` SHALL nach `autoFix()` prüfen, ob Änderungen vorgenommen wurden (`applied.length > 0`). Wenn ja, SHALL der gefixte Character sofort in IndexedDB gespeichert werden (`characterStorage.save(fixed)`).

Der Service SHALL dabei keine `updatedAt`-Änderung vornehmen — autoFix verändert den Timestamp nicht, und `save()` speichert das Objekt wie übergeben.

**WICHTIG**: `autoFix()` SHALL `race.skills[]` VOR `innateSkills[]` verarbeiten (siehe Requirement unten), damit rassen-spezifische Werte Vorrang vor universellen Defaults haben.

#### Scenario: autoFix ergänzt Skills und persistiert

- **WHEN** `CharacterLoadService.load()` aufgerufen wird und autoFix fehlende Skills ergänzt (`applied.length = 2`)
- **THEN** wird `characterStorage.save(fixed)` aufgerufen, bevor der Character zurückgegeben wird
- **AND** `fixed.updatedAt` entspricht dem ursprünglichen Wert (kein TimeStamp-Update durch autoFix)

#### Scenario: autoFix ohne Änderungen

- **WHEN** `CharacterLoadService.load()` aufgerufen wird und autoFix keine Änderungen vornimmt (`applied.length = 0`)
- **THEN** wird `characterStorage.save()` NICHT aufgerufen

---

### Requirement: autoFix() — race.skills vor innateSkills verarbeiten

`autoFix(character, rules)` SHALL fehlende Rassen-Skills aus `rules.races[raceId].skills[]` VOR den universellen InnateSkills aus `rules.universalRules.innateSkills[]` ergänzen. Damit gewinnen rassen-spezifische Werte (z.B. Elfen: Nachtsicht=2) über universelle Defaults (z.B. Nachtsicht=0).

Logik-Reihenfolge:
1. `knownIds = Set aller bereits im Character vorhandenen Skill-IDs`
2. **Zuerst**: Für jeden Eintrag in `race.skills[]` prüfen, ob `character.skills` den Skill bereits enthält. Wenn nicht: Skill mit FW = `rs.value + (race.skillBonuses[skillId] ?? 0)` hinzufügen, `pp: 0`, `knownIds` aktualisieren.
3. **Dann**: Für jeden Eintrag in `rules.universalRules.innateSkills[]` prüfen, ob `character.skills` den Skill bereits enthält (oder durch Schritt 2 hinzugefügt wurde). Wenn nicht und condition erfüllt: Skill mit berechnetem FW hinzufügen, `pp: 0`.

#### Scenario: Rassen-Wert gewinnt über universellen Default (Nachtsicht Elf)

- **WHEN** `autoFix()` für einen Elfen-Character aufgerufen wird, `race.skills` den Eintrag `{ skillId: "Nachtsicht", value: 2 }` enthält, UND `innateSkills` einen Eintrag `{ id: "Nachtsicht", defaultFw: 0 }` definiert, der Character aber keinen Skill "Nachtsicht" hat
- **THEN** wird `{ skillId: "Nachtsicht", value: 2, pp: 0 }` zu `skills` hinzugefügt (rassen-spezifischer Wert 2, nicht 0)

#### Scenario: autoFix nach korrigiertem Character ist idempotent

- **WHEN** `autoFix()` bereits alle fehlenden Rassen-Skills und InnateSkills ergänzt hat und erneut aufgerufen wird
- **THEN** `applied.length = 0` (keine doppelten Ergänzungen)

---

### Requirement: validate() — RACE_SKILL_VALUE_MISMATCH prüfen

`validate()` SHALL für jeden Skill, der in `race.skills[]` definiert ist UND im Character vorhanden ist, prüfen, ob der FW dem erwarteten Wert entspricht (rassen-Wert + rassen-Bonus). Abweichungen werden als Warning gemeldet.

Prüfung:
1. Für jeden Eintrag in `race.skills[]`: wenn `character.skills` einen Skill mit gleicher `skillId` hat
2. Erwarteter FW = `rs.value + (race.skillBonuses[skillId] ?? 0)`
3. Wenn `character.skills[skillId].value !== erwarteter FW`: Issue mit `code: "RACE_SKILL_VALUE_MISMATCH"`, `severity: "warning"`

`correctIssues()` SHALL den Wert auf den erwarteten Rassen-FW setzen (`rs.value + race.skillBonuses[skillId] ?? 0`) und einen `applied`-Eintrag mit `action: 'fix_racial_skill_value'` hinzufügen.

#### Scenario: Rassen-Skill-Wert weicht von Rassen-Definition ab

- **WHEN** ein Elfen-Character "Nachtsicht" mit FW 5 hat, aber `race.skills` definiert `{ skillId: "Nachtsicht", value: 2 }` ohne Bonus
- **THEN** validate() erzeugt ein Issue mit `code: "RACE_SKILL_VALUE_MISMATCH"`, `severity: "warning"`, `expected: 2`, `actual: 5`

#### Scenario: Rassen-Skill-Wert stimmt mit Rassen-Definition überein

- **WHEN** ein Character einen Rassen-Skill mit exakt dem erwarteten FW hat
- **THEN** validate() erzeugt KEIN Issue für diesen Skill

#### Scenario: correctIssues() korrigiert abweichenden Rassen-Skill-FW

- **WHEN** `correctIssues()` aufgerufen wird und ein Rassen-Skill einen von der Rassendefinition abweichenden FW hat
- **THEN** wird der FW auf den erwarteten Wert gesetzt (`rs.value + race.skillBonuses[skillId] ?? 0`)
- **AND** der `applied`-Eintrag enthält `action: 'fix_racial_skill_value'`, `target: rs.skillId`, `description` mit altem und neuem FW
- **AND** eine erneute `validate()` nach `correctIssues()` meldet KEIN `RACE_SKILL_VALUE_MISMATCH` mehr für diesen Skill

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
