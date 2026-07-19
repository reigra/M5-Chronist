## Context

Der FormulaEngine-Tokenizer unterscheidet aktuell drei alphanumerische Patterns:

| Pattern | Regex | Erkannt als |
|---------|-------|-------------|
| `W6`, `3W10` | `/^\d*W\d+$/i` | `DICE` ✅ |
| `123` | (nur Ziffern) | `NUMBER` ✅ |
| `Ko`, `In`, `bonus` | (restliche Buchstaben) | `VARIABLE` / `FUNCTION` ✅ |

`W%` wird von keinem Pattern gefangen: Der Regex `/^\d*W\d+$/i` erwartet Ziffern nach `W`; `%` ist kein Alphanumeric-Zeichen, also wird der Tokenizer bei `W` gestoppt und `%` als separater `PERCENT`-Token emittiert.

Zweitens verwendet `validateCategoryI()` für alle Bonus-Formeln `evaluate()` (exakter Vergleich). Bei Formeln mit `allowsDice: true` ist das semantisch falsch: Ein gewürfelter Wert ist nicht deterministisch, sondern liegt in einem Bereich `[min, max]`. Der exakte Vergleich erzeugt false positives.

## Goals / Non-Goals

**Goals:**
- Tokenizer erkennt `W%` und `nW%` als `DICE`-Token
- `validateCategoryI()` prüft dice-basierte Formeln per Range (`min ≤ actual ≤ max`) statt exaktem Match — für Werte in `boni`, `properties` und `personalia`
- Neuer Issue-Code `DICE_VALUE_OUT_OF_RANGE` (severity: `warning`)
- `validateCategoryH()` (Syntax-Check) funktioniert auch für Dice-Formeln — nach Tokenizer-Fix liefert `evaluate()` den Erwartungswert (z.B. 50.5 für `W%`)

**Non-Goals:**
- Kein neuer Score-Typ oder Datenmodell
- Kein UI (Banner/Button) — bestehender Validation-Banner zeigt Issue an

## Decisions

### D1: Tokenizer — `W%` als DICE-Token

**Ort**: `FormulaEngine.ts`, Zeile ~150, nach `raw = input.slice(start, i)` und **vor** dem bestehenden Dice-Regex `/^\d*W\d+$/i`.

**Code**:
```typescript
// W% / nW% als Würfel erkennen
if (hasLetters && /^\d*W$/i.test(raw) && i < input.length && input[i] === '%') {
  i++  // '%' mitkonsumieren
  tokens.push({ type: 'DICE', value: raw + '%', pos: start })
}
```

**Warum vor dem bestehenden Dice-Check?**: `W` ohne Ziffern matched `/^\d*W\d+$/i` nicht (weil `\d+` nach `W` fehlt), daher reicht ein `else if` vor dem `VARIABLE`-Zweig nicht — es muss **vor** der Variablen-Erkennung stehen. Am saubersten ist ein separater Check direkt nach `raw`.

**Warum funktioniert `evaluate()` dann für Dice?**: `parseFactor()` (Zeile 255-258) behandelt `DICE`-Tokens mit `evaluateDiceExpected()`:
```typescript
if (this.has('DICE')) {
  return this.evaluateDiceExpected(this.consume('DICE').value)
}
```
`evaluateDiceExpected('W%')` gibt `50.5` zurück. Der Parser läuft also sauber durch — `validateCategoryH` schlägt nicht mehr fehl.

### D2: Range-Validierung in `validateCategoryI()`

**Ort**: `CharacterValidator.ts`, `validateCategoryI()`, Section "1. Bonus-/Property-/Personalia-Formeln prüfen" (aktuell Zeilen 822-854).

**Problem**: Der bisherige Guard `if (!(id in character.boni)) continue` filtert alle Formeln aus, deren ID nicht in `character.boni` liegt. Aber dice-basierte Formeln wie `B` (Bewegungsweite, `4W3 + 16`) oder `pA`/`Wk`/`Au`/`LP`/`AP` liegen in `character.properties`, nicht in `boni`. Formeln für `gg` (Göttergunst) oder `alter` könnten in `character.personalia` liegen.

**Lösung**: 3-Quellen-Lookup über `boni` → `properties` → `personalia`:

```typescript
for (const formula of rules.universalRules?.formulas ?? []) {
  const id = formula.id

  // 3-Quellen-Lookup: boni → properties → personalia
  const actual = (character.boni as any)[id]
              ?? (character.properties as any)[id]
              ?? (character.personalia as any)?.[id]
  if (actual === undefined) continue

  // Quelle für path ermitteln
  const source: string = id in (character.boni ?? {}) ? 'boni'
                       : id in (character.properties ?? {}) ? 'properties'
                       : 'personalia'

  if (formula.allowsDice) {
    const range = formulaEngine.evaluateRange(formula.formula, ctx)
    // apply race/type propertyBonuses to min/max
    if (actual < range.min || actual > range.max) {
      → DICE_VALUE_OUT_OF_RANGE (warning)
    }
  } else {
    expected = formulaEngine.evaluate(formula.formula, ctx)
    // apply race/type propertyBonuses
    if (actual !== expected) { → BONUS_FORMULA_MISMATCH }
  }
}
```

**Warum 3 Quellen?**: M5-Formeln können verschiedene Zielgrössen definieren:
- `boni`: Kampf- und Fertigkeitsboni (AusB, SchB, AnB, AbB, ZauB, ResBg, ResBk)
- `properties`: Basis- und abgeleitete Eigenschaften (St, Gs, …, pA, Wk, Au, LP, AP, B)
- `personalia`: Persönliche Werte (alter, groesse, gewicht, gg, sg)

Jede dieser Quellen ist ein `Record<string, number>` (oder optional). Der Lookup per `??` stellt sicher, dass die erste Fundstelle gewinnt (kein Fall, in dem eine ID in zwei Quellen gleichzeitig existiert).

**Warum `as any`?**: `character.boni` hat einen spezifischen Typ (`Character['boni']`), ebenso `properties` und `personalia`. Der generische Index-Zugriff auf `boni[id]` ist typisiert nicht möglich, da `id` ein `string` ist. `as any` umgeht das typsicher — die Runtime-Prüfung `actual === undefined` fängt Nicht-Existenz ab.

**Alternative: Neue validateCategoryJ()**: Statt Category I zu erweitern, könnte man eine eigene Kategorie J für dice-basierte Formeln einführen. Wird hier nicht gemacht, weil der Code eng mit dem bestehenden Formula-Loop und Race/Type-Bonus-Lookup verwoben ist.

### D3: Issue-Code `DICE_VALUE_OUT_OF_RANGE`

```typescript
const source: string = id in (character.boni ?? {}) ? 'boni'
                     : id in (character.properties ?? {}) ? 'properties'
                     : 'personalia'

issues.push({
  path: `${source}.${id}`,
  severity: 'warning',
  code: 'DICE_VALUE_OUT_OF_RANGE',
  message: `Wert ${id} ist ${actual}, möglicher Bereich [${range.min}, ${range.max}] (Formel ${formula.formula})`,
  actual,
  expected: Math.floor(range.expected),
})
```

Der `path` ist dynamisch, weil eine Formel-ID in `boni`, `properties` oder `personalia` liegen kann. Die Meldung sagt "Wert" statt "Bonus", weil der Issue nicht nur für Boni, sondern für alle drei Quellen gilt.

Severity: `warning` (kein `error`), weil ein abweichender Wert auch manuell vom Spielleiter vergeben worden sein kann und nicht zwingend einen Fehler darstellt.

### D4: `evaluateRange()` — Regex erfasst dice-count nicht

**Problem**: `evaluateRange()` ersetzt Würfel per Regex, erfasst aber nicht die Anzahl der Würfel:

```typescript
// Aktuell (falsch):
const maxStr = formula.replace(/W(\d+)/gi, (_, sides) => sides)
```
Für `4W3` matched `/W(\d+)/gi` nur `W3`, das wird durch die Seitenzahl `3` ersetzt → `43`. Korrekt wäre `4*3 = 12`.

**Lösung**: Regex auf `/(\d*)W(\d+|%)/gi` umstellen, beide Gruppen (count + sides) erfassen:

```typescript
// count ist die Anzahl der Würfel (leer = 1), sides ist die Seitenzahl oder %
const diceRegex = /(\d*)W(\d+|%)/gi

replace(diceRegex, (_, count, sides) => {
  const n = count ? parseInt(count, 10) : 1
  const s = sides === '%' ? 100 : parseInt(sides, 10)
  return String(n * s)  // Maximum: n × s
})
```

**Umsetzung in `evaluateRange()`**:

```typescript
const diceRegex = /(\d*)W(\d+|%)/gi

// Minimum: n × 1
const minStr = formula.replace(diceRegex, (_, count) => {
  const n = count ? parseInt(count, 10) : 1
  return String(n)
})

// Maximum: n × Seiten
const maxStr = formula.replace(diceRegex, (_, count, sides) => {
  const n = count ? parseInt(count, 10) : 1
  const s = sides === '%' ? 100 : parseInt(sides, 10)
  return String(n * s)
})

// Erwartungswert: n × (Seiten + 1) / 2
const expectedStr = formula.replace(diceRegex, (_, count, sides) => {
  const n = count ? parseInt(count, 10) : 1
  const s = sides === '%' ? 100 : parseInt(sides, 10)
  return String(n * (s + 1) / 2)
})
```

**Ort**: `FormulaEngine.ts`, `evaluateRange()` (Zeilen 70–89).

**Warum nicht `evaluate()`-Parser verwenden?**: Der Parser arbeitet Token-basiert und kann Würfel nicht "aufbrechen". Das Regex-Replacement ist der einfachste Weg, einen Dice-Term in einen arithmetischen Ausdruck zu transformieren.

### D5: `correctIssues()` — 3-Quellen-Lookup und Dice-Handling

**Ort**: `CharacterValidator.ts`, `correctIssues()` (Zeilen 218–288).

**Problem**: `correctIssues()` hat denselben Bug wie `validateCategoryI()` vor D2 — drei Guards prüfen nur auf `boni`:

| Zeile | Code | Effekt |
|-------|------|--------|
| 239 | `if (!(id in boni)) continue` | Formeln für `B`, `pA`, `LP` etc. in properties/personalia werden übersprungen |
| 263 | `if (!(key in boni)) continue` | Rassen-Boni für properties/personalia werden nie angewandt |
| 277 | `if (!(key in boni)) continue` | Typ-Boni für properties/personalia werden nie angewandt |

Der Repair-Button ruft `correctIssues()` auf und kann daher `B = 18` (ausserhalb Range [20, 28]) nicht korrigieren, weil die ID `B` nicht in `boni` liegt.

**Lösung**: Alle drei Guards durch 3-Quellen-Lookup ersetzen — analog zu D2.

**5a: Formula-Loop (Zeile 239)**:

```typescript
for (const formula of (rules.universalRules?.formulas ?? [])) {
  const id = formula.id

  // 3-Quellen-Lookup
  let source: 'boni' | 'properties' | 'personalia'
  let actual: number
  if (id in (character.boni ?? {})) {
    source = 'boni'; actual = (character.boni as any)[id]
  } else if (id in (character.properties ?? {})) {
    source = 'properties'; actual = (character.properties as any)[id]
  } else if (id in (character.personalia ?? {})) {
    source = 'personalia'; actual = (character.personalia as any)[id]
  } else {
    continue
  }

  if (formula.allowsDice) {
    // Dice-Formel: auf Erwartungswert setzen
    const range = formulaEngine.evaluateRange(formula.formula, ctx)
    const expected = Math.floor(range.expected)
    if (actual !== expected) {
      // setze Wert auf expected im gefundenen source-Objekt
      applied.push({ ... })
    }
  } else {
    // Deterministische Formel: exakter Vergleich
    const expected = formulaEngine.evaluate(formula.formula, ctx)
    if (actual !== expected) {
      applied.push({ ... })
    }
  }
}
```

Das Issue-Objekt wird nicht verändert — `correctIssues()` iteriert unabhängig von Issues über alle Formeln.

**5b: Rassen- und Typ-Boni (Zeilen 263, 277)**:

```typescript
for (const pb of corrRace?.propertyBonuses ?? []) {
  const key = pb.id
  // 3-Quellen-Lookup für den Zielwert
  if (key in boni) {
    boni[key] = pb.mode === 'set' ? pb.value : boni[key] + pb.value
    ctx[key] = boni[key]
  } else if (key in (character.properties ?? {})) {
    properties[key] = pb.mode === 'set' ? pb.value : properties[key] + pb.value
    ctx[key] = properties[key]
  } else if (key in (character.personalia ?? {})) {
    personalia[key] = pb.mode === 'set' ? pb.value : personalia[key] + pb.value
    ctx[key] = personalia[key]
  }
}
// Gleiches für corrType
```

**Alternative**: `correctIssues()` unverändert lassen und nur `autoFix()` ausbauen. Wird nicht gemacht, weil der Repair-Button (`correctIssues()`) der primäre Weg ist, um falsche Werte zu korrigieren — ohne diesen Fix bleibt die Reparatur für properties/personalia blind.

**Warum Dice-Formeln `Math.floor(range.expected)` verwenden?**: `evaluate()` gibt bei Dice-Formeln den mathematischen Erwartungswert zurück (z.B. `50.5` für `W%`). Für einen korrigierten Wert ist der Erwartungswert (gerundet) sinnvoller als der mathematisch exakte — ein Charakter kann keinen halben Punkt haben.

## Risks / Trade-offs

| Risiko | Mitigation |
|--------|------------|
| `nW%` (z.B. `2W%`) existiert in der aktuellen Regeldatei nicht, wird aber zur Vollständigkeit unterstützt | Regex `/^\d*W$/i` matched sowohl `W` als auch `2W` — kein Mehraufwand |
| `evaluateRange()`-Regex muss count korrekt erfassen (`4W3` → `4*3`, nicht `43`) | Regex `/(\d*)W(\d+\|%)/gi` mit explizitem count-Parsing; Tests für `4W3`, `W6`, `W%`, `2W%` |
| `propertyBonuses` mit `mode: 'set'` überschreibt den Dice-Wert komplett — Range-Prüfung wird sinnlos | In der Praxis werden Set-Boni nur für fixe Werte verwendet (z.B. `Au=10`). `allowsDice: true` + `mode: 'set'` ist ein Widerspruch in den Daten — die Range-Prüfung würde dann `actual !== setValue` erkennen, was korrekt ist |
