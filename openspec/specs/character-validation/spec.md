# Character Validation

## Purpose

Defines the validation infrastructure for characters against rulebook data. Covers type definitions,
the validation and auto-fix logic, the formula engine, and the load orchestrator.

## Requirements

### Requirement: ValidationIssue-Typen

Das System SHALL die folgenden Typen für Validierungsergebnisse definieren:

- `ValidationIssue`: Einzelnes Problem mit den Feldern `path` (string), `severity` ('error' | 'warning' | 'info'), `code` (string), `message` (string), optional `expected` und `actual`
- `ValidationResult`: Enthält `issues: ValidationIssue[]`, `hasErrors: boolean`, `hasWarnings: boolean`
- `FixDescription`: Beschreibt eine durchgeführte Korrektur mit `action` (string), `target` (string), `description` (string)
- `FixResult`: Enthält `fixed: Character` und `applied: FixDescription[]`

#### Scenario: Issue mit low-Werten anlegen

- **WHEN** ein ValidationIssue mit `path: "properties.St"`, `severity: "error"`, `code: "PROPERTY_OUT_OF_RANGE"` erzeugt wird
- **THEN** enthält das Issue alle Pflichtfelder und die severity ist 'error'

#### Scenario: ValidationResult mit Fehlern

- **WHEN** ein ValidationResult Issues mit severity 'error' enthält
- **THEN** `hasErrors` ist `true` und `hasWarnings` spiegelt den Status der Warning-Issues

#### Scenario: FixResult enthält neuen Character

- **WHEN** autoFix() Korrekturen durchgeführt hat
- **THEN** das FixResult enthält einen neuen Character (andere Referenz) und eine Liste aller angewandten FixDescriptions

---

### Requirement: validate() — Kategorie A (Struktur & Referenzen)

`validate()` SHALL folgende Prüfungen gegen das Regelwerk durchführen, alle mit severity 'error':

| Check | Code |
|-------|------|
| `raceId` existiert in `rules.races` | `MISSING_RACE` |
| `typeId` existiert in `rules.types` | `MISSING_TYPE` |
| `typeId` in `race.availableTypes` | `TYPE_NOT_ALLOWED_FOR_RACE` |
| Jede `skillId` in `character.skills` existiert in `rules.skills` | `UNKNOWN_SKILL` |
| `originId` existiert in `rules.origins` | `MISSING_ORIGIN` |
| `socialStatusId` existiert in `rules.socialStatuses` | `MISSING_SOCIAL_STATUS` |
| Keine verbotenen Skills (`race.forbiddenSkills`) | `FORBIDDEN_SKILL` |

#### Scenario: Rasse existiert nicht

- **WHEN** `character.raceId` in `rules.races` nicht existiert
- **THEN** validate() erzeugt ein Issue mit `code: "MISSING_RACE"` und `severity: "error"`

#### Scenario: Skill-ID im Character existiert nicht im Regelwerk

- **WHEN** `character.skills` einen Eintrag mit `skillId` enthält, den `rules.skills` nicht kennt
- **THEN** validate() erzeugt ein Issue mit `code: "UNKNOWN_SKILL"` und `severity: "error"`

#### Scenario: Charakter hat verbotenen Skill seiner Rasse

- **WHEN** `character.skills` einen Skill enthält, der in `race.forbiddenSkills` gelistet ist
- **THEN** validate() erzeugt ein Issue mit `code: "FORBIDDEN_SKILL"` und `severity: "error"`

#### Scenario: Alle Referenzen sind gültig

- **WHEN** raceId, typeId, originId, socialStatusId und alle skillIds in den Rules existieren
- **THEN** validate() erzeugt keine Issues aus Kategorie A

---

### Requirement: validate() — Kategorie B (Eigenschaften)

`validate()` SHALL prüfen, dass jede Eigenschaft (`St`, `Gs`, `Gw`, `Ko`, `In`, `Zt`, `Au`) innerhalb der rassenspezifischen Restriktionen liegt. severity: 'error'.

| Check | Code |
|-------|------|
| Eigenschaft innerhalb `race.propertyRestrictions.*` | `PROPERTY_OUT_OF_RANGE` |
| `Au` innerhalb `race.derivedRestrictions.Au` | `DERIVED_OUT_OF_RANGE` |

#### Scenario: Eigenschaft ausserhalb des Rassenlimits

- **WHEN** `character.properties.St` ausserhalb von `race.propertyRestrictions.St` [`min`, `max`] liegt
- **THEN** validate() erzeugt ein Issue mit `code: "PROPERTY_OUT_OF_RANGE"` und `severity: "error"`

#### Scenario: Au ausserhalb des abgeleiteten Limits

- **WHEN** `character.properties.Au` ausserhalb von `race.derivedRestrictions.Au` liegt
- **THEN** validate() erzeugt ein Issue mit `code: "DERIVED_OUT_OF_RANGE"` und `severity: "error"`

#### Scenario: Alle Eigenschaften im Rahmen

- **WHEN** alle Eigenschaften innerhalb ihrer Restriktionen liegen
- **THEN** validate() erzeugt keine Issues aus Kategorie B

---

### Requirement: validate() — Kategorie C (Fertigkeiten)

`validate()` SHALL folgende Fertigkeiten-Prüfungen durchführen:

| Check | Code | Severity |
|-------|------|----------|
| Skill-Wert < `skill.baseValue` | `SKILL_BELOW_BASE` | error |
| Skill-Wert > `skill.maxValue` | `SKILL_ABOVE_MAX` | error |
| Universelle Basis-Skills aus `innateSkills[]` fehlen | `MISSING_INNATE_SKILL` | warning |
| Angeborene Skills aus `race.skills` fehlen | `MISSING_RACIAL_SKILL` | warning |
| Skill mit `baseSkillId` ohne Basis-Skill | `MISSING_BASE_SKILL` | error |

#### Scenario: Skill-Wert unter baseValue

- **WHEN** ein Character-Skill einen `value` kleiner als `skill.baseValue` hat
- **THEN** validate() erzeugt ein Issue mit `code: "SKILL_BELOW_BASE"` und `severity: "error"`

#### Scenario: Innate-Skill fehlt

- **WHEN** ein Eintrag in `rules.universalRules.innateSkills[]` keinen passenden Skill in `character.skills` hat (und die condition erfüllt ist)
- **THEN** validate() erzeugt ein Issue mit `code: "MISSING_INNATE_SKILL"` und `severity: "warning"`

#### Scenario: Innate-Skill mit condition=nicht erfüllt fehlt

- **WHEN** ein innateSkills-Eintrag eine condition hat (z.B. `"hasSpells"`) und diese nicht erfüllt ist
- **THEN** validate() erzeugt kein Issue für diesen Skill

---

### Requirement: validate() — Kategorie D (Zauber)

`validate()` SHALL folgende Zauber-Prüfungen durchführen:

| Check | Code | Severity |
|-------|------|----------|
| Zauber vorhanden, aber Typ hat keine `spellCosts` | `SPELLS_WITHOUT_CASTER_TYPE` | warning |
| `spellId` existiert in `rules.spells` | `UNKNOWN_SPELL` | warning |

#### Scenario: Character hat Zauber, aber Typ ist kein Zauberer

- **WHEN** `character.spells` nicht leer ist, aber `character.typeId` in `rules.types` keine `spellCosts` definiert
- **THEN** validate() erzeugt ein Issue mit `code: "SPELLS_WITHOUT_CASTER_TYPE"` und `severity: "warning"`

#### Scenario: Unbekannter Zauber

- **WHEN** ein Eintrag in `character.spells` eine `spellId` enthält, die in `rules.spells` nicht existiert
- **THEN** validate() erzeugt ein Issue mit `code: "UNKNOWN_SPELL"` und `severity: "warning"`

---

### Requirement: validate() — Kategorie E (EP/Gold)

`validate()` SHALL folgende Prüfungen durchführen:

| Check | Code | Severity |
|-------|------|----------|
| `availableEp > totalEs` | `EP_EXCEEDS_ES` | warning |
| Gold negativ | `NEGATIVE_GOLD` | warning |

#### Scenario: EP übersteigt ausgegebene ES

- **WHEN** `character.availableEp` grösser ist als `character.totalEs`
- **THEN** validate() erzeugt ein Issue mit `code: "EP_EXCEEDS_ES"` und `severity: "warning"`

#### Scenario: Gold negativ

- **WHEN** `character.gold` negativ ist
- **THEN** validate() erzeugt ein Issue mit `code: "NEGATIVE_GOLD"` und `severity: "warning"`

---

### Requirement: validate() — Kategorie F (Boni)

`validate()` SHALL folgende Bonus-Prüfungen durchführen:

| Check | Code | Severity |
|-------|------|----------|
| Alle Boni-Werte sind 0 | `BONUS_VALUE_SUSPICIOUS` | info |

#### Scenario: Alle Boni auf 0

- **WHEN** alle Felder in `character.boni` den Wert 0 haben
- **THEN** validate() erzeugt ein Issue mit `code: "BONUS_VALUE_SUSPICIOUS"` und `severity: "info"`

---

### Requirement: validate() — Kategorie G (Grad-abhängige Fertigkeiten)

`validate()` SHALL prüfen, ob Skills mit `gradValues[]`-Tabelle dem für den aktuellen Grad erwarteten Wert entsprechen. severity: 'warning'. Code: `GRAD_SKILL_VALUE_MISMATCH`.

Die Lookup-Logik: `grad = computeGrad(character.totalEs)`, dann `gradValues` absteigend sortieren, ersten Eintrag mit `grad ≤ characterGrad` nehmen. Fallback: `skill.baseValue`.

#### Scenario: Abwehr-Wert weicht vom Grad ab

- **WHEN** ein Character Grad 4 hat und `skill.gradValues` für Grad 4 den FW 13 vorsieht, aber der Character `Abwehr` auf FW 11 hat
- **THEN** validate() erzeugt ein Issue mit `code: "GRAD_SKILL_VALUE_MISMATCH"` und `severity: "warning"`

#### Scenario: Skill ohne gradValues

- **WHEN** ein Skill keine `gradValues[]` hat
- **THEN** validate() überspringt Kategorie G für diesen Skill

---

### Requirement: validate() — Kategorie H (Formelfehler)

`validate()` SHALL Fehler in Formel-Auswertungen melden. Fängt `FormulaEngine`-Exceptions und erzeugt daraus Issues mit `code: "FORMULA_ERROR"` und `severity: "error"`.

#### Scenario: Formel enthält unbekannte Variable

- **WHEN** eine Formel in `rules.universalRules.formulas[]` eine Variable referenziert, die nicht im Context existiert
- **THEN** validate() erzeugt ein Issue mit `code: "FORMULA_ERROR"` und `severity: "error"`

---

### Requirement: validate() — Kategorie I (Formel-basierte Werte)

`validate()` SHALL prüfen, ob Bonus-Werte und InnateSkill-Werte mit den definierten Formeln übereinstimmen.

| Check | Code | Severity |
|-------|------|----------|
| Bonus-Wert weicht von Formel ab | `BONUS_FORMULA_MISMATCH` | warning |
| InnateSkill-Wert weicht von Formel ab | `INNATE_FORMULA_MISMATCH` | warning |

#### Scenario: Bonus-AnB weicht von Formel ab

- **WHEN** `character.boni.AnB` = 0 ist, aber die Formel `bonus(Gs)` ergibt 1 (Gs=30)
- **THEN** validate() erzeugt ein Issue mit `code: "BONUS_FORMULA_MISMATCH"` und `severity: "warning"`

#### Scenario: Trinken-Wert weicht von Formel ab

- **WHEN** der Character Trinken mit FW 5 hat, aber `Ko/10` ergibt 3 (Ko=30)
- **THEN** validate() erzeugt ein Issue mit `code: "INNATE_FORMULA_MISMATCH"` und `severity: "warning"`

#### Scenario: Fehlender Skill wird nicht doppelt gemeldet

- **WHEN** ein InnateSkill nicht in `character.skills` existiert
- **THEN** Kategorie I überspringt diesen Skill (wird bereits von Kategorie C als `MISSING_INNATE_SKILL` gemeldet)

---

### Requirement: autoFix() — Pflicht-Skills ergänzen

`autoFix(character, rules)` SHALL einen neuen Character zurückgeben, bei dem:

1. Für jeden Eintrag in `rules.universalRules.innateSkills[]` geprüft wird, ob `character.skills` den Skill bereits enthält
2. Wenn nicht (und condition erfüllt): Skill wird mit berechnetem FW hinzugefügt
3. FW-Berechnung: `formula` → FormulaEngine, oder `formulaId` → Lookup in `formulas[]` → FormulaEngine, oder `gradValues: true` → `lookupGradValue()`, oder `defaultFw`
4. Rassen-Bonus aus `rules.races[raceId].skillBonuses[skillId]` wird addiert
5. Nach innateSkills: fehlende Einträge aus `rules.races[raceId].skills[]` ergänzen (Startwert + `skillBonuses`)
6. `pp: 0` auf Skills ohne pp-Feld
7. `pp: 0` auf Zauber ohne pp-Feld
8. String-Zauber werden in `{ spellId, pp: 0 }` konvertiert

autoFix SHALL niemals bestehende Werte überschreiben — nur ergänzen.

#### Scenario: Fehlenden Raufen-Skill ergänzen

- **WHEN** ein Character keinen Skill "Raufen" hat, aber `innateSkills` einen Eintrag für "Raufen" enthält
- **THEN** autoFix() fügt `{ skillId: "Raufen", value: <berechneter FW>, pp: 0 }` hinzu

#### Scenario: Vorhandenen Skill nicht überschreiben

- **WHEN** ein Character "Raufen" bereits mit FW 8 hat
- **THEN** autoFix() ändert den Wert nicht

#### Scenario: Zaubern nur bei vorhandenen Zaubern

- **WHEN** ein Character keine Zauber hat (`spells` ist leer) und `innateSkills` "Zaubern" mit `condition: "hasSpells"` listet
- **THEN** autoFix() fügt "Zaubern" nicht hinzu

#### Scenario: Zwerg-Bonus auf Raufen

- **WHEN** ein Zwerg-Character autoFix() durchläuft und `race.skillBonuses` `{ "Raufen": 1 }` definiert
- **THEN** der berechnete FW für Raufen wird um 1 erhöht

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

#### Scenario: String-Zauber konvertieren

- **WHEN** `character.spells` Einträge als Strings enthält (z.B. `["Feuerball", "Blitz"]`)
- **THEN** autoFix() konvertiert sie zu `[{ spellId: "Feuerball", pp: 0 }, { spellId: "Blitz", pp: 0 }]`

---

### Requirement: FormulaEngine — Initialisierung und Grundfunktion

Die `FormulaEngine` SHALL als zustandsloser Service (Singleton oder statische Methoden) implementiert sein. Sie parst Formel-Strings und evaluiert sie gegen einen Zahlen-Kontext.

Die Engine unterstützt:
- `bonus(X)`-Funktion für den M5-Fertigkeitsbonus (≤5=−2, ≤20=−1, ≤80=0, ≤95=+1, >95=+2)
- Standard-Operatoren: `+`, `-`, `*`, `/` (M5-Rundung: Math.floor pro Division)
- Klammerausdrücke
- Variablen aus dem Kontext

#### Scenario: Engine evaluiert einfache Addition

- **WHEN** `engine.evaluate("Ko/10", { Ko: 20 })` aufgerufen wird
- **THEN** das Ergebnis ist 2 (nach M5-Rundung: `Math.floor(20/10)`)

#### Scenario: Engine evaluiert bonus()-Funktion

- **WHEN** `engine.evaluate("bonus(Gs)", { Gs: 30 })` aufgerufen wird
- **THEN** das Ergebnis ist 0 (Gs=30 liegt im Bereich ≤80)

#### Scenario: Engine evaluiert komplexe Formel

- **WHEN** `engine.evaluate("(St+Gw)/20 + AnB", { St: 20, Gw: 10, AnB: 2 })` aufgerufen wird
- **THEN** das Ergebnis ist `Math.floor(30/20) + 2` = `1 + 2` = 3

#### Scenario: Engine evaluiert Formel mit mehreren Divisionen

- **WHEN** `engine.evaluate("Ko/10 + St/20", { Ko: 23, St: 17 })` aufgerufen wird
- **THEN** das Ergebnis ist `Math.floor(23/10) + Math.floor(17/20)` = `2 + 0` = 2

#### Scenario: Engine wirft Fehler bei unbekannter Variable

- **WHEN** `engine.evaluate("Ko/10 + Foobar", { Ko: 20 })` aufgerufen wird
- **THEN** die Engine wirft einen Fehler mit Hinweis auf die unbekannte Variable "Foobar"

---

### Requirement: FormulaEngine — Dice-Unterstützung

Die FormulaEngine SHALL Dice-Notation (`W%`, `nWm`) unterstützen für `evaluateRange()` (min/max/expected) und `evaluateExact()` (mit gespeichertem Wurf).

#### Scenario: Würfel-Range berechnen

- **WHEN** `engine.evaluateRange("1W3 + 7", {})` aufgerufen wird
- **THEN** das Ergebnis ist `{ min: 8, max: 10, expected: 9 }`

#### Scenario: Würfel mit exact-Wert

- **WHEN** `engine.evaluateExact("1W3 + 7", {}, 2)` aufgerufen wird
- **THEN** das Ergebnis ist `2 + 7` = 9

---

### Requirement: FormulaEngine — Sicherheit

Die FormulaEngine SHALL keine dynamische Code-Auswertung (`eval`, `new Function`) verwenden. Die Implementierung verwendet einen Tokenizer + Recursive-Descent-Parser.

#### Scenario: Parser lehnt ungültige Zeichen ab

- **WHEN** ein Formel-String Zeichen enthält, die nicht dem erlaubten Zeichensatz entsprechen (`^[0-9A-Za-z+\-*/().W%\s]+$`)
- **THEN** der Tokenizer wirft einen Fehler mit Positionsangabe

#### Scenario: Variablen mit 'W' werden nicht als Würfel fehlinterpretiert

- **WHEN** ein Formel-String `bonus(Gw)` oder `bonus(Wk)` enthält
- **THEN** der Tokenizer erkennt `Gw` und `Wk` als Variablen, nicht als Würfelnotation

---

### Requirement: CharacterLoadService — Orchestrierung

`CharacterLoadService` SHALL eine `load(id: string): Promise<{ character: Character; rules: RulesData; issues: ValidationResult }>`-Methode bereitstellen, die folgende Kette ausführt:

1. Rules laden: `new RulesLoader().load()`
2. Character laden: `characterStorage.load(id)` → durchläuft `migrate()`
3. autoFix: `CharacterValidator.autoFix(migrated, rules)`
4. validate: `CharacterValidator.validate(fixed, rules)`
5. Rückgabe des fixierten Characters, Rules und ValidationResult

Der Service SHALL als Singleton exportiert werden.

#### Scenario: Character laden mit autoFix und validate

- **WHEN** `CharacterLoadService.load("abc-123")` aufgerufen wird und in den Rules `innateSkills` definiert sind
- **THEN** der zurückgegebene Character ist autoFix-durchlaufen, issues enthält das validate-Ergebnis

#### Scenario: Character nicht gefunden

- **WHEN** `CharacterLoadService.load("nicht-vorhanden")` aufgerufen wird
- **THEN** der Service gibt `{ character: null, ... }` zurück oder wirft einen Fehler (analog zu `CharacterStorage.load()`)

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
