# Character-Validierung

> Archivierter Stand (OpenSpec, 2026). Maßgeblich ist der Code in `src/services/CharacterValidator.ts`, `src/services/FormulaEngine.ts`, `src/services/CharacterLoadService.ts`, `src/views/CharacterEditView.vue`.

## Purpose

Defines the validation infrastructure for characters against rulebook data. Covers type definitions,
the validation and auto-fix logic, the formula engine, and the load orchestrator.

## Requirements

### ValidationIssue-Typen

Das System SHALL die folgenden Typen für Validierungsergebnisse definieren:

- `ValidationIssue`: Einzelnes Problem mit den Feldern `path` (string), `severity` ('error' | 'warning' | 'info'), `code` (string), `message` (string), optional `expected` und `actual`
- `ValidationResult`: Enthält `issues: ValidationIssue[]`, `hasErrors: boolean`, `hasWarnings: boolean`
- `FixDescription`: Beschreibt eine durchgeführte Korrektur mit `action` (string), `target` (string), `description` (string)
- `FixResult`: Enthält `fixed: Character` und `applied: FixDescription[]`

#### Issue mit low-Werten anlegen

- **WHEN** ein ValidationIssue mit `path: "properties.St"`, `severity: "error"`, `code: "PROPERTY_OUT_OF_RANGE"` erzeugt wird
- **THEN** enthält das Issue alle Pflichtfelder und die severity ist 'error'

#### ValidationResult mit Fehlern

- **WHEN** ein ValidationResult Issues mit severity 'error' enthält
- **THEN** `hasErrors` ist `true` und `hasWarnings` spiegelt den Status der Warning-Issues

#### FixResult enthält neuen Character

- **WHEN** autoFix() Korrekturen durchgeführt hat
- **THEN** das FixResult enthält einen neuen Character (andere Referenz) und eine Liste aller angewandten FixDescriptions

### validate() — Kategorie A (Struktur & Referenzen)

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

#### Rasse existiert nicht

- **WHEN** `character.raceId` in `rules.races` nicht existiert
- **THEN** validate() erzeugt ein Issue mit `code: "MISSING_RACE"` und `severity: "error"`

#### Skill-ID im Character existiert nicht im Regelwerk

- **WHEN** `character.skills` einen Eintrag mit `skillId` enthält, den `rules.skills` nicht kennt
- **THEN** validate() erzeugt ein Issue mit `code: "UNKNOWN_SKILL"` und `severity: "error"`

#### Charakter hat verbotenen Skill seiner Rasse

- **WHEN** `character.skills` einen Skill enthält, der in `race.forbiddenSkills` gelistet ist
- **THEN** validate() erzeugt ein Issue mit `code: "FORBIDDEN_SKILL"` und `severity: "error"`

#### Alle Referenzen sind gültig

- **WHEN** raceId, typeId, originId, socialStatusId und alle skillIds in den Rules existieren
- **THEN** validate() erzeugt keine Issues aus Kategorie A

### validate() — Kategorie B (Eigenschaften)

`validate()` SHALL prüfen, dass jede Eigenschaft (`St`, `Gs`, `Gw`, `Ko`, `In`, `Zt`, `Au`) innerhalb der rassenspezifischen Restriktionen liegt. severity: 'error'.

| Check | Code |
|-------|------|
| Eigenschaft innerhalb `race.propertyRestrictions.*` | `PROPERTY_OUT_OF_RANGE` |
| `Au` innerhalb `race.derivedRestrictions.Au` | `DERIVED_OUT_OF_RANGE` |

#### Eigenschaft ausserhalb des Rassenlimits

- **WHEN** `character.properties.St` ausserhalb von `race.propertyRestrictions.St` [`min`, `max`] liegt
- **THEN** validate() erzeugt ein Issue mit `code: "PROPERTY_OUT_OF_RANGE"` und `severity: "error"`

#### Au ausserhalb des abgeleiteten Limits

- **WHEN** `character.properties.Au` ausserhalb von `race.derivedRestrictions.Au` liegt
- **THEN** validate() erzeugt ein Issue mit `code: "DERIVED_OUT_OF_RANGE"` und `severity: "error"`

#### Alle Eigenschaften im Rahmen

- **WHEN** alle Eigenschaften innerhalb ihrer Restriktionen liegen
- **THEN** validate() erzeugt keine Issues aus Kategorie B

### validate() — Kategorie C (Fertigkeiten)

`validate()` SHALL folgende Fertigkeiten-Prüfungen durchführen:

| Check | Code | Severity |
|-------|------|----------|
| Skill-Wert < `skill.baseValue` | `SKILL_BELOW_BASE` | error |
| Skill-Wert > `skill.maxValue` | `SKILL_ABOVE_MAX` | error |
| Universelle Basis-Skills aus `innateSkills[]` fehlen | `MISSING_INNATE_SKILL` | warning |
| Angeborene Skills aus `race.skills` fehlen | `MISSING_RACIAL_SKILL` | **error** (was warning) |
| Skill mit `baseSkillId` ohne Basis-Skill | `MISSING_BASE_SKILL` | error |
| Rassen-Skill-Wert weicht von Rassen-Definition ab | `RACE_SKILL_VALUE_MISMATCH` | warning |

#### Skill-Wert unter baseValue

- **WHEN** ein Character-Skill einen `value` kleiner als `skill.baseValue` hat
- **THEN** validate() erzeugt ein Issue mit `code: "SKILL_BELOW_BASE"` und `severity: "error"`

#### Innate-Skill fehlt

- **WHEN** ein Eintrag in `rules.universalRules.innateSkills[]` keinen passenden Skill in `character.skills` hat (und die condition erfüllt ist)
- **THEN** validate() erzeugt ein Issue mit `code: "MISSING_INNATE_SKILL"` und `severity: "warning"`

#### Rassen-Skill fehlt (blockiert Save)

- **WHEN** ein Eintrag in `race.skills[]` keinen passenden Skill in `character.skills` hat
- **THEN** validate() erzeugt ein Issue mit `code: "MISSING_RACIAL_SKILL"` und `severity: "error"`

#### Innate-Skill mit condition=nicht erfüllt fehlt

- **WHEN** ein innateSkills-Eintrag eine condition hat (z.B. `"hasSpells"`) und diese nicht erfüllt ist
- **THEN** validate() erzeugt kein Issue für diesen Skill

#### Rassen-Skill-Wert weicht von Rassen-Definition ab

- **WHEN** ein Character einen Skill hat, der in `race.skills[]` definiert ist, aber der FW weicht vom erwarteten Wert ab (inkl. race.skillBonuses)
- **THEN** validate() erzeugt ein Issue mit `code: "RACE_SKILL_VALUE_MISMATCH"` und `severity: "warning"`

#### Rassen-Skill-Wert stimmt mit Rassen-Definition überein

- **WHEN** ein Character einen Skill hat, der in `race.skills[]` definiert ist, und der FW entspricht `rs.value + race.skillBonuses[skillId]`
- **THEN** validate() erzeugt KEIN Issue für diesen Skill

### validate() — Kategorie D (Zauber)

`validate()` SHALL folgende Zauber-Prüfungen durchführen:

| Check | Code | Severity |
|-------|------|----------|
| Zauber vorhanden, aber Typ hat keine `spellCosts` | `SPELLS_WITHOUT_CASTER_TYPE` | warning |
| `spellId` existiert in `rules.spells` | `UNKNOWN_SPELL` | warning |

#### Character hat Zauber, aber Typ ist kein Zauberer

- **WHEN** `character.spells` nicht leer ist, aber `character.typeId` in `rules.types` keine `spellCosts` definiert
- **THEN** validate() erzeugt ein Issue mit `code: "SPELLS_WITHOUT_CASTER_TYPE"` und `severity: "warning"`

#### Unbekannter Zauber

- **WHEN** ein Eintrag in `character.spells` eine `spellId` enthält, die in `rules.spells` nicht existiert
- **THEN** validate() erzeugt ein Issue mit `code: "UNKNOWN_SPELL"` und `severity: "warning"`

### validate() — Kategorie E (EP/Gold)

`validate()` SHALL folgende Prüfungen durchführen:

| Check | Code | Severity |
|-------|------|----------|
| `availableEp > totalEs` | `EP_EXCEEDS_ES` | warning |
| Gold negativ | `NEGATIVE_GOLD` | warning |

#### EP übersteigt ausgegebene ES

- **WHEN** `character.availableEp` grösser ist als `character.totalEs`
- **THEN** validate() erzeugt ein Issue mit `code: "EP_EXCEEDS_ES"` und `severity: "warning"`

#### Gold negativ

- **WHEN** `character.gold` negativ ist
- **THEN** validate() erzeugt ein Issue mit `code: "NEGATIVE_GOLD"` und `severity: "warning"`

### validate() — Kategorie F (Boni)

`validate()` SHALL folgende Bonus-Prüfungen durchführen:

| Check | Code | Severity |
|-------|------|----------|
| Alle Boni-Werte sind 0 | `BONUS_VALUE_SUSPICIOUS` | info |

#### Alle Boni auf 0

- **WHEN** alle Felder in `character.boni` den Wert 0 haben
- **THEN** validate() erzeugt ein Issue mit `code: "BONUS_VALUE_SUSPICIOUS"` und `severity: "info"`

### validate() — Kategorie G (Grad-abhängige Fertigkeiten)

`validate()` SHALL prüfen, ob Skills mit `gradValues[]`-Tabelle dem für den aktuellen Grad erwarteten Wert entsprechen. severity: 'warning'. Code: `GRAD_SKILL_VALUE_MISMATCH`.

Die Lookup-Logik: `grad = computeGrad(character.totalEs)`, dann `gradValues` absteigend sortieren, ersten Eintrag mit `grad ≤ characterGrad` nehmen. Fallback: `skill.baseValue`.

#### Abwehr-Wert weicht vom Grad ab

- **WHEN** ein Character Grad 4 hat und `skill.gradValues` für Grad 4 den FW 13 vorsieht, aber der Character `Abwehr` auf FW 11 hat
- **THEN** validate() erzeugt ein Issue mit `code: "GRAD_SKILL_VALUE_MISMATCH"` und `severity: "warning"`

#### Skill ohne gradValues

- **WHEN** ein Skill keine `gradValues[]` hat
- **THEN** validate() überspringt Kategorie G für diesen Skill

### validate() — Kategorie H (Formelfehler)

`validate()` SHALL Fehler in Formel-Auswertungen melden. Fängt `FormulaEngine`-Exceptions und erzeugt daraus Issues mit `code: "FORMULA_ERROR"` und `severity: "error"`.

#### Formel enthält unbekannte Variable

- **WHEN** eine Formel in `rules.universalRules.formulas[]` eine Variable referenziert, die nicht im Context existiert
- **THEN** validate() erzeugt ein Issue mit `code: "FORMULA_ERROR"` und `severity: "error"`

### validate() — Kategorie I (Formel-basierte Werte)

`validate()` SHALL prüfen, ob formel-basierte Werte in `character.boni`, `character.properties` und `character.personalia` mit den definierten Formeln übereinstimmen.

Für Formeln mit `allowsDice: true` SHALL die Prüfung per Range (`evaluateRange()`) erfolgen: Der aktuelle Wert muss im Bereich `[min, max]` liegen. Der Lookup für den aktuellen Wert durchsucht nacheinander `boni` → `properties` → `personalia` (erste Fundstelle gewinnt). Für Formeln ohne Dice SHALL der exakte Vergleich (`evaluate()`) gelten.

**Precondition:** `evaluateRange()` SHALL Dice-Ausdrücke inklusive Würfelanzahl korrekt verarbeiten. Z.B. `4W3 + 16` SHALL Range `min=20, max=28, expected=24` liefern (siehe D4 im Design).

| Check | Code | Severity |
|-------|------|----------|
| Formel-Wert weicht von Formel ab (kein Dice) | `BONUS_FORMULA_MISMATCH` | warning |
| Dice-Wert ausserhalb des möglichen Bereichs | `DICE_VALUE_OUT_OF_RANGE` | warning |
| InnateSkill-Wert weicht von Formel ab | `INNATE_FORMULA_MISMATCH` | warning |

#### Bonus-AnB weicht von Formel ab (kein Dice, in boni)

- **WHEN** `character.boni.AnB` = 0 ist, aber die Formel `bonus(Gs)` ergibt 1 (Gs=30) und `allowsDice: false`
- **THEN** validate() erzeugt ein Issue mit `code: "BONUS_FORMULA_MISMATCH"` und `severity: "warning"`, `path: "boni.AnB"`

#### Trinken-Wert weicht von Formel ab

- **WHEN** der Character Trinken mit FW 5 hat, aber `Ko/10` ergibt 3 (Ko=30)
- **THEN** validate() erzeugt ein Issue mit `code: "INNATE_FORMULA_MISMATCH"` und `severity: "warning"`

#### Dice-Property liegt im möglichen Bereich (in properties)

- **WHEN** `character.properties.B` = 22 ist, die Formel `4W3 + 16` ergibt Range [20, 28] und `allowsDice: true`
- **THEN** validate() erzeugt KEIN Issue

#### Dice-Property liegt ausserhalb des Bereichs (in properties)

- **WHEN** `character.properties.B` = 18 ist, die Formel `4W3 + 16` ergibt Range [20, 28] und `allowsDice: true`
- **THEN** validate() erzeugt ein Issue mit `code: "DICE_VALUE_OUT_OF_RANGE"`, `severity: "warning"`, `path: "properties.B"`, `actual: 18`, `expected: 24`

#### Dice-Personalia liegt ausserhalb des Bereichs (in personalia)

- **WHEN** `character.personalia.gg` = 150 ist, die Formel `2W6 + 10` ergibt Range [12, 22] und `allowsDice: true`
- **THEN** validate() erzeugt ein Issue mit `code: "DICE_VALUE_OUT_OF_RANGE"`, `severity: "warning"`, `path: "personalia.gg"`

#### Fehlender Skill wird nicht doppelt gemeldet

- **WHEN** ein InnateSkill nicht in `character.skills` existiert
- **THEN** Kategorie I überspringt diesen Skill (wird bereits von Kategorie C als `MISSING_INNATE_SKILL` gemeldet)

#### Dice-Wert mit Rassen-Bonus (set-mode überschreibt Range)

- **WHEN** die Rasse einen `propertyBonus` für `pA` mit `mode: 'set'` und `value: 10` definiert, und `character.properties.pA` = 10 ist
- **THEN** validate() erzeugt KEIN Issue (der Set-Bonus überschreibt den Dice-Bereich)

#### 3-Quellen-Lookup — gleiche ID existiert in keiner Quelle

- **WHEN** eine Formel-ID weder in `boni`, `properties` noch `personalia` des Characters existiert (z.B. `id: "raufen"`)
- **THEN** Kategorie I überspringt diese Formel ohne Issue

### autoFix() — Pflicht-Skills ergänzen

`autoFix(character, rules)` SHALL einen neuen Character zurückgeben, bei dem:

1. Für jeden Eintrag in `rules.universalRules.innateSkills[]` geprüft wird, ob `character.skills` den Skill bereits enthält
2. Wenn nicht (und condition erfüllt): Skill wird mit berechnetem FW hinzugefügt
3. FW-Berechnung: `formula` → FormulaEngine, oder `formulaId` → Lookup in `formulas[]` → FormulaEngine, oder `gradValues: true` → `lookupGradValue()`, oder `defaultFw`
4. Rassen-Bonus aus `rules.races[raceId].skillBonuses[skillId]` wird addiert
5. **Vor** innateSkills: fehlende Einträge aus `rules.races[raceId].skills[]` ergänzen (Startwert + `skillBonuses`) — Rassen-spezifische Werte haben Vorrang vor universellen Defaults
6. `pp: 0` auf Skills ohne pp-Feld
7. `pp: 0` auf Zauber ohne pp-Feld
8. String-Zauber werden in `{ spellId, pp: 0 }` konvertiert

autoFix SHALL niemals bestehende Werte überschreiben — nur ergänzen.

#### Fehlenden Raufen-Skill ergänzen

- **WHEN** ein Character keinen Skill "Raufen" hat, aber `innateSkills` einen Eintrag für "Raufen" enthält
- **THEN** autoFix() fügt `{ skillId: "Raufen", value: <berechneter FW>, pp: 0 }` hinzu

#### Vorhandenen Skill nicht überschreiben

- **WHEN** ein Character "Raufen" bereits mit FW 8 hat
- **THEN** autoFix() ändert den Wert nicht

#### Zaubern nur bei vorhandenen Zaubern

- **WHEN** ein Character keine Zauber hat (`spells` ist leer) und `innateSkills` "Zaubern" mit `condition: "hasSpells"` listet
- **THEN** autoFix() fügt "Zaubern" nicht hinzu

#### Zwerg-Bonus auf Raufen

- **WHEN** ein Zwerg-Character autoFix() durchläuft und `race.skillBonuses` `{ "Raufen": 1 }` definiert
- **THEN** der berechnete FW für Raufen wird um 1 erhöht

#### Zwerg erhält Bergbau aus race.skills

- **WHEN** `autoFix()` für einen Zwerg-Charakter aufgerufen wird und `race.skills` den Eintrag `{ skillId: "Bergbau", value: 12 }` enthält, der Character aber keinen Skill "Bergbau" hat
- **THEN** wird `{ skillId: "Bergbau", value: 12, pp: 0 }` zu `skills` hinzugefügt

#### Vorhandener Bergbau wird nicht überschrieben

- **WHEN** `autoFix()` für einen Zwerg-Charakter aufgerufen wird und "Bergbau" bereits mit FW 14 existiert
- **THEN** bleibt der Wert 14 unverändert

#### race.skillBonuses wird auf race.skill addiert

- **WHEN** ein Zwerg-Character `autoFix()` durchläuft, "Bergbau" fehlt, `race.skills` hat `{ skillId: "Bergbau", value: 12 }` und `race.skillBonuses` hat `{ "Bergbau": 2 }`
- **THEN** wird "Bergbau" mit FW 14 (= 12 + 2) ergänzt

#### Rasse ohne skills

- **WHEN** eine Rasse kein `skills[]`-Feld hat (z.B. Mensch)
- **THEN** `autoFix()` überspringt die race.skills-Schleife ohne Fehler

#### String-Zauber konvertieren

- **WHEN** `character.spells` Einträge als Strings enthält (z.B. `["Feuerball", "Blitz"]`)
- **THEN** autoFix() konvertiert sie zu `[{ spellId: "Feuerball", pp: 0 }, { spellId: "Blitz", pp: 0 }]`

### FormulaEngine — Initialisierung und Grundfunktion

Die `FormulaEngine` SHALL als zustandsloser Service (Singleton oder statische Methoden) implementiert sein. Sie parst Formel-Strings und evaluiert sie gegen einen Zahlen-Kontext.

Die Engine unterstützt:
- `bonus(X)`-Funktion für den M5-Fertigkeitsbonus (≤5=−2, ≤20=−1, ≤80=0, ≤95=+1, >95=+2)
- Standard-Operatoren: `+`, `-`, `*`, `/` (M5-Rundung: Math.floor pro Division)
- Klammerausdrücke
- Variablen aus dem Kontext

#### Engine evaluiert einfache Addition

- **WHEN** `engine.evaluate("Ko/10", { Ko: 20 })` aufgerufen wird
- **THEN** das Ergebnis ist 2 (nach M5-Rundung: `Math.floor(20/10)`)

#### Engine evaluiert bonus()-Funktion

- **WHEN** `engine.evaluate("bonus(Gs)", { Gs: 30 })` aufgerufen wird
- **THEN** das Ergebnis ist 0 (Gs=30 liegt im Bereich ≤80)

#### Engine evaluiert komplexe Formel

- **WHEN** `engine.evaluate("(St+Gw)/20 + AnB", { St: 20, Gw: 10, AnB: 2 })` aufgerufen wird
- **THEN** das Ergebnis ist `Math.floor(30/20) + 2` = `1 + 2` = 3

#### Engine evaluiert Formel mit mehreren Divisionen

- **WHEN** `engine.evaluate("Ko/10 + St/20", { Ko: 23, St: 17 })` aufgerufen wird
- **THEN** das Ergebnis ist `Math.floor(23/10) + Math.floor(17/20)` = `2 + 0` = 2

#### Engine wirft Fehler bei unbekannter Variable

- **WHEN** `engine.evaluate("Ko/10 + Foobar", { Ko: 20 })` aufgerufen wird
- **THEN** die Engine wirft einen Fehler mit Hinweis auf die unbekannte Variable "Foobar"

### FormulaEngine — Dice-Unterstützung

Die FormulaEngine SHALL Dice-Notation (`W%`, `nWm`) unterstützen für `evaluateRange()` (min/max/expected) und `evaluateExact()` (mit gespeichertem Wurf).

#### Würfel-Range berechnen

- **WHEN** `engine.evaluateRange("1W3 + 7", {})` aufgerufen wird
- **THEN** das Ergebnis ist `{ min: 8, max: 10, expected: 9 }`

#### Würfel mit exact-Wert

- **WHEN** `engine.evaluateExact("1W3 + 7", {}, 2)` aufgerufen wird
- **THEN** das Ergebnis ist `2 + 7` = 9

### FormulaEngine — Sicherheit

Die FormulaEngine SHALL keine dynamische Code-Auswertung (`eval`, `new Function`) verwenden. Die Implementierung verwendet einen Tokenizer + Recursive-Descent-Parser.

#### Parser lehnt ungültige Zeichen ab

- **WHEN** ein Formel-String Zeichen enthält, die nicht dem erlaubten Zeichensatz entsprechen (`^[0-9A-Za-z+\-*/().W%\s]+$`)
- **THEN** der Tokenizer wirft einen Fehler mit Positionsangabe

#### Variablen mit 'W' werden nicht als Würfel fehlinterpretiert

- **WHEN** ein Formel-String `bonus(Gw)` oder `bonus(Wk)` enthält
- **THEN** der Tokenizer erkennt `Gw` und `Wk` als Variablen, nicht als Würfelnotation

### CharacterLoadService — Orchestrierung

`CharacterLoadService` SHALL eine `load(id: string): Promise<{ character: Character; rules: RulesData; issues: ValidationResult }>`-Methode bereitstellen, die folgende Kette ausführt:

1. Rules laden: `new RulesLoader().load()`
2. Character laden: `characterStorage.load(id)` → durchläuft `migrate()`
3. autoFix: `CharacterValidator.autoFix(migrated, rules)`
4. validate: `CharacterValidator.validate(fixed, rules)`
5. Rückgabe des fixierten Characters, Rules und ValidationResult

Der Service SHALL als Singleton exportiert werden.

**Erweiterung**: `load()` SHALL nach `autoFix()` prüfen, ob Änderungen vorgenommen wurden (`applied.length > 0`). Wenn ja, SHALL der gefixte Character sofort in IndexedDB gespeichert werden (`characterStorage.save(fixed)`).

Der Service SHALL dabei keine `updatedAt`-Änderung vornehmen — autoFix verändert den Timestamp nicht, und `save()` speichert das Objekt wie übergeben.

**WICHTIG**: `autoFix()` SHALL `race.skills[]` VOR `innateSkills[]` verarbeiten, damit rassen-spezifische Werte Vorrang vor universellen Defaults haben.

#### Character laden mit autoFix und validate

- **WHEN** `CharacterLoadService.load("abc-123")` aufgerufen wird und in den Rules `innateSkills` definiert sind
- **THEN** der zurückgegebene Character ist autoFix-durchlaufen, issues enthält das validate-Ergebnis

#### Character nicht gefunden

- **WHEN** `CharacterLoadService.load("nicht-vorhanden")` aufgerufen wird
- **THEN** der Service gibt `{ character: null, ... }` zurück oder wirft einen Fehler (analog zu `CharacterStorage.load()`)

### correctIssues() — Fehlende InnateSkills & Rassen-Skills ergänzen

`correctIssues(character, rules)` SHALL zusätzlich zu den bestehenden Korrekturen auch fehlende Rassen-Skills und InnateSkills ergänzen. **Rassen-Skills werden VOR den universellen InnateSkills verarbeitet**, damit rassen-spezifische Werte Vorrang vor universellen Defaults haben.

Logik-Reihenfolge:
1. Rasse aus `rules.races` anhand `character.raceId` ermitteln
2. `knownIds = Set aller bereits im Character vorhandenen Skill-IDs`
3. **Zuerst**: Für jeden Eintrag in `race.skills[]` prüfen, ob `character.skills` den Skill bereits enthält. Wenn nicht: Skill mit FW = `rs.value + (race.skillBonuses[skillId] ?? 0)` hinzufügen, `pp: 0`
4. **Dann**: Für jeden Eintrag in `rules.universalRules.innateSkills[]` prüfen, ob `character.skills` den Skill bereits enthält (oder durch Schritt 3 hinzugefügt wurde). Wenn nicht und condition erfüllt: Skill mit berechnetem FW hinzufügen, `pp: 0`
5. **Danach**: Abweichende Rassen-Skill-FWs korrigieren (`RACE_SKILL_VALUE_MISMATCH`): vorhandene Rassen-Skills mit falschem FW auf erwarteten Wert setzen (`rs.value + race.skillBonuses[skillId] ?? 0`), inkl. `applied`-Eintrag mit `action: 'fix_racial_skill_value'`

correctIssues() SHALL vorhandene Skills (ausser Rassen-Skills mit falschem FW) weder überschreiben noch deren FW ändern.

#### Fehlenden Raufen-Skill ergänzen

- **WHEN** `correctIssues()` aufgerufen wird und der Character keinen Skill "Raufen" hat, aber `innateSkills` einen Eintrag für "Raufen" enthält
- **THEN** wird `{ skillId: "Raufen", value: <berechneter FW>, pp: 0 }` zu `skills` hinzugefügt

#### Vorhandenen Skill nicht überschreiben

- **WHEN** `correctIssues()` aufgerufen wird und der Character "Raufen" bereits mit FW 8 hat
- **THEN** bleibt der Wert unverändert

#### Rassen-Wert gewinnt über universellen Default (Nachtsicht Elf)

- **WHEN** `correctIssues()` für einen Elfen-Charakter aufgerufen wird, `race.skills` den Eintrag `{ skillId: "Nachtsicht", value: 2 }` enthält, UND `innateSkills` einen Eintrag `{ id: "Nachtsicht", defaultFw: 0 }` definiert, der Character aber keinen Skill "Nachtsicht" hat
- **THEN** wird `{ skillId: "Nachtsicht", value: 2, pp: 0 }` zu `skills` hinzugefügt (rassen-spezifischer Wert 2, nicht 0)

#### Rassen-Bonus wird auf race.skill addiert

- **WHEN** ein Zwerg-Character `correctIssues()` durchläuft, "Bergbau" fehlt, `race.skills` hat `{ skillId: "Bergbau", value: 12 }` und `race.skillBonuses` hat `{ "Bergbau": 2 }`
- **THEN** wird "Bergbau" mit FW 14 (= 12 + 2) ergänzt

#### correctIssues() korrigiert abweichenden Rassen-Skill-FW

- **WHEN** `correctIssues()` aufgerufen wird und ein Rassen-Skill einen von der Rassendefinition abweichenden FW hat
- **THEN** wird der FW auf den erwarteten Wert gesetzt (`rs.value + race.skillBonuses[skillId] ?? 0`)
- **AND** der `applied`-Eintrag enthält `action: 'fix_racial_skill_value'`, `target: rs.skillId`, `description` mit altem und neuem FW
- **AND** eine erneute `validate()` nach `correctIssues()` meldet KEIN `RACE_SKILL_VALUE_MISMATCH` mehr für diesen Skill

#### correctIssues nach autoFix ist idempotent

- **WHEN** `autoFix()` bereits alle fehlenden Rassen-Skills und InnateSkills ergänzt hat und danach `correctIssues()` aufgerufen wird
- **THEN** `correctIssues()` ergänzt keine weiteren Skills (alle sind bereits vorhanden)

#### Rasse ohne skills-Feld

- **WHEN** eine Rasse kein `skills[]`-Feld hat (z.B. Mensch)
- **THEN** überspringt `correctIssues()` die Rassen-Skills-Ergänzung ohne Fehler

### correctIssues() — 3-Quellen-Lookup für Formel-Korrektur

`correctIssues()` SHALL Formel-IDs in allen drei Quellen (`boni`, `properties`, `personalia`) suchen — nicht nur in `boni`.

#### repair-B-ausserhalb-range-in-properties

- **GIVEN** `character.properties.B = 18` und die Formel `4W3 + 16` (Range [20, 28])
- **WHEN** `correctIssues(character, rules)` ausgeführt wird
- **THEN** wird `character.properties.B` auf `24` gesetzt (`Math.floor(range.expected)`)
- **AND** es wird ein Fix-Eintrag mit `action: "correct_bonus"`  und `target: "B"` gemeldet

#### repair-B-in-range-keine-korrektur

- **GIVEN** `character.properties.B = 24` und die Formel `4W3 + 16` (Range [20, 28])
- **WHEN** `correctIssues(character, rules)` ausgeführt wird
- **THEN** wird kein Fix-Eintrag für `B` gemeldet

#### race-bonus-wird-auf-properties-angewandt

- **GIVEN** die Rasse hat `propertyBonus` für `B` mit `mode: 'add'` und `value: 2`
- **GIVEN** `character.properties.B = 26` (Formel 24 + Rasse 2)
- **WHEN** `correctIssues(character, rules)` ausgeführt wird
- **THEN** bleibt `character.properties.B = 26` (keine Abweichung)

### CharacterEditView — Live-Validierung bei Rasse/Klassen-Wechsel

Die `CharacterEditView` SHALL bei Änderung der Rasse (`raceId`) oder Klasse (`typeId`) durch den User eine Validierung des aktuellen Formularstands auslösen. Die Validierung SHALL das Formular NICHT verändern — sie dient nur der Information.

Implementierung: `@change`-Handler auf den `<select>`-Elementen, die `characterValidator.validate(buildCharacter(), rules)` aufrufen und das Ergebnis in `validationResult.value` setzen.

Der Handler SHALL vorzeitig abbrechen, wenn `raceId` oder `typeId` nicht gesetzt sind.

#### Rasse geändert — Validierung zeigt Fehler

- **WHEN** ein User im Create-Formular die Rasse wechselt und `characterValidator.validate()` einen `PROPERTY_OUT_OF_RANGE`-Fehler meldet
- **THEN** wird `validationResult.value` mit dem Fehler gesetzt
- **AND** der Fehler wird im Validation-Banner angezeigt

#### Klasse geändert — Validierung zeigt Warnungen

- **WHEN** ein User im Create-Formular die Klasse wechselt und `characterValidator.validate()` einen `BONUS_FORMULA_MISMATCH`-Warning meldet
- **THEN** wird `validationResult.value` mit dem Warning gesetzt
- **AND** das Warning wird im Validation-Banner angezeigt

#### Handler bricht bei fehlender Klasse ab

- **WHEN** `raceId` gesetzt wird während `typeId` noch leer ist (z.B. beim fillForm())
- **THEN** der `@change`-Handler bricht vor `validate()` ab
- **AND** `validationResult.value` bleibt unverändert

#### Handler verändert keine Formularfelder

- **WHEN** der `@change`-Handler durchläuft und `validate()` einen Fehler meldet
- **THEN** bleiben `skills.value`, `properties.*`, `boni.*` und alle anderen Formularfelder unverändert
- **AND** nur `validationResult.value` wird aktualisiert


