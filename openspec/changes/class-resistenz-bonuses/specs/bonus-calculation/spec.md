## MODIFIED Requirements

### Requirement: Python-Script erzeugt propertyBonuses aus XML

`tools/scripts/parse_EVA_kodex.py` MUSS beim Parsen einer Rasse das XML-Attribut `Resistenz` aus `Dynprops` auslesen und in `propertyBonuses` übersetzen. Das XML-Attribut `Resistenz="N"` erzeugt zwei Einträge:
- `{ id: "ResBk", value: N, mode: "set" }`
- `{ id: "ResBg", value: N, mode: "set" }`

Das XML-Attribut `LPbonus="N"` wird bereits als `race.lpModifier` gespeichert (keine Änderung nötig).

Zusätzlich MUSS `parse_klasse()` aus den XML-Attributen `ZAU` und `KAE` in den Dynprops `propertyBonuses` mit `mode: "add"` ableiten:
- Wenn `ZAU="true"` und `KAE` NICHT `"true"`: `{ id: "ResBk", value: 2, mode: "add" }` und `{ id: "ResBg", value: 2, mode: "add" }`
- Wenn `KAE="true"`: `{ id: "ResBk", value: 1, mode: "add" }`

#### Scenario: Resistenz im XML vorhanden (Rasse)

- **WHEN** eine Rasse in der EVA-XML das Attribut `Resistenz="4"` in `Dynprops` hat
- **THEN** enthält der generierte Rasse-Eintrag `propertyBonuses` mit `{ id: "ResBk", value: 4, mode: "set" }` und `{ id: "ResBg", value: 4, mode: "set" }`

#### Scenario: Resistenz im XML nicht vorhanden (Rasse)

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
