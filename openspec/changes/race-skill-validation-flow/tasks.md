## 1. CharacterValidator — MISSING_RACIAL_SKILL severity auf error

- [ ] 1.1 In `validateCategoryC()` die severity von `MISSING_RACIAL_SKILL` von `'warning'` auf `'error'` ändern (Zeile ~619, `src/services/CharacterValidator.ts`)
- [ ] 1.2 Prüfen: `saveCharacter()` in `CharacterEditView.vue` blockiert Save bei `issues.hasErrors === true` — kein weiterer Änderungsbedarf im Save-Flow

## 2. CharacterValidator — correctIssues() um race.skills ergänzen

- [ ] 2.1 In `correctIssues()` nach Section 2b (fehlende InnateSkills) eine neue Section 2c für Rassen-Skills einfügen: `race.skills[]` iterieren, fehlende Einträge mit FW = `rs.value + (race.skillBonuses[skillId] ?? 0)` und `pp: 0` ergänzen
- [ ] 2.2 Sicherstellen, dass `knownIds` aus den bereits vorhandenen Skills korrekt befüllt ist (wird in Section 2b bereits gemacht — 2c nutzt dasselbe Set)
- [ ] 2.3 `applied.push(...)` mit `action: 'add_racial_skill'` für jeden ergänzten Skill
- [ ] 2.4 Edge-Case: Rasse ohne `skills[]`-Feld (z.B. Mensch) → `if (fixRace?.skills)` schützt vor Fehler

## 3. CharacterLoadService — autoFix persistieren

- [ ] 3.1 In `CharacterLoadService.load()` nach `autoFix()`: `if (applied.length > 0) { await characterStorage.save(fixed) }` einfügen
- [ ] 3.2 `characterStorage` import prüfen (bereits vorhanden? Falls nicht, import hinzufügen)

## 4. CharacterEditView — @change-Handler auf Rasse/Klasse

- [ ] 4.1 Funktion `onRaceOrTypeChanged()` definieren: `buildCharacter()` + `characterValidator.validate(temp, rules.value)` + `validationResult.value = issues`
- [ ] 4.2 `characterValidator` import prüfen (bereits importiert als `characterValidator` in Zeile 10)
- [ ] 4.3 `@change="onRaceOrTypeChanged"` auf beide `<select>`-Elemente (Rasse Zeile ~579, Klasse Zeile ~586)
- [ ] 4.4 Guard: Handler bricht früh ab wenn `!rules.value || !raceId.value || !typeId.value`
