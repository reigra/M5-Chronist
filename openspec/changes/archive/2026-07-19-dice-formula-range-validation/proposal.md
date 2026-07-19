## Why

Der FormulaEngine-Tokenizer erkennt `W%` (W100-Würfel) nicht als Dice-Notation, sondern interpretiert `W` als Variablenname. Formeln wie `W% + 4*In/10 -20` (für `pA`, `Wk`, `Au` in `eva_kodex.json`) schlagen daher mit `FORMULA_ERROR` fehl.

Zusätzlich verwendet `validateCategoryI()` für alle Formeln den exakten Vergleich (`evaluate()` → Erwartungswert). Bei `allowsDice: true`-Formeln ist das falsch — ein gewürfelter Wert muss im Bereich `[min, max]` liegen, nicht exakt dem Erwartungswert entsprechen. Sonst werden legitime Würfelergebnisse fälschlich als `BONUS_FORMULA_MISMATCH` gemeldet.

## What Changes

- **Tokenizer-Fix**: `W%` wird als `DICE`-Token erkannt (analog zu `W6`, `3W10`), inkl. der kombinierten Form `nW%` (z.B. `2W%` für 2W100)
- **Range-Validierung in Category I**: Formeln mit `allowsDice: true` werden mit `evaluateRange()` auf `[min, max]` geprüft statt mit `evaluate()` auf exakte Übereinstimmung — bei Abweichung neuer Code `DICE_VALUE_OUT_OF_RANGE` (warning)
- **`validateCategoryH` bleibt unverändert**: Nach Tokenizer-Fix liefert `evaluate()` für `W%` den Erwartungswert 50.5 — Syntax-Check funktioniert dann korrekt

## Capabilities

### New Capabilities

- (none — keine neue Capability, nur Änderungen an bestehenden)

### Modified Capabilities

- `character-validation`: Neue Range-Validierung für dice-basierte Formeln in Category I; neuer Issue-Code `DICE_VALUE_OUT_OF_RANGE`

## Impact

| Datei | Änderung |
|-------|----------|
| `src/services/FormulaEngine.ts` | Tokenizer: `W%` / `nW%` als DICE-Token (1 Zeile + Regex-Erweiterung) |
| `src/services/CharacterValidator.ts` | `validateCategoryI()`: Branch für `allowsDice: true` → `evaluateRange()` + Range-Prüfung |
