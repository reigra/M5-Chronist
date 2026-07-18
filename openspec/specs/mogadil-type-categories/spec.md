## Purpose

Define how `parse_Mogadil.py` derives character type category (Kämpfer/KampfZauberer/Zauberer) and ResBk/ResBg propertyBonuses from the Mogadil Lerntabellen PDF data for types that have no corresponding entry in the Kodex XML.

## Requirements

### Requirement: Mogadil-Typen erhalten Kategorie

`parse_Mogadil.py` SHALL für jeden Charaktertyp im `types[]`-Output eine `category` ableiten und setzen.

Die Kategorie MUSS sein: `"Kämpfer"`, `"KampfZauberer"`, oder `"Zauberer"`.

Die Ableitungsreihenfolge MUSS sein:
1. Wenn ein Hardcoded-Override für die Typ-ID existiert → diesen verwenden
2. Wenn `spellCosts` NICHT vorhanden oder leer → `"Kämpfer"`
3. Wenn `spellCosts` vorhanden und der "Waffen"-Kostenwert ≥ 40 → `"Zauberer"`
4. Sonst (spellCosts vorhanden, Waffen-Kosten < 40) → `"KampfZauberer"`

#### Scenario: Kämpfer ohne SpellCosts

- **WHEN** ein Typ (z.B. "Kr", Krieger) keine `spellCosts` im extrahierten Daten hat
- **THEN** wird `category` auf `"Kämpfer"` gesetzt

#### Scenario: Zauberer mit SpellCosts und Waffen-Kosten ≥ 40

- **WHEN** ein Typ (z.B. "Ma", Magier) `spellCosts` hat und der Waffen-Kostenwert ≥ 40 ist
- **THEN** wird `category` auf `"Zauberer"` gesetzt

#### Scenario: KampfZauberer mit SpellCosts und Waffen-Kosten < 40

- **WHEN** ein Typ (z.B. "Or", Ordenskrieger) `spellCosts` hat und der Waffen-Kostenwert < 40 ist
- **THEN** wird `category` auf `"KampfZauberer"` gesetzt

#### Scenario: Hardcoded override überschreibt Heuristik

- **WHEN** ein Typ (z.B. "PS", Priester Streiter) in der Override-Map als `"Zauberer"` eingetragen ist
- **THEN** wird `category` auf `"Zauberer"` gesetzt, unabhängig von Waffen-Kosten oder spellCosts

#### Scenario: Waffen-Kosten nicht gefunden

- **WHEN** der "Waffen"-Eintrag in den Fertigkeiten-Tabellen nicht existiert oder keine Kosten für den Typ enthält
- **THEN** wird der Typ als `"Kämpfer"` kategorisiert (sicherer Fallback)

### Requirement: Mogadil-Typen erhalten propertyBonuses

`parse_Mogadil.py` SHALL für jeden Charaktertyp `propertyBonuses` für ResBk/ResBg setzen, abgeleitet aus der Kategorie.

| Kategorie | propertyBonuses |
|-----------|-----------------|
| `"Kämpfer"` | `[{id: "ResBk", value: 1, mode: "add"}]` |
| `"KampfZauberer"` | `[{id: "ResBk", value: 1, mode: "add"}]` |
| `"Zauberer"` | `[{id: "ResBk", value: 2, mode: "add"}, {id: "ResBg", value: 2, mode: "add"}]` |

#### Scenario: Kämpfer erhält +1 ResBk

- **WHEN** ein Typ die Kategorie `"Kämpfer"` hat
- **THEN** enthält `propertyBonuses` `{id: "ResBk", value: 1, mode: "add"}`

#### Scenario: Zauberer erhält +2 ResBk und +2 ResBg

- **WHEN** ein Typ die Kategorie `"Zauberer"` hat
- **THEN** enthält `propertyBonuses` `{id: "ResBk", value: 2, mode: "add"}` und `{id: "ResBg", value: 2, mode: "add"}`

#### Scenario: Ausgabe-Format konsistent mit Kodex

- **WHEN** ein Typ aus Mogadil und derselbe Typ aus dem Kodex (z.B. "Kr") gemerged werden
- **THEN** haben beide `propertyBonuses` das gleiche Format (id/value/mode) — die Merge-Logik erkennt identische Werte und meldet keinen Konflikt
