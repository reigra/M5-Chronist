## Why

`Race.propertyBonuses` und `CharacterType.propertyBonuses` existieren als Datenfelder, werden aber nirgendwo ausgewertet. Rassen- und typabhängige Bonus-Modifikatoren (z.B. Kämpfer +1 ResBk, Zwerg ResBk = 5) müssen ins Formelsystem eingebunden werden, damit sie bei Validierung und Korrektur berücksichtigt werden.

## What Changes

- **BREAKING** `propertyBonuses`-Einträge bekommen ein neues Pflichtfeld `mode: 'add' | 'set'` — definiert, ob der Bonus additiv (`add`) oder ersetzend (`set`) wirkt.
- `CharacterValidator.autoFix()` wendet Rassen- und Typ-Boni auf Default-Boni an.
- `CharacterValidator.correctIssues()` wendet Rassen- und Typ-Boni nach Formelberechnung an.
- `CharacterValidator.validateCategoryI()` bezieht Rassen- und Typ-Boni in den Sollwert-Vergleich ein.
- `tools/scripts/parse_EVA_kodex.py` wird erweitert: XML-Attribut `Resistenz` auf Rassen erzeugt `propertyBonuses` mit `mode: "set"` für ResBk/ResBg.

## Capabilities

### New Capabilities
- `bonus-calculation`: Rassen- und typbasierte Bonusmodifikation als Teil der Charakter-Berechnung. Definiert die Evaluationsreihenfolge (Formel → Rasse → Typ) und das mode-System (add/set).

### Modified Capabilities
- _(keine — es gibt noch keine bestehenden specs für Boni)_

## Impact

- `src/types/Race.ts` — `propertyBonuses`-Typ ändern (mode required)
- `src/types/CharacterType.ts` — `propertyBonuses`-Typ ändern (mode required)
- `src/services/CharacterValidator.ts` — 3 Stellen (autoFix, correctIssues, validateCategoryI)
- `tools/scripts/parse_EVA_kodex.py` — `Resistenz`-Attribut in `propertyBonuses` übersetzen
- Kein bestehender Code nutzt `propertyBonuses` → kein Migration nötig
