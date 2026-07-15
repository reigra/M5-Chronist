## 1. Types — ValidationIssue, ValidationResult, FixResult

- [ ] 1.1 Neue Datei `src/types/CharacterValidation.ts` anlegen mit `ValidationIssue`-Interface (path, severity, code, message, expected?, actual?)
- [ ] 1.2 `ValidationResult`-Interface definieren (issues[], hasErrors, hasWarnings)
- [ ] 1.3 `FixDescription`-Interface definieren (action, target, description)
- [ ] 1.4 `FixResult`-Interface definieren (fixed: Character, applied: FixDescription[])

## 2. Rulebook-Schema erweitern — universalRules + race.skillBonuses

- [ ] 2.1 `UniversalFormula`-Interface in `src/types/Rules.ts` definieren (id, formula, allowsDice, description?)
- [ ] 2.2 `InnateSkill`-Interface in `src/types/Rules.ts` definieren (id, formula?, formulaId?, gradValues?, defaultFw, stacked?, baseSkillId?, condition?)
- [ ] 2.3 `UniversalRules`-Interface in `src/types/Rules.ts` definieren (formulas[], innateSkills[])
- [ ] 2.4 `RulebookData` um optionales `universalRules?: UniversalRules` erweitern
- [ ] 2.5 `Race`-Interface um optionales `skillBonuses?: Record<string, number>` erweitern
- [ ] 2.6 `RulesData`-Interface um `universalRules: UniversalRules` erweitern (Default: leere Arrays)
- [ ] 2.7 Merge-Logik in `RulesStorage.loadActive()` ergänzen: Initialisierung + mergeById für formulas[] und innateSkills[]

## 3. FormulaEngine — Recursive-Descent-Parser

- [ ] 3.1 Neue Datei `src/services/FormulaEngine.ts` anlegen
- [ ] 3.2 Tokenizer implementieren: Formel-String in Token-Array zerlegen (Zahlen, Variablen, Operatoren, Klammern, Dice)
- [ ] 3.3 Recursive-Descent-Parser implementieren: parseFormel → parseTerm → parseFaktor
- [ ] 3.4 M5-Rundungsregel implementieren: Math.floor pro `/`-Operator
- [ ] 3.5 Dice-Unterstützung: `evaluateRange()` (min/max/expected), `evaluateExact()` (mit gespeichertem Wurf)
- [ ] 3.6 Fehlerbehandlung: unbekannte Variable → Fehler mit Positionsangabe
- [ ] 3.7 Sicherheits-Validierung: unerlaubte Zeichen abweisen
- [ ] 3.8 FormulaEngine als Singleton exportieren

## 4. CharacterValidator — validate() + autoFix()

- [ ] 4.1 Neue Datei `src/services/CharacterValidator.ts` anlegen
- [ ] 4.2 `validate(character, rules): ValidationResult` implementieren — Kategorie A: Struktur & Referenzen
- [ ] 4.3 validate Kategorie B implementieren — Eigenschaften innerhalb Rassen-Restriktionen
- [ ] 4.4 validate Kategorie C implementieren — Fertigkeiten (baseValue, maxValue, innateSkills, baseSkillId, PP)
- [ ] 4.5 validate Kategorie D implementieren — Zauber (spellCosts, unknown spells)
- [ ] 4.6 validate Kategorie E implementieren — EP/Gold (EP_EXCEEDS_ES, NEGATIVE_GOLD)
- [ ] 4.7 validate Kategorie F implementieren — Boni (BONUS_VALUE_SUSPICIOUS)
- [ ] 4.8 validate Kategorie G implementieren — Grad-abhängige Skills (GRAD_SKILL_VALUE_MISMATCH) inklusive `lookupGradValue()`
- [ ] 4.9 validate Kategorie H implementieren — Formelfehler (FORMULA_ERROR) via FormulaEngine
- [ ] 4.10 `autoFix(character, rules): FixResult` implementieren: innateSkills iterieren, fehlende ergänzen, FW via FormulaEngine/gradValues/defaultFw, Race-Bonus addieren
- [ ] 4.11 autoFix: PP/Spell-Defaults setzen (pp: 0, String→Objekt-Konvertierung)
- [ ] 4.12 CharacterValidator als Singleton exportieren

## 5. CharacterLoadService — Orchestrator

- [ ] 5.1 Neue Datei `src/services/CharacterLoadService.ts` anlegen
- [ ] 5.2 `load(id: string)` implementieren: Rules → Storage.load() → autoFix → validate → Rückgabe
- [ ] 5.3 CharacterLoadService als Singleton exportieren

## 6. migrate() entschlacken

- [ ] 6.1 Innate-Skill-Block (Raufen, Trinken, Wahrnehmung, Hören, Nachtsicht, Riechen, Sechster Sinn, Sehen, Abwehr, Resistenz, Zaubern) aus `migrate()` in `CharacterService.ts` entfernen
- [ ] 6.2 Prüfen, ob alle Aufrufer von `storage.load()` jetzt via `CharacterLoadService.load()` gehen (sonst fehlen autoFix-Ergebnisse)

## 7. UI-Integration — Validate-Banner + Feld-Markierungen

- [ ] 7.1 In `CharacterView.vue`: nach `onMounted` validate aufrufen, Ergebnisse als Banner oben anzeigen ("3 Fehler, 2 Warnungen")
- [ ] 7.2 In `CharacterView.vue`: Icons bei Skills/Eigenschaften mit Issues (rot = error, gelb = warning)
- [ ] 7.3 In `CharacterEditView.vue`: validate nach `buildCharacter()` aufrufen, Feld-Markierungen unter Formularfeldern
- [ ] 7.4 In `HomeView.vue` Import-Dialog: validate-Ergebnis nach dem Parsen der JSON-Datei anzeigen

## 8. Rulebook-JSONs aktualisieren

- [ ] 8.1 `universalRules.formulas[]` für Bonus-Formeln (AusB, SchB, AnB, AbB, ZauB, ResBg, ResBk) in die Core-Rulebook-Quelle einpflegen
- [ ] 8.2 `universalRules.innateSkills[]` für alle Pflicht-Skills (Raufen, Trinken, Wahrnehmung, Hören, Nachtsicht, Riechen, Sechster Sinn, Sehen, Abwehr, Resistenz, Zaubern) in die Core-Rulebook-Quelle einpflegen
- [ ] 8.3 `race.skillBonuses` für Zwerg (+1 Raufen) und andere rassenspezifische Boni in die Core-Rulebook-Quelle einpflegen
