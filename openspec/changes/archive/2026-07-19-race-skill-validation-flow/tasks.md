## 1. CharacterValidator — MISSING_RACIAL_SKILL severity auf error

- [x] 1.1 In `validateCategoryC()` die severity von `MISSING_RACIAL_SKILL` von `'warning'` auf `'error'` ändern (Zeile ~619, `src/services/CharacterValidator.ts`)
- [x] 1.2 Prüfen: `saveCharacter()` in `CharacterEditView.vue` blockiert Save bei `issues.hasErrors === true` — kein weiterer Änderungsbedarf im Save-Flow

## 2. CharacterValidator — correctIssues() um race.skills erweitern (VOR innateSkills)

- [x] 2.1 In `correctIssues()` Section 2c (Rassen-Skills) **VOR** Section 2b (InnateSkills) einfügen: `race.skills[]` iterieren, fehlende Einträge mit FW = `rs.value + (race.skillBonuses[skillId] ?? 0)` und `pp: 0` ergänzen
- [x] 2.2 `knownIds = new Set(skills.map(s => s.skillId))` **einmalig vor beiden Sections** initialisieren
- [x] 2.3 `applied.push(...)` mit `action: 'add_racial_skill'` für jeden ergänzten Skill
- [x] 2.4 Edge-Case: Rasse ohne `skills[]`-Feld (z.B. Mensch) → `if (fixRace?.skills)` schützt vor Fehler

## 2b. CharacterValidator — autoFix() Reihenfolge umkehren (race.skills VOR innateSkills)

- [x] 2.5 In `autoFix()` Section 1b (Rassen-Skills) **VOR** Section 1 (InnateSkills) verschieben: `race.skills[]` iterieren vor `innateSkills[]`
- [x] 2.6 `knownIds` wird vor Section 1b initialisiert (bereits vorhanden in Zeile ~120)

## 3. CharacterValidator — RACE_SKILL_VALUE_MISMATCH Validierung

- [x] 3.1 In `validateCategoryC()` nach `MISSING_RACIAL_SKILL` Loop: für jeden Skill in `race.skills[]`, der im Character existiert, prüfen ob `cs.value === rs.value + race.skillBonuses[skillId]`
- [x] 3.2 Bei Abweichung: Issue mit `code: 'RACE_SKILL_VALUE_MISMATCH'`, `severity: 'warning'`, `expected`/`actual` setzen
- [x] 3.3 In `correctIssues()` Section 2d: vorhandene Rassen-Skills mit abweichendem FW auf erwarteten Wert setzen (`rs.value + race.skillBonuses[skillId] ?? 0`)
- [x] 3.4 `applied.push(...)` mit `action: 'fix_racial_skill_value'`, `target`, `description: 'Rassen-Fertigkeit "${id}" von FW ${cs.value} auf ${expected} korrigiert'`
- [x] 3.5 Verify: nach `correctIssues()`-Durchlauf meldet `validate()` kein `RACE_SKILL_VALUE_MISMATCH` mehr

## 4. CharacterLoadService — autoFix persistieren

- [x] 4.1 In `CharacterLoadService.load()` nach `autoFix()`: `if (applied.length > 0) { await characterStorage.save(fixed) }` einfügen
- [x] 4.2 `characterStorage` import prüfen (bereits vorhanden in Zeile 5)

## 5. CharacterEditView — @change-Handler auf Rasse/Klasse

- [x] 5.1 Funktion `onRaceOrTypeChanged()` definieren: `buildCharacter()` + `characterValidator.validate(temp, rules.value)` + `validationResult.value = issues`
- [x] 5.2 `characterValidator` import prüfen (bereits importiert als `characterValidator` in Zeile 10)
- [x] 5.3 `@change="onRaceOrTypeChanged"` auf beide `<select>`-Elemente (Rasse Zeile ~579, Klasse Zeile ~586)
- [x] 5.4 Guard: Handler bricht früh ab wenn `!rules.value || !raceId.value || !typeId.value`
