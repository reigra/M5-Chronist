# Universal Rules — Schema-Design

> Diskussionsgrundlage für die Frage: **Wie kommen Regeln, die alle Charaktere
> betreffen (unabhängig von Rasse oder Typ), in das Regelwerk?**
>
> Betroffen: Bonus-Formeln, abgeleitete Eigenschaften, Innate-Skill-Formeln.

---

## 1. Was sind „universelle Regeln"?

Definition: Regeln, die **für jeden Charakter** gelten, ohne dass Rasse oder Typ
sie beeinflussen. Sie sind im Midgard M5-Regelwerk fest definiert und ändern
sich nur durch Hausregeln.

---

## 2. Kategorien

### 2.1 Bonus-Formeln

| Bonus | Beispiel-Formel (M5) |
|-------|---------------------|
| `AusB` | `Ko/10 + St/20` |
| `SchB` | `St/10` |
| `AnB`  | `(St+Gw)/20` |
| `AbB`  | `(Gs+Gw)/20` |
| `ZauB` | `Zt/10` |
| `ResBg` | `(In+Zt)/20` |
| `ResBk` | `(St+Ko)/20` |

**Status heute:** Nicht im System. Der Charakter speichert Boni als separate
Werte (`CharacterBoni`), aber es gibt keine Berechnung oder Validierung.

**Wofür gebraucht:**
- Validierung: „Stimmt AnB mit (St+Gw)/20 überein?"
- Raufen-Formel braucht AnB als Input

### 2.2 Abgeleitete Eigenschaften

| Eigenschaft | Beispiel-Formel (M5) | Rassen-Modifikator |
|-------------|----------------------|---------------------|
| `Wk` (Willenskraft) | `W% + 2*(Ko/10 + In/10) - 20` | nein |
| `LP` (Lebenspunkte) | `1W3 + 7 + Ko/10` | ja (race.lpModifier) |
| `AP` (AP-Maximum) | `1W3 + 1 + AusB` | nein |
| `B` (Bewegungsweite) | `4W3 + 16` | nein |

**Status heute:** `lpModifier` existiert auf `Race`. Der Rest ist nicht im System.

### 2.3 Innate-Skill-Formeln

| Skill | Formel | Rassen-Spezialfall |
|-------|--------|--------------------|
| `Raufen` | `(St+Gw)/20 + AnB` | +1 für Zwerg |
| `Trinken` | `Ko/10` | — |
| `Wahrnehmung` | `6` | — |
| `Hören` | `0` (gestapelt auf Wahrnehmung) | — |

**Status heute:** Hartcodiert in `autoFix()` und dem Plan-Dokument.

### 2.4 Grad-Tabellen

Bereits vorhanden: `RulebookData.gradThresholds[]` + `Skill.gradValues[]`.
Die Daten existieren in `mogadil.json`, werden gemerged und via `computeGrad()`
ausgewertet. Kein Handlungsbedarf fürs Schema.

---

## 3. Formelsprache — Spezifikation

Die Formeln werden als **Strings im Rulebook-JSON** abgelegt. Alle drei
Implementierungs-Ansätze in Abschnitt 4 parsen dasselbe Format.

### Syntax (informell)

```
formel    = term ( ('+' | '-') term )*
term      = faktor ( ('*' | '/') faktor )*
faktor    = zahl | variable | dice | '(' formel ')'
zahl      = ganze oder gebrochene Zahl (z.B. 3, 10, 0.5)
variable  = Buchstabenfolge (z.B. Ko, St, AusB, AnB)
dice      = [zahlen]'W'[zahlen]  (z.B. 1W3, 4W3)
          | 'W%'  (Kurzform für 1W100)
```

### Token

| Token | Beispiele | Regex |
|-------|-----------|-------|
| Zahl | `3`, `10`, `0.5` | `\d+(\.\d+)?` |
| Variable | `Ko`, `St`, `AusB`, `AnB` | `[A-Za-z][A-Za-z0-9]*` |
| Operator | `+`, `-`, `*`, `/` | `[+\-*/]` |
| Klammer | `(`, `)` | `[()]` |
| Dice | `1W3`, `4W3`, `W%` | `(\d*)[Ww](\d+)` oder `W%` |

### Sicherheits-Regex (für alle Ansätze)

Bevor eine Formel verarbeitet wird, wird sie auf erlaubte Zeichen geprüft:

```
^[0-9A-Za-z+\-*/().W%\s]+$
```

Erlaubt: Ziffern, Buchstaben, `+`, `-`, `*`, `/`, `(`, `)`, `.`, `W`, `%`,
Leerzeichen. Schon  `$`, `'`, Backtick, `;` oder andere JS-Sonderzeichen
werden abgewiesen. Die Formelsprache hat kein Komma, kein `=`, keine Strings.

### Dice-Resolving (drei Modi)

**Modus `range`** (Default für Formeln mit Würfeln, kein gespeicherter Wurf):
- `nWm` → Min: `n × 1`, Max: `n × m`, Erwartungswert: `n × (m+1) / 2`
- `W%` (`1W100`) → Min: 1, Max: 100, Erwartungswert: 50.5
- Formel wird dreimal evaluiert (min / max / expected), Dice jeweils
  durch den entsprechenden Zahlenwert ersetzt

**Modus `exact`** (für deterministische Formeln **ohne** Würfel):
- Wirft Fehler wenn ein Dice-Token vorkommt
- Liefert `number`

**Modus `exact` mit Dice (für Formeln **mit** Würfeln, wenn Wurf gespeichert):**
- Dice-Token werden durch den gespeicherten Würfelwert (`rolls[target]`) ersetzt
- Fehlt der Eintrag in `rolls` → Fallback auf `expected` aus dem range-Modus
- Liefert `number`

Die gespeicherten Würfergebnisse liegen am Character:

```typescript
// Zukünftig auf dem Character (noch nicht implementiert)
interface Character {
  // ...
  /** Gespeicherte Würfel-Summen pro Formel-Target */
  rolls?: Record<string, number>
  // z.B. rolls.LP = 2  (Wurf 1W3 = 2)
  //       rolls.AP = 1  (Wurf 1W3 = 1)
  //       rolls.B  = 7  (Wurf 4W3 = 1+2+3+1)
}
```

Jedes Formel-Target speichert die **Summe** aller seiner Würfel als einen
einzigen Wert. Für `4W3 + 16` wird nur die Summe `7` gespeichert, nicht
die vier Einzelwürfel. Das reicht für die exakte Validierung.

### Variablen-Substitution (für alle Ansätze)

| Token | Ersetzt durch |
|-------|--------------|
| `St`, `Gs`, `Gw`, `Ko`, `In`, `Zt`, `pA` | `context.properties[token]` |
| `Wk`, `Au`, `LP`, `AP`, `B` | `context.properties[token]` |
| `AusB`, `SchB`, `AnB`, `AbB`, `ZauB`, `ResBg`, `ResBk` | `context.boni[token]` |
| Sonstige (z.B. `Anzahl`, `Stufe`) | `context.custom[token]` |

---

## 4. Implementierungs-Ansätze

Alle drei Ansätze lesen dieselbe JSON-Struktur (siehe Abschnitt 5) und
produzieren dieselben Validierungsergebnisse. Unterschiedlich ist nur
der Parser, der die Formel-Strings in Zahlen verwandelt.

### Ansatz A — Regex + Replace + eval (einfach)

**Prinzip:** Validieren → Variablen ersetzen → Dice ersetzen → `eval`.

```typescript
class FormulaEngine {
  private readonly ALLOWED = /^[0-9A-Za-z+\-*/().W%\s]+$/

  /**
   * Wirft Fehler bei ungültigen Zeichen.
   */
  private validate(formula: string): void {
    if (!this.ALLOWED.test(formula)) {
      throw new Error(`Ungültiges Zeichen in Formel: "${formula}"`)
    }
  }

  /**
   * Variablen gegen Kontext-Werte ersetzen (mit Word-Boundary).
   */
  private substitute(formula: string, ctx: Record<string, number>): string {
    let result = formula
    for (const [key, value] of Object.entries(ctx)) {
      // \b = Wortgrenze, damit "AnB" nicht in "SchAnB" matched
      result = result.replace(new RegExp(`\\b${key}\\b`, 'g'), String(value))
    }
    return result
  }

  /**
   * Dice-Notation ersetzen:
   * - range-Modus: min / max / expected
   * - exact-Modus: gespeicherten Wurf (rollValue) verwenden
   */
  private resolveDice(formula: string, mode: 'min' | 'max' | 'expected' | 'exact', rollValue?: number): string {
    let result = formula.replace(/W%/g, '1W100')

    result = result.replace(/(\d*)W(\d+)/gi, (_, n, m) => {
      const count = n ? parseInt(n, 10) : 1
      const sides = parseInt(m, 10)

      if (mode === 'exact') {
        // Gespeicherten Wurf verwenden, Fallback auf expected
        if (rollValue !== undefined) return String(rollValue)
        return String(count * (sides + 1) / 2) // expected
      }

      switch (mode) {
        case 'min':      return String(count * 1)
        case 'max':      return String(count * sides)
        case 'expected': return String(count * (sides + 1) / 2)
      }
    })

    return result
  }

  /**
   * Deterministische Formel auswerten.
   * Wirft Fehler wenn ein Dice-Token übrig ist.
   */
  evaluate(formula: string, ctx: Record<string, number>): number {
    this.validate(formula)
    let expr = this.substitute(formula, ctx)
    if (/W/i.test(expr)) {
      throw new Error(`Formel enthält Würfel: "${formula}"`)
    }
    return this.safeEval(expr)
  }

  /**
   * Range für Formeln mit Würfeln berechnen.
   */
  evaluateRange(formula: string, ctx: Record<string, number>): { min: number; max: number; expected: number } {
    this.validate(formula)
    const base = this.substitute(formula, ctx)
    return {
      min:      this.safeEval(this.resolveDice(base, 'min')),
      max:      this.safeEval(this.resolveDice(base, 'max')),
      expected: this.safeEval(this.resolveDice(base, 'expected')),
    }
  }

  /**
   * Exakte Auswertung für Formeln mit Würfeln, wenn der Wurf gespeichert ist.
   * rollValue = Summe aller Würfelergebnisse (z.B. rolls.LP = 2).
   * Fallback auf expected wenn rollValue undefined ist.
   */
  evaluateExact(formula: string, ctx: Record<string, number>, rollValue?: number): number {
    this.validate(formula)
    const base = this.substitute(formula, ctx)
    return this.safeEval(this.resolveDice(base, 'exact', rollValue))
  }

  /**
   * Gekapselter eval-Aufruf.
   * new Function statt eval, damit der Ausdruck im globalen Scope läuft
   * und keine lokalen Variablen lesen kann.
   */
  private safeEval(expr: string): number {
    return new Function(`"use strict"; return (${expr})`)()
  }
}
```

**Schritte im Detail:**

1. `validate()` prüft auf erlaubte Zeichen (kein `$`, `'`, Backtick, etc.)
2. `substitute()` ersetzt Variablen mit Word-Boundary (`\bKo\b`)
3. `resolveDice()` wandelt Würfel in feste Zahlen (range oder exact)
4. `safeEval()` führt den reinen arithmetischen Ausdruck via `new Function()` aus

**Geschätzte Code-Größe:** ~60 Zeilen

**Pro:**
- Extrem kurz und einfach
- Keine Parser-Logik nötig — JS `eval` / `new Function` rechnet von selbst
- Operator-Rangfolge (+ vor * etc.) ist korrekt (JS-Spezifikation deckt sich mit M5)
- Leicht zu erweitern (neue Variablen = neuer Eintrag in Substitution)

**Contra:**
- `new Function()` ist im Prinzip `eval` — theoretisch unsicher, aber in der
  Praxis unproblematisch, weil:
  - Der User importiert seine eigenen JSONs (kein Fremd-Input)
  - `validate()` lässt nur sichere Zeichen durch
  - `substitute()` ersetzt Variablen gegen Zahlen
  - Was bei `safeEval` ankommt, ist nur noch ein arithmetischer Ausdruck
    wie `(2/10 + 5/20)` — daraus kann kein Angreifer Schadcode zaubern
- Fehlermeldungen sind kryptisch: `"Unexpected token ')'"` statt
  `"Zeile 1, Spalte 12: Klammer zu ohne öffnende Klammer"`
- Variablen-Replace kann patzen: `\b` funktioniert nicht wenn Variablen
  direkt nebeneinanderstehen (z.B. `Ko+St` — `Ko` matched nicht wenn `+`
  dazwischen kein Word-Character ist; hier passt `\b` aber tatsächlich)
- Keine Analyse möglich: man kann die Formel-Struktur nicht inspizieren
  (z.B. alle verwendeten Variablen sammeln)

---

### Ansatz B — Tokenizer + Recursive-Descent-Evaluator (mittel)

**Prinzip:** Formel-String wird in Token zerlegt, dann mit Recursive-Descent
direkt ausgewertet — ohne einen AST zu bauen. Der Parser ruft während des
Parsens sofort die Berechnung auf.

```typescript
type TokenType = 'zahl' | 'variable' | 'op' | 'paren' | 'dice'
type Token = { type: TokenType; value: string; pos: number }

class FormulaEngine {
  private tokens: Token[] = []
  private pos = 0
  private ctx: Record<string, number> = {}
  private mode: 'exact' | 'exact-dice' | 'min' | 'max' | 'expected' = 'exact'
  /** Gespeicherte Würfelsumme für exact-dice Mode */
  private rollValue?: number

  /**
   * Tokenizer: zerlegt String in Token-Array.
   */
  private tokenize(input: string): Token[] {
    const tokens: Token[] = []
    const regex = /\s*(\d+(?:\.\d+)?|[A-Za-z][A-Za-z0-9]*|\d*W\d+|W%|[+\-*/()])\s*/gy
    let match: RegExpExecArray | null
    let lastPos = 0

    while ((match = regex.exec(input)) !== null) {
      if (match.index > lastPos) {
        throw new Error(`Unerwartetes Zeichen an Position ${lastPos}`)
      }
      const raw = match[1]
      let type: TokenType
      if (/^\d/.test(raw)) type = 'zahl'
      else if (/^[A-Za-z]/.test(raw) && !/W/i.test(raw)) type = 'variable'
      else if (/^\d*W\d+|W%$/i.test(raw)) type = 'dice'
      else if (/^[+\-*/]$/.test(raw)) type = 'op'
      else if (/^[()]$/.test(raw)) type = 'paren'
      else throw new Error(`Unbekanntes Token "${raw}" an Position ${match.index}`)

      tokens.push({ type, value: raw, pos: match.index })
      lastPos = regex.lastIndex
    }
    if (lastPos < input.length) {
      throw new Error(`Unerwartetes Zeichen an Position ${lastPos}`)
    }
    return tokens
  }

  /**
   * Rekursive Abstiegsparser:
   *   formel → term (('+'|'-') term)*
   *   term   → faktor (('*'|'/') faktor)*
   *   faktor → zahl | variable | dice | '(' formel ')'
   */
  private parseFormel(): number {
    let left = this.parseTerm()
    while (this.peek()?.value === '+' || this.peek()?.value === '-') {
      const op = this.consume().value
      const right = this.parseTerm()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  private parseTerm(): number {
    let left = this.parseFaktor()
    while (this.peek()?.value === '*' || this.peek()?.value === '/') {
      const op = this.consume().value
      const right = this.parseFaktor()
      left = op === '*' ? left * right : left / right
    }
    return left
  }

  private parseFaktor(): number {
    const token = this.consume()
    switch (token.type) {
      case 'zahl':
        return parseFloat(token.value)
      case 'variable':
        if (!(token.value in this.ctx)) {
          throw new Error(`Unbekannte Variable "${token.value}" an Position ${token.pos}`)
        }
        return this.ctx[token.value]
      case 'dice':
        return this.resolveDice(token.value)
      case 'paren':
        if (token.value !== '(') throw new Error(`Erwarte '(' an Position ${token.pos}`)
        const val = this.parseFormel()
        const close = this.consume()
        if (close.value !== ')') throw new Error(`Erwarte ')' an Position ${close.pos}`)
        return val
      default:
        throw new Error(`Unerwartetes Token an Position ${token.pos}`)
    }
  }

  private resolveDice(raw: string): number {
    let count = 1, sides = 100
    if (raw.toUpperCase() === 'W%') { sides = 100 }
    else {
      const m = raw.match(/^(\d*)[Ww](\d+)$/)!
      if (m[1]) count = parseInt(m[1], 10)
      sides = parseInt(m[2], 10)
    }

    switch (this.mode) {
      case 'exact':
        // Deterministischer Modus — kein Würfel erlaubt
        throw new Error(`Würfel nicht erlaubt in deterministischer Formel`)
      case 'exact-dice':
        // Gespeicherten Wurf verwenden, Fallback auf expected
        if (this.rollValue !== undefined) return this.rollValue
        return count * (sides + 1) / 2
      case 'min':      return count * 1
      case 'max':      return count * sides
      case 'expected': return count * (sides + 1) / 2
    }
  }

  /** public API — deterministische Formel ohne Würfel */
  evaluate(formula: string, ctx: Record<string, number>): number {
    this.mode = 'exact'
    this.ctx = ctx
    this.tokens = this.tokenize(formula)
    this.pos = 0
    return this.parseFormel()
  }

  /** Range für Formeln mit Würfeln (min/max/expected) */
  evaluateRange(formula: string, ctx: Record<string, number>) {
    const result = {} as any
    for (const mode of ['min', 'max', 'expected'] as const) {
      this.mode = mode
      this.ctx = ctx
      this.tokens = this.tokenize(formula)
      this.pos = 0
      result[mode] = this.parseFormel()
    }
    return result
  }

  /**
   * Exakte Auswertung für Formeln mit Würfeln.
   * @param rollValue - Gespeicherte Würfelsumme (z.B. rolls.LP = 2)
   */
  evaluateExact(formula: string, ctx: Record<string, number>, rollValue?: number): number {
    this.mode = 'exact-dice'
    this.ctx = ctx
    this.rollValue = rollValue
    this.tokens = this.tokenize(formula)
    this.pos = 0
    return this.parseFormel()
  }
}
```

**Schritte im Detail:**

1. `tokenize()` wandelt String in Token-Array um (mit Position für Fehler)
2. `parseFormel()` / `parseTerm()` / `parseFaktor()` sind jeweils eine
   Funktion pro Grammatik-Regel, die beim Parsen sofort rechnet
3. `resolveDice()` je nach Mode (min/max/expected)
4. Fehler enthalten Position (`" an Position 5"`)

**Geschätzte Code-Größe:** ~130 Zeilen

**Pro:**
- Kein `eval`, kein `new Function` — reiner TypeScript-Code, typsicher
- Bessere Fehlermeldungen mit Position
- Volle Kontrolle über Operator-Rangfolge und Auswertung
- Erweiterbar: neue Funktionen (`floor()`, `round()`, `max()`) können als
  neue Token-Typen oder Funktionsaufrufe ergänzt werden

**Contra:**
- Mehr Code als Ansatz A (~130 vs ~60 Zeilen)
- Fehlermeldungen sind besser als eval, aber nicht „für Endanwender"
  (Position reicht — braucht keinen spitzen Mauszeiger)
- Dice-Token muss im Tokenizer erkannt werden (Regex `\d*W\d+|W%`)
  — das ist der kniffligste Teil, weil `W` auch als Variable matched
  werden könnte. Der Tokenizer unterscheidet: `W` allein ist Variable,
  `W3` oder `2W6` ist Dice.

---

### Ansatz C — Full AST Parser (komplex)

**Prinzip:** Tokenizer → Parser baut einen AST (Abstract Syntax Tree) →
separater Evaluator traversiert den Baum. Der AST ist eine explizite
Datenstruktur, die die Formel als Baum abbildet.

```typescript
// === AST-Typen ===
type EvalMode = 'exact' | 'exact-dice' | 'min' | 'max' | 'expected'

type AstNode =
  | { type: 'number';  value: number }
  | { type: 'variable'; name: string }
  | { type: 'dice';     count: number; sides: number }
  | { type: 'binary';   op: string; left: AstNode; right: AstNode }
  | { type: 'unary';    op: '-' | '+'; child: AstNode }

class FormulaEngine {
  private tokens: Token[] = []

  // === Parser ===
  private parseFormel(): AstNode {
    let left = this.parseTerm()
    while (this.peek()?.value === '+' || this.peek()?.value === '-') {
      const op = this.consume().value
      left = { type: 'binary', op, left, right: this.parseTerm() }
    }
    return left
  }

  // ... parseTerm, parseFaktor analog zu Ansatz B,
  // aber erzeugen { type, ... }-Objekte statt Zahlen

  // === Evaluator ===
  private resolveDice(count: number, sides: number, mode: EvalMode, rollValue?: number): number {
    switch (mode) {
      case 'exact':     throw new Error('Würfel nicht erlaubt')
      case 'exact-dice': return rollValue ?? (count * (sides + 1) / 2)
      case 'min':       return count * 1
      case 'max':       return count * sides
      case 'expected':  return count * (sides + 1) / 2
    }
  }

  private evalNode(node: AstNode, ctx: Record<string, number>, mode: EvalMode, rollValue?: number): number {
    switch (node.type) {
      case 'number':   return node.value
      case 'variable': return ctx[node.name] ?? fail(`Unbekannt: ${node.name}`)
      case 'dice':     return resolveDice(node.count, node.sides, mode, rollValue)
      case 'unary': {
        const v = this.evalNode(node.child, ctx, mode, rollValue)
        return node.op === '-' ? -v : v
      }
      case 'binary': {
        const l = this.evalNode(node.left, ctx, mode, rollValue)
        const r = this.evalNode(node.right, ctx, mode, rollValue)
        switch (node.op) {
          case '+': return l + r
          case '-': return l - r
          case '*': return l * r
          case '/': return l / r
        }
      }
    }
  }

  /** public API */
  evaluate(formula: string, ctx: Record<string, number>): number {
    return this.evalNode(this.parse(tokenize(formula)), ctx, 'exact')
  }

  evaluateRange(formula: string, ctx: Record<string, number>) {
    const ast = this.parse(tokenize(formula))
    return {
      min:      this.evalNode(ast, ctx, 'min'),
      max:      this.evalNode(ast, ctx, 'max'),
      expected: this.evalNode(ast, ctx, 'expected'),
    }
  }

  evaluateExact(formula: string, ctx: Record<string, number>, rollValue?: number): number {
    return this.evalNode(this.parse(tokenize(formula)), ctx, 'exact-dice', rollValue)
  }
}
```

**Zusätzliche Möglichkeiten (weil der Baum explizit ist):**

```typescript
// Variablen sammeln, bevor evaluiert wird:
function collectVariables(node: AstNode): Set<string> {
  switch (node.type) {
    case 'variable': return new Set([node.name])
    case 'dice':
    case 'number':   return new Set()
    case 'unary':    return collectVariables(node.child)
    case 'binary':   return union(collectVariables(node.left), collectVariables(node.right))
  }
}

// Formel wieder als String ausgeben (Pretty-Print):
function format(node: AstNode): string {
  switch (node.type) {
    case 'number':   return String(node.value)
    case 'variable': return node.name
    case 'dice':     return `${node.count || ''}W${node.sides}`
    case 'binary':   return `(${format(node.left)} ${node.op} ${format(node.right)})`
    case 'unary':    return `${node.op}${format(node.child)}`
  }
}

// Baum optimieren (Konstanten zusammenfassen):
function fold(node: AstNode): AstNode {
  // "(2+3)*Ko" → "5*Ko"
}
```

**Geschätzte Code-Größe:** ~200 Zeilen (Parser + AST-Typen + Evaluator +
  optionale Helfer)

**Pro:**
- Maximale Kontrolle: Baum kann vor der Auswertung inspiziert,
  transformiert und optimiert werden
- Formel kann als String wieder ausgegeben werden (Pretty-Print, Debug)
- Alle Variablen können gesammelt werden (für UI: „Diese Formel braucht:
  St, Gw")
- Einfach erweiterbar: neue Node-Typen (`function`, `ternary`)
- Sauberste Trennung von Parsen und Auswerten

**Contra:**
- Deutlich mehr Code (~200 Zeilen vs ~60/130)
- „AST sagt mir nichts" — das Konzept ist für viele Entwickler zunächst
  gewöhnungsbedürftig
- Overkill für einfache Formeln: der Baum wird gebaut, traversiert,
  und dann weggeworfen. Bei `(Ko/10 + St/20)` ist der Baum nach 2ms
  wieder im GC
- Kein praktischer Vorteil gegenüber Ansatz B, solange die Formeln so
  einfach bleiben wie in den Beispielen

---

### Vergleichstabelle

| Kriterium | A — Regex+eval | B — Recursive-Descent | C — Full AST |
|-----------|---------------|----------------------|--------------|
| **Code-Größe** | ~60 Zeilen | ~130 Zeilen | ~200 Zeilen |
| **eval/new Function** | Ja | Nein | Nein |
| **Fehlermeldungen** | "Unexpected token" | mit Position | mit Position |
| **Variablen sammeln** | Nicht möglich | Nur mit extra Durchlauf | Trivial |
| **Pretty-Print** | Nicht möglich | Nicht möglich | Trivial |
| **Exact-Dice-Mode** | `rollValue` im Regex-Replace | Separater `exact-dice` Mode | Separater `exact-dice` Mode |
| **Erweiterbar** | Regex muss angepasst werden | Neue Parser-Funktion | Neuer Node-Typ + Evaluator |
| **Operator-Rangfolge** | Von JS geerbt | Selbst definiert | Selbst definiert |
| **Risiko** | Gering (validierte Inputs) | Kein eval | Kein eval |

---

## 5. Speicherung im Rulebook-JSON

Unabhängig vom gewählten Ansatz werden die Formeln als Strings im
Regelwerk-JSON gespeichert:

```typescript
// Neue Interfaces in RulebookData / RulesData
interface UniversalRules {
  formulas: UniversalFormula[]
}

interface UniversalFormula {
  /** Ziel-Feld: Bonus-Key, Property-Name oder Skill-ID */
  target: string
  /** Formel als String in der definierten Formelsprache */
  formula: string
  /** Ob Würfel (W-Notation) erlaubt sind */
  allowsDice: boolean
  /** Optionale Beschreibung für UI / Debugging */
  description?: string
}
```

Beispiel aus einem Regelwerk-JSON:

```json
{
  "universalRules": {
    "formulas": [
      { "target": "AusB",  "formula": "Ko/10 + St/20",                    "allowsDice": false },
      { "target": "SchB",  "formula": "St/10",                            "allowsDice": false },
      { "target": "AnB",   "formula": "(St+Gw)/20",                       "allowsDice": false },
      { "target": "AbB",   "formula": "(Gs+Gw)/20",                       "allowsDice": false },
      { "target": "ZauB",  "formula": "Zt/10",                            "allowsDice": false },
      { "target": "ResBg", "formula": "(In+Zt)/20",                       "allowsDice": false },
      { "target": "ResBk", "formula": "(St+Ko)/20",                       "allowsDice": false },
      { "target": "Wk",    "formula": "W% + 2*(Ko/10 + In/10) - 20",     "allowsDice": true },
      { "target": "LP",    "formula": "1W3 + 7 + Ko/10",                  "allowsDice": true },
      { "target": "AP",    "formula": "1W3 + 1 + AusB",                   "allowsDice": true },
      { "target": "B",     "formula": "4W3 + 16",                         "allowsDice": true }
    ]
  }
}
```

**Merge-Logik:** `universalRules` wird wie die anderen Arrays gemerged
(first-wins pro target, priorisiert nach Source-Priority). Ein House-Rule-
Source kann einzelne Formeln überschreiben, indem er denselben `target`
mit einer neuen `formula` definiert.

---

## 6. Validierung damit

```typescript
function validateUniversalRules(character: Character, rules: RulesData): ValidationIssue[] {
  const engine = new FormulaEngine()
  const issues: ValidationIssue[] = []
  const formulas = rules.universalRules?.formulas ?? []

  for (const f of formulas) {
    // Kontext aufbauen: alle Properties + Boni als flaches Dictionary
    const ctx: Record<string, number> = {
      ...character.properties,
      ...character.boni,
    }

    const actual = ctx[f.target]
    if (actual === undefined) continue

    if (f.allowsDice) {
      if (character.rolls?.[f.target] !== undefined) {
        // Modus 1: Exakt — Wurf ist gespeichert
        const expected = Math.floor(engine.evaluateExact(f.formula, ctx, character.rolls[f.target]))
        if (actual !== expected) {
          issues.push({
            path: f.target in character.boni ? `boni.${f.target}` : `properties.${f.target}`,
            severity: 'warning',
            code: 'DERIVED_VALUE_MISMATCH',
            message: `${f.target}: erwartet ${expected} (Wurf ${character.rolls[f.target]}), ist ${actual}`,
            expected,
            actual,
          })
        }
      } else {
        // Modus 2: Range — nur Bereich prüfen
        const { min, max } = engine.evaluateRange(f.formula, ctx)
        if (actual < min || actual > max) {
          issues.push({
            path: f.target in character.boni ? `boni.${f.target}` : `properties.${f.target}`,
            severity: 'warning',
            code: 'DERIVED_OUT_OF_RANGE',
            message: `${f.target} (${actual}) liegt außerhalb des möglichen Bereichs [${min}–${max}]`,
            expected: { min, max },
            actual,
          })
        }
      }
    } else {
      // Deterministische Formel — exakter Vergleich
      const expected = Math.floor(engine.evaluate(f.formula, ctx))
      if (actual !== expected) {
        issues.push({
          path: f.target in character.boni ? `boni.${f.target}` : `properties.${f.target}`,
          severity: 'warning',
          code: 'BONUS_VALUE_MISMATCH',
          message: `${f.target}: erwartet ${expected}, ist ${actual}`,
          expected,
          actual,
        })
      }
    }
  }

  return issues
}
```

**Validierungs-Priorität:**
1. Wenn `character.rolls[target]` existiert → **exakter Vergleich** (beste Qualität)
2. Sonst → **Range-Check** (akzeptabel für Bestandscharktere ohne gespeicherte Würfe)

**Wichtig:** Die Formeln werden von der höchstprioren Quelle geladen.
Wenn keine Quelle `universalRules` definiert, gibt es keine Prüfung.
Dadurch sind alte Regelwerke ohne `universalRules` rückwärtskompatibel.

---

## 7. Offene Fragen

| Frage | Diskussion |
|-------|-----------|
| **Runden** | Sollen Ergebnisse automatisch abgerundet werden (`Math.floor`)? Im Code der Validierung (nicht in der Formel) — damit die Formel-Strings sauber bleiben. |
| **Zirkuläre Abhängigkeiten** | `AP = 1W3 + 1 + AusB` braucht `AusB`. `AusB` wird separat berechnet. Reihenfolge: Alle deterministischen Formeln zuerst, dann dice-basierte. |
| **Race-Modifier** | `LP = 1W3 + 7 + Ko/10` — wo bleibt der `race.lpModifier`? Entweder (a) in der Formel selbst: `1W3 + 7 + Ko/10 + lpModifier`, oder (b) als separates Feld. Für (a) spricht Simplizität. |
| **Fehler bei unbekannten Variablen** | Eine Formel `Ko/10 + Foobar` mit Tippfehler → Fehler beim Evaluieren. Soll das den gesamten Validierungs-Durchlauf abbrechen oder nur diese eine Formel überspringen? Vorschlag: überspringen + loggen. |
| **Bedingte Formeln** | `Raufen` braucht +1 für Zwerg. Soll das `if raceId == 'zwerg' then ... else ...` in der Formelsprache? Oder als separates `conditions`-Feld? Vorschlag: erstmal nur einfache Formeln ohne Bedingungen. |

---

## 8. Bewertung

| Ansatz | Fazit |
|--------|-------|
| **A — Regex+eval** | Am einfachsten, für die gegebenen Formeln ausreichend. Das Sicherheitsrisiko ist durch den Validierungs-Regex kontrollierbar. Nachteil: kryptische Fehler. |
| **B — Recursive-Descent** | Der „sichere Mittelweg". Kein eval, bessere Fehler, kaum komplexer als A. Erweiterbar ohne große Refactoren. |
| **C — Full AST** | Für die gegebene Problemstellung overengineered. Macht Sinn wenn später Formel-Editoren, Pretty-Print oder Optimierungen dazukommen. |

Meine Empfehlung: **Ansatz B** (Tokenizer + Recursive-Descent). Kein `eval`,
gute Fehlermeldungen, ~130 Zeilen, typsicher. Ansatz A ist verlockend einfach,
aber die kryptischen `eval`-Fehler werden früher oder später nerven.
Ansatz C ist zu schwer für die aktuellen Anforderungen.

---

## 9. Dateien (geplant)

| Datei | Inhalt |
|-------|--------|
| `src/types/Rules.ts` | `UniversalRules` + `UniversalFormula` Interfaces |
| `src/services/FormulaEngine.ts` | Tokenizer + Evaluator (einer der drei Ansätze) |
| `src/services/CharacterValidator.ts` | Ruft FormulaEngine für Checks auf |
