## Purpose

Define how property bonuses from race and character type modifiers are evaluated and applied during character validation, including add/set mode semantics and evaluation order.

## ADDED Requirements

### Requirement: Rassen- und Typ-Bonus-Modifikatoren

Das System SHALL `propertyBonuses` aus `Race` und `CharacterType` auswerten und in die Bonus-Berechnung einbeziehen.

Jeder Bonus-Eintrag MUSS ein Pflichtfeld `mode: 'add' | 'set'` enthalten, das definiert, ob der Bonus additiv wirkt (`add`) oder das bisherige Ergebnis ersetzt (`set`).

Die Evaluationsreihenfolge MUSS sein: Formel → Rasse → Typ. Der Typ-Bonus gewinnt also bei Konflikten.

#### Scenario: Kämpfer erhält +1 ResBk (additiv)

- **WHEN** ein Charakter den Typ "Kr" (Krieger, category "Kämpfer") hat und `Kr.propertyBonuses` enthält `{ id: "ResBk", value: 1, mode: "add" }`
- **THEN** wird ResBk = Formel-Ergebnis + 1 gesetzt

#### Scenario: Zwerg erhält festes ResBk (ersetzend)

- **WHEN** ein Charakter die Rasse "berggnom" hat und `berggnom.propertyBonuses` enthält `{ id: "ResBk", value: 5, mode: "set" }`
- **THEN** wird ResBk = 5 gesetzt (Formel-Ergebnis wird verworfen)

#### Scenario: Kämpfer-Zwerg kombiniert beide

- **WHEN** ein Charakter die Rasse "berggnom" (set ResBk = 5) und den Typ "Kr" (add ResBk +1) hat
- **THEN** wird ResBk = 5 + 1 = 6 gesetzt
- **AND** die Reihenfolge ist: Formel → Rasse (set 5) → Typ (add 1)

#### Scenario: autoFix ergänzt nur fehlende Default-Boni (ohne Modifikatoren)

- **WHEN** `characterValidator.autoFix()` aufgerufen wird und der Charakter hat Rasse/Typ mit `propertyBonuses`
- **THEN** werden die Default-Boni (0) gesetzt
- **AND** Rasse/Typ-Modifikatoren werden NICHT angewandt (autoFix ändert keine vorhandenen Werte)

#### Scenario: correctIssues überschreibt Boni inkl. Modifikatoren

- **WHEN** `characterValidator.correctIssues()` aufgerufen wird
- **THEN** werden alle Boni neu berechnet (Formel → Rasse → Typ) und in `character.boni` überschrieben

#### Scenario: validateCategoryI vergleicht inkl. Modifikatoren

- **WHEN** `characterValidator.validateCategoryI()` prüft, ob `character.boni` mit den Sollwerten übereinstimmen
- **THEN** werden Rasse/Typ-Modifikatoren in den Sollwert eingerechnet

#### Scenario: Typ ohne propertyBonuses

- **WHEN** ein Charakter einen Typ ohne `propertyBonuses` hat
- **THEN** wird kein Typ-Bonus angewandt
- **AND** die Formel und der Rassen-Bonus bleiben unverändert

#### Scenario: Rasse ohne propertyBonuses

- **WHEN** ein Charakter eine Rasse ohne `propertyBonuses` hat
- **THEN** wird kein Rassen-Bonus angewandt
- **AND** das Formel-Ergebnis bleibt bestehen

### Requirement: TypeScript-Typ-Änderung

`Race.propertyBonuses` und `CharacterType.propertyBonuses` MÜSSEN von `Array<{ id: string; value: number }>` auf `Array<{ id: string; value: number; mode: 'add' | 'set' }>` geändert werden.

#### Scenario: mode ist required

- **WHEN** ein Rulebook-JSON `propertyBonuses` ohne `mode`-Feld enthält
- **THEN** schlägt der TypeScript-Compiler fehl (typecheck error)

### Requirement: Python-Script erzeugt propertyBonuses aus XML

`tools/scripts/parse_EVA_kodex.py` MUSS beim Parsen einer Rasse das XML-Attribut `Resistenz` aus `Dynprops` auslesen und in `propertyBonuses` übersetzen. Das XML-Attribut `Resistenz="N"` erzeugt zwei Einträge:
- `{ id: "ResBk", value: N, mode: "set" }`
- `{ id: "ResBg", value: N, mode: "set" }`

Das XML-Attribut `LPbonus="N"` wird bereits als `race.lpModifier` gespeichert (keine Änderung nötig).

Zusätzlich MUSS `parse_klasse()` aus den XML-Attributen `ZAU` und `KAE` in den Dynprops `propertyBonuses` mit `mode: "add"` ableiten:
- Wenn `ZAU="true"` und `KAE` NICHT `"true"`: `{ id: "ResBk", value: 2, mode: "add" }` und `{ id: "ResBg", value: 2, mode: "add" }`
- Wenn `KAE="true"`: `{ id: "ResBk", value: 1, mode: "add" }`

#### Scenario: Resistenz im XML vorhanden

- **WHEN** eine Rasse in der EVA-XML das Attribut `Resistenz="4"` in `Dynprops` hat
- **THEN** enthält der generierte Rasse-Eintrag `propertyBonuses` mit `{ id: "ResBk", value: 4, mode: "set" }` und `{ id: "ResBg", value: 4, mode: "set" }`

#### Scenario: Resistenz im XML nicht vorhanden

- **WHEN** eine Rasse in der EVA-XML kein `Resistenz`-Attribut in `Dynprops` hat
- **THEN** enthält der generierte Rasse-Eintrag kein `propertyBonuses`

#### Scenario: Zauberer erhält +2 ResBk/+2 ResBg

- **WHEN** eine Klasse in der EVA-XML `ZAU="true"` und kein `KAE="true"` in `Dynprops` hat
- **THEN** enthält der generierte Typ-Eintrag `propertyBonuses` mit `{ id: "ResBk", value: 2, mode: "add" }` und `{ id: "ResBg", value: 2, mode: "add" }`

#### Scenario: Kämpfer erhält +1 ResBk

- **WHEN** eine Klasse in der EVA-XML `KAE="true"` in `Dynprops` hat
- **THEN** enthält der generierte Typ-Eintrag `propertyBonuses` mit `{ id: "ResBk", value: 1, mode: "add" }`

#### Scenario: KampfZauberer erhält nur +1 ResBk (kein ResBg)

- **WHEN** eine Klasse in der EVA-XML sowohl `ZAU="true"` als auch `KAE="true"` hat
- **THEN** enthält der generierte Typ-Eintrag `propertyBonuses` mit nur `{ id: "ResBk", value: 1, mode: "add" }`
- **AND** kein ResBg-Bonus (KAE hat Vorrang für die Beschränkung)

#### Scenario: Freie Klasse ohne Boni

- **WHEN** eine Klasse weder `ZAU="true"` noch `KAE="true"` hat
- **THEN** enthält der generierte Typ-Eintrag kein `propertyBonuses`
