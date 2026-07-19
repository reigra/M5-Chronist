# Character Validation — Delta Spec

## MODIFIED Requirements

### Requirement: validate() — Kategorie I (Formel-basierte Werte)

`validate()` SHALL prüfen, ob formel-basierte Werte in `character.boni`, `character.properties` und `character.personalia` mit den definierten Formeln übereinstimmen.

Für Formeln mit `allowsDice: true` SHALL die Prüfung per Range (`evaluateRange()`) erfolgen: Der aktuelle Wert muss im Bereich `[min, max]` liegen. Der Lookup für den aktuellen Wert durchsucht nacheinander `boni` → `properties` → `personalia` (erste Fundstelle gewinnt). Für Formeln ohne Dice SHALL der exakte Vergleich (`evaluate()`) gelten.

**Precondition:** `evaluateRange()` SHALL Dice-Ausdrücke inklusive Würfelanzahl korrekt verarbeiten. Z.B. `4W3 + 16` SHALL Range `min=20, max=28, expected=24` liefern (siehe D4 im Design).

| Check | Code | Severity |
|-------|------|----------|
| Formel-Wert weicht von Formel ab (kein Dice) | `BONUS_FORMULA_MISMATCH` | warning |
| Dice-Wert ausserhalb des möglichen Bereichs | `DICE_VALUE_OUT_OF_RANGE` | warning |
| InnateSkill-Wert weicht von Formel ab | `INNATE_FORMULA_MISMATCH` | warning |

#### Scenario: Bonus-AnB weicht von Formel ab (kein Dice, in boni)

- **WHEN** `character.boni.AnB` = 0 ist, aber die Formel `bonus(Gs)` ergibt 1 (Gs=30) und `allowsDice: false`
- **THEN** validate() erzeugt ein Issue mit `code: "BONUS_FORMULA_MISMATCH"` und `severity: "warning"`, `path: "boni.AnB"`

#### Scenario: Trinken-Wert weicht von Formel ab

- **WHEN** der Character Trinken mit FW 5 hat, aber `Ko/10` ergibt 3 (Ko=30)
- **THEN** validate() erzeugt ein Issue mit `code: "INNATE_FORMULA_MISMATCH"` und `severity: "warning"`

#### Scenario: Dice-Property liegt im möglichen Bereich (in properties)

- **WHEN** `character.properties.B` = 22 ist, die Formel `4W3 + 16` ergibt Range [20, 28] und `allowsDice: true`
- **THEN** validate() erzeugt KEIN Issue

#### Scenario: Dice-Property liegt ausserhalb des Bereichs (in properties)

- **WHEN** `character.properties.B` = 18 ist, die Formel `4W3 + 16` ergibt Range [20, 28] und `allowsDice: true`
- **THEN** validate() erzeugt ein Issue mit `code: "DICE_VALUE_OUT_OF_RANGE"`, `severity: "warning"`, `path: "properties.B"`, `actual: 18`, `expected: 24`

#### Scenario: Dice-Personalia liegt ausserhalb des Bereichs (in personalia)

- **WHEN** `character.personalia.gg` = 150 ist, die Formel `2W6 + 10` ergibt Range [12, 22] und `allowsDice: true`
- **THEN** validate() erzeugt ein Issue mit `code: "DICE_VALUE_OUT_OF_RANGE"`, `severity: "warning"`, `path: "personalia.gg"`

#### Scenario: Fehlender Skill wird nicht doppelt gemeldet

- **WHEN** ein InnateSkill nicht in `character.skills` existiert
- **THEN** Kategorie I überspringt diesen Skill (wird bereits von Kategorie C als `MISSING_INNATE_SKILL` gemeldet)

#### Scenario: Dice-Wert mit Rassen-Bonus (set-mode überschreibt Range)

- **WHEN** die Rasse einen `propertyBonus` für `pA` mit `mode: 'set'` und `value: 10` definiert, und `character.properties.pA` = 10 ist
- **THEN** validate() erzeugt KEIN Issue (der Set-Bonus überschreibt den Dice-Bereich)

#### Scenario: 3-Quellen-Lookup — gleiche ID existiert in keiner Quelle

- **WHEN** eine Formel-ID weder in `boni`, `properties` noch `personalia` des Characters existiert (z.B. `id: "raufen"`)
- **THEN** Kategorie I überspringt diese Formel ohne Issue

### Requirement: correctIssues() — 3-Quellen-Lookup für Formel-Korrektur

`correctIssues()` SHALL Formel-IDs in allen drei Quellen (`boni`, `properties`, `personalia`) suchen — nicht nur in `boni`.

#### Scenario: repair-B-ausserhalb-range-in-properties

- **GIVEN** `character.properties.B = 18` und die Formel `4W3 + 16` (Range [20, 28])
- **WHEN** `correctIssues(character, rules)` ausgeführt wird
- **THEN** wird `character.properties.B` auf `24` gesetzt (`Math.floor(range.expected)`)
- **AND** es wird ein Fix-Eintrag mit `action: "correct_bonus"`  und `target: "B"` gemeldet

#### Scenario: repair-B-in-range-keine-korrektur

- **GIVEN** `character.properties.B = 24` und die Formel `4W3 + 16` (Range [20, 28])
- **WHEN** `correctIssues(character, rules)` ausgeführt wird
- **THEN** wird kein Fix-Eintrag für `B` gemeldet

#### Scenario: race-bonus-wird-auf-properties-angewandt

- **GIVEN** die Rasse hat `propertyBonus` für `B` mit `mode: 'add'` und `value: 2`
- **GIVEN** `character.properties.B = 26` (Formel 24 + Rasse 2)
- **WHEN** `correctIssues(character, rules)` ausgeführt wird
- **THEN** bleibt `character.properties.B = 26` (keine Abweichung)
