## 1. FW-Berechnung extrahieren

- [x] 1.1 In `CharacterValidator`: private Methode `computeInnateFw(innate: InnateSkill, ctx, formulaMap, rules, skillBonuses, character): number` extrahieren (Formel/FormulaId/gradValues/defaultFw + skillBonuses)
- [x] 1.2 `autoFix()` nutzt `computeInnateFw()` statt Inline-Code

## 2. autoFix() um race.skills ergänzen

- [x] 2.1 In `autoFix()` NACH der innateSkills-Schleife: `race.skills[]` aus `rules.races[character.raceId]` abrufen
- [x] 2.2 Für jeden Eintrag in `race.skills[]` prüfen, ob `knownIds` die `skillId` bereits enthält
- [x] 2.3 Fehlende Skills mit `value = raceSkill.value + (race.skillBonuses[skillId] ?? 0)` und `pp: 0` an `skills` anhängen
- [x] 2.4 FixDescriptions für ergänzte Skills erzeugen

## 3. correctIssues() erweitern (Bonus)

- [x] 3.1 In `correctIssues()` nach Schritt 2: neue Schleife für fehlende InnateSkills (via `computeInnateFw()`)
- [x] 3.2 Condition-Prüfung (`hasSpells` etc.) + FixDescriptions

## 4. Build-Test

- [x] 4.1 `npm run build` — typecheck + build müssen durchlaufen
