## 1. Type-Definitionen ändern

- [ ] 1.1 In `src/types/CharacterType.ts` `propertyBonuses`-Typ um `mode: 'add' | 'set'` ergänzen
- [ ] 1.2 In `src/types/Race.ts` `propertyBonuses`-Typ um `mode: 'add' | 'set'` ergänzen
- [ ] 1.3 TypeScript-Compiler prüfen (`npm run build`) — muss durchlaufen

## 2. Validator: autoFix()

- [ ] 2.1 In `CharacterValidator.autoFix()` nach Formel-Block: Rasse-lookup + Rasse-Bonus anwenden (set/add)
- [ ] 2.2 Typ-lookup + Typ-Bonus anwenden (set/add) — nach Rasse
- [ ] 2.3 `ctx` nach jedem Bonus aktualisieren (damit nachfolgende Formeln den korrigierten Wert sehen)

## 3. Validator: correctIssues()

- [ ] 3.1 In `CharacterValidator.correctIssues()` nach der Formel-Schleife: Rasse-Bonus anwenden
- [ ] 3.2 Typ-Bonus anwenden (nach Rasse)
- [ ] 3.3 `ctx` und `boni` nach jedem Bonus aktualisieren

## 4. Validator: validateCategoryI()

- [ ] 4.1 In `CharacterValidator.validateCategoryI()` den Sollwert inkl. Rasse/Typ-Boni berechnen
- [ ] 4.2 Vergleich gegen `character.boni` mit dem korrigierten Sollwert durchführen

## 5. Python-Script anpassen (Daten-Generierung)

- [ ] 5.1 In `tools/scripts/parse_EVA_kodex.py` in `parse_rasse()`: nach `lp_bonus`-Block (`resistenz = attr(dp, 'Resistenz')`) ergänzen
- [ ] 5.2 Bei vorhandenem `resistenz`: `propertyBonuses`-Array mit zwei Einträgen erzeugen: `{ id: "ResBk", value: N, mode: "set" }` und `{ id: "ResBg", value: N, mode: "set" }`
- [ ] 5.3 `race['propertyBonuses']` nur setzen, wenn `resistenz`-Wert vorhanden ist
- [ ] 5.4 Script ausführen: `python tools/scripts/parse_EVA_kodex.py tools/rules/EVA_Kodex.xml tools/rules/eva_kodex.json` — muss ohne Fehler durchlaufen

## 6. Build-Test

- [ ] 6.1 `npm run build` ausführen — typecheck + build müssen durchlaufen
