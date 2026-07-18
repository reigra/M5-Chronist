## Why

`parse_EVA_kodex.py` erzeugt `propertyBonuses` nur für Rassen (aus `Resistenz`). Klassen/Typen erhalten keine Resistenz-Boni, obwohl die M5-Regeln kategorieabhängige Boni vorsehen: Zauberer erhalten +2 ResBk/+2 ResBg, Kämpfer und KampfZauberer erhalten +1 ResBk.

## What Changes

- `parse_klasse()` in `parse_EVA_kodex.py` wird erweitert: aus den XML-Attributen `ZAU` und `KAE` werden `propertyBonuses` mit `mode: "add"` abgeleitet.
  - `ZAU="true"` und `KAE` nicht `"true"` → `ResBk +2, ResBg +2`
  - `KAE="true"` → `ResBk +1`
- `tools/rules/eva_kodex.json` wird neu generiert (enthält dann Typen mit `propertyBonuses`).
- Keine Änderung am Validator — das mode-System arbeitet bereits korrekt.

## Capabilities

### Modified Capabilities
- `bonus-calculation`: Neue Datenquelle für Typ-Boni aus ZAU/KAE. Die Evaluationslogik (Formel → Rasse → Typ) bleibt unverändert.

## Impact

- `tools/scripts/parse_EVA_kodex.py` — `parse_klasse()` erhält `propertyBonuses`-Logik
- `tools/rules/eva_kodex.json` — wird neu generiert (Typen mit propertyBonuses)
