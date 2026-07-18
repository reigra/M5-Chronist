## 1. Type-Definitionen ändern

- [x] 1.1 In `src/types/CharacterType.ts` `propertyBonuses`-Typ um `mode: 'add' | 'set'` ergänzen
- [x] 1.2 In `src/types/Race.ts` `propertyBonuses`-Typ um `mode: 'add' | 'set'` ergänzen
- [x] 1.3 TypeScript-Compiler prüfen (`npm run build`) — muss durchlaufen

## 2. Validator: autoFix()

- [x] 2.1 In `CharacterValidator.autoFix()` nach Formel-Block: Rasse-lookup + Rasse-Bonus anwenden (set/add)
- [x] 2.2 Typ-lookup + Typ-Bonus anwenden (set/add) — nach Rasse
- [x] 2.3 `ctx` nach jedem Bonus aktualisieren (damit nachfolgende Formeln den korrigierten Wert sehen)

## 3. Validator: correctIssues()

- [x] 3.1 In `CharacterValidator.correctIssues()` nach der Formel-Schleife: Rasse-Bonus anwenden
- [x] 3.2 Typ-Bonus anwenden (nach Rasse)
- [x] 3.3 `ctx` und `boni` nach jedem Bonus aktualisieren

## 4. Validator: validateCategoryI()

- [x] 4.1 In `CharacterValidator.validateCategoryI()` den Sollwert inkl. Rasse/Typ-Boni berechnen
- [x] 4.2 Vergleich gegen `character.boni` mit dem korrigierten Sollwert durchführen

## 5. Python-Script anpassen (Daten-Generierung)

- [x] 5.1 In `tools/scripts/parse_EVA_kodex.py` in `parse_rasse()`: nach `lp_bonus`-Block (`resistenz = attr(dp, 'Resistenz')`) ergänzen
- [x] 5.2 Bei vorhandenem `resistenz`: `propertyBonuses`-Array mit zwei Einträgen erzeugen: `{ id: "ResBk", value: N, mode: "set" }` und `{ id: "ResBg", value: N, mode: "set" }`
- [x] 5.3 `race['propertyBonuses']` nur setzen, wenn `resistenz`-Wert vorhanden ist
- [x] 5.4 Script ausführen: `python tools/scripts/parse_EVA_kodex.py tools/EVA/m5kodex.xml tools/rules/eva_kodex.json` — muss ohne Fehler durchlaufen

## 6. Build-Test

- [x] 6.1 `npm run build` ausführen — typecheck + build müssen durchlaufen
