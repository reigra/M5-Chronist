## 1. FormulaEngine Tokenizer — W% als DICE-Token

- [x] 1.1 In `FormulaEngine.ts` nach `raw = input.slice(start, i)` (Zeile ~150): Check ob `raw` auf `W` endet und nächstes Zeichen `%` ist → `%` mitkonsumieren, `DICE`-Token emittieren
- [x] 1.2 `evaluateDiceExpected()` prüfen: `W%` gibt `50.5` zurück (bereits vorhanden Zeile 300)
- [x] 1.3 Test: `evaluate("W%", {})` wirft keinen Fehler und gibt `50.5` (Erwartungswert) zurück
- [x] 1.4 Test: `evaluate("W% + 4*In/10 -20", { In: 50 })` gibt `50.5` zurück (50.5 + 20 - 20 = 50.5)

## 2. CharacterValidator — Range-Validierung für Dice-Formeln

- [x] 2.1 In `validateCategoryI()` Section "1. Bonus-Formeln prüfen": vor `evaluate()` prüfen ob `formula.allowsDice === true`
- [x] 2.2 Wenn `allowsDice`: `evaluateRange()` aufrufen, Rassen-/Typ-Boni auf min/max anwenden, `actual` gegen `[min, max]` prüfen
- [x] 2.3 Bei Abweichung: Issue mit `code: 'DICE_VALUE_OUT_OF_RANGE'`, `severity: 'warning'`, `actual`, `expected: Math.floor(range.expected)` pushen
- [x] 2.4 Sonst (kein Dice): bestehende `evaluate()`-Logik unverändert lassen
- [x] 2.5 Verify: `validateCategoryH()` wirft keinen `FORMULA_ERROR` mehr für pA/Wk/Au-Formeln
- [x] 2.6 3-Quellen-Lookup: Guard `if (!(id in character.boni)) continue` ersetzen durch `actual = boni[id] ?? properties[id] ?? personalia[id]`; dynamischen `path` (boni/properties/personalia) im Issue setzen

## 3. FormulaEngine — evaluateRange() Regex-Fix

- [x] 3.1 In `evaluateRange()` Regex `/(\d*)W(\d+|%)/gi` verwenden, dice-count korrekt erfassen: `4W3` → `4*3` (nicht `43`); min/max/expected für alle Dice-Muster (`4W3`, `W6`, `W%`, `2W%`) korrekt berechnen

## 4. CharacterValidator — correctIssues() 3-Quellen-Lookup

- [x] 4.1 In `correctIssues()` Formula-Loop (Zeile 239): Guard `if (!(id in boni)) continue` ersetzen durch 3-Quellen-Lookup über boni → properties → personalia; Dice-Formeln auf `Math.floor(range.expected)` setzen; nicht-deterministische Formeln auf `evaluate()` setzen
- [x] 4.2 In `correctIssues()` Rassen-Bonus-Loop (Zeile 263): `if (!(key in boni)) continue` ersetzen durch 3-Quellen-Lookup; Bonus auf die korrekte Quelle anwenden
- [x] 4.3 In `correctIssues()` Typ-Bonus-Loop (Zeile 277): Selbe Änderung wie 4.2 für den Typ
