## ADDED Requirements

### Requirement: autoFix() — Fehlende race.skills ergänzen

`autoFix(character, rules)` SHALL zusätzlich zu `rules.universalRules.innateSkills[]` auch fehlende Einträge aus `rules.races[raceId].skills[]` ergänzen:

1. Für jeden Eintrag in `rules.races[character.raceId].skills[]` prüfen, ob `character.skills` den Skill bereits via `skillId` enthält
2. Wenn nicht: Skill mit dem Startwert aus `race.skills[].value` hinzufügen
3. Rassen-Bonus aus `race.skillBonuses[skillId]` wird addiert (wie bei innateSkills)
4. `pp: 0` für den neuen Skill
5. Die Ergänzung erfolgt NACH der innateSkills-Schleife in autoFix(), aber VOR den PP-Defaults

autoFix() SHALL vorhandene Skills nicht überschreiben.

#### Scenario: Zwerg erhält Bergbau aus race.skills

- **WHEN** `autoFix()` für einen Zwerg-Charakter aufgerufen wird und `race.skills` den Eintrag `{ skillId: "Bergbau", value: 12 }` enthält, der Character aber keinen Skill "Bergbau" hat
- **THEN** wird `{ skillId: "Bergbau", value: 12, pp: 0 }` zu `skills` hinzugefügt

#### Scenario: Vorhandener Bergbau wird nicht überschrieben

- **WHEN** `autoFix()` für einen Zwerg-Charakter aufgerufen wird und "Bergbau" bereits mit FW 14 existiert
- **THEN** bleibt der Wert 14 unverändert

#### Scenario: race.skillBonuses wird auf race.skill addiert

- **WHEN** ein Zwerg-Character `autoFix()` durchläuft, "Bergbau" fehlt, `race.skills` hat `{ skillId: "Bergbau", value: 12 }` und `race.skillBonuses` hat `{ "Bergbau": 2 }`
- **THEN** wird "Bergbau" mit FW 14 (= 12 + 2) ergänzt

#### Scenario: Rasse ohne skills

- **WHEN** eine Rasse kein `skills[]`-Feld hat (z.B. Mensch)
- **THEN** `autoFix()` überspringt die race.skills-Schleife ohne Fehler

---

### Requirement: correctIssues() — Fehlende InnateSkills ergänzen

`correctIssues(character, rules)` SHALL zusätzlich zu den bestehenden Korrekturen auch fehlende InnateSkills aus `rules.universalRules.innateSkills[]` ergänzen. Die Ergänzungslogik ist analog zu `autoFix()`:

1. Für jeden Eintrag in `rules.universalRules.innateSkills[]` prüfen, ob `character.skills` den Skill bereits enthält
2. Wenn nicht (und condition erfüllt): Skill mit berechnetem FW hinzufügen
3. FW-Berechnung via `computeInnateFw()`: Formel/FormulaId/gradValues/defaultFw + Rassen-Bonus
4. `pp: 0` für den neuen Skill

correctIssues() SHALL vorhandene Skills weder überschreiben noch deren FW ändern.

#### Scenario: Fehlenden Raufen-Skill ergänzen

- **WHEN** `correctIssues()` aufgerufen wird und der Character keinen Skill "Raufen" hat, aber `innateSkills` einen Eintrag für "Raufen" enthält
- **THEN** wird `{ skillId: "Raufen", value: <berechneter FW>, pp: 0 }` zu `skills` hinzugefügt

#### Scenario: Vorhandenen Skill nicht überschreiben

- **WHEN** `correctIssues()` aufgerufen wird und der Character "Raufen" bereits mit FW 8 hat
- **THEN** bleibt der Wert unverändert

#### Scenario: correctIssues nach autoFix ist idempotent

- **WHEN** `autoFix()` bereits alle fehlenden InnateSkills ergänzt hat und danach `correctIssues()` aufgerufen wird
- **THEN** `correctIssues()` ergänzt keine weiteren Skills (alle sind bereits vorhanden)
