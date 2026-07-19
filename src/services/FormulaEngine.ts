/**
 * Token-Typen für den FormulaEngine-Tokenizer.
 */
type TokenType =
  | 'NUMBER'
  | 'VARIABLE'
  | 'FUNCTION'
  | 'DICE'
  | 'PLUS'
  | 'MINUS'
  | 'MULT'
  | 'DIV'
  | 'LPAREN'
  | 'RPAREN'
  | 'PERCENT'

interface Token {
  type: TokenType
  value: string
  pos: number
}

/**
 * Ergebnis einer Range-Auswertung (min/max/expected).
 */
export interface DiceRange {
  min: number
  max: number
  expected: number
}

/**
 * FormulaEngine — wertet M5-Formel-Strings sicher aus.
 *
 * Verwendet einen Tokenizer + Recursive-Descent-Parser.
 * M5-Konvention: Divisionen werden einzeln abgerundet (Math.floor pro `/`).
 * Kein eval / new Function.
 *
 * @example
 *   formulaEngine.evaluate("Ko/10", { Ko: 20 })         // → 2
 *   formulaEngine.evaluate("(St+Gw)/20 + AnB", { St: 20, Gw: 10, AnB: 2 }) // → 3
 */
export class FormulaEngine {
  private tokens: Token[] = []
  private pos = 0
  private context: Record<string, number> = {}

  /**
   * Wertet einen Formel-String gegen einen Zahlen-Kontext aus.
   * Wirft einen Fehler bei unbekannten Variablen oder Syntaxfehlern.
   */
  evaluate(formula: string, context: Record<string, number>): number {
    this.context = context
    this.tokenize(formula)
    this.pos = 0
    const result = this.parseExpression()
    if (this.pos < this.tokens.length) {
      throw new Error(
        `Unerwartetes Token "${this.tokens[this.pos].value}" an Position ${this.tokens[this.pos].pos}`,
      )
    }
    return result
  }

  /**
   * Wertet eine Formel aus und gibt den minimalen, maximalen und erwarteten Wert zurück.
   * Würfel werden als Range betrachtet.
   */
  evaluateRange(formula: string, context: Record<string, number>): DiceRange {
    const diceRegex = /(\d*)W(\d+|%)/gi

    // Für min: n × 1
    const minStr = formula.replace(diceRegex, (_, count) => {
      const n = count ? parseInt(count, 10) : 1
      return String(n)
    })

    // Für max: n × Seiten
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

    return {
      min: Math.floor(this.evaluate(minStr, context)),
      max: Math.floor(this.evaluate(maxStr, context)),
      expected: Math.floor(this.evaluate(expectedStr, context)),
    }
  }

  /**
   * Wertet eine Formel mit einem bestimmten Würfelergebnis aus.
   * Alle Würfel werden durch den gegebenen Wert ersetzt.
   */
  evaluateExact(formula: string, context: Record<string, number>, diceValue: number): number {
    const exactStr = formula.replace(/W\d+|W%/gi, String(diceValue))
    return this.evaluate(exactStr, context)
  }

  // ── Tokenizer ───────────────────────────────────────────────────────────────

  /**
   * Zerlegt einen Formel-String in ein Token-Array.
   * Wirft einen Fehler bei unerlaubten Zeichen.
   */
  private tokenize(input: string): void {
    const tokens: Token[] = []
    const allowed = /^[0-9A-Za-z+\-*/().W%\s]+$/

    if (!allowed.test(input)) {
      const invalid = input.match(/[^0-9A-Za-z+\-*/().W%\s]/)
      throw new Error(
        `Unerlaubtes Zeichen "${invalid?.[0] ?? '?'}" in Formel "${input}"`,
      )
    }

    let i = 0
    while (i < input.length) {
      const ch = input[i]

      // Whitespace überspringen
      if (/\s/.test(ch)) { i++; continue }

      if (ch === '+') { tokens.push({ type: 'PLUS', value: '+', pos: i }); i++; continue }
      if (ch === '-') { tokens.push({ type: 'MINUS', value: '-', pos: i }); i++; continue }
      if (ch === '*') { tokens.push({ type: 'MULT', value: '*', pos: i }); i++; continue }
      if (ch === '/') { tokens.push({ type: 'DIV', value: '/', pos: i }); i++; continue }
      if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(', pos: i }); i++; continue }
      if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')', pos: i }); i++; continue }

      // Prozent (W%)
      if (ch === '%') {
        tokens.push({ type: 'PERCENT', value: '%', pos: i })
        i++
        continue
      }

      // Zahl oder Dice/Variable
      if (/[0-9]/.test(ch) || /[A-Za-z]/.test(ch)) {
        const start = i
        let isNumeric = /[0-9]/.test(ch)
        let hasLetters = /[A-Za-z]/.test(ch)

        while (i < input.length && (/[0-9]/.test(input[i]) || /[A-Za-z]/.test(input[i]))) {
          if (/[0-9]/.test(input[i])) isNumeric = true
          if (/[A-Za-z]/.test(input[i])) hasLetters = true
          i++
        }

        const raw = input.slice(start, i)

        // W% / nW% als Würfel erkennen (z.B. W%, 2W%)
        if (hasLetters && /^\d*W$/i.test(raw) && i < input.length && input[i] === '%') {
          i++ // '%' mitkonsumieren
          tokens.push({ type: 'DICE', value: raw + '%', pos: start })
        } else if (hasLetters && /^\d*W\d+$/i.test(raw)) {
          tokens.push({ type: 'DICE', value: raw, pos: start })
        } else if (isNumeric && !hasLetters) {
          tokens.push({ type: 'NUMBER', value: raw, pos: start })
        } else if (hasLetters) {
          // Check if followed by '(' → function call like bonus(Gs)
          let peek = i
          while (peek < input.length && /\s/.test(input[peek])) peek++
          if (peek < input.length && input[peek] === '(') {
            tokens.push({ type: 'FUNCTION', value: raw, pos: start })
          } else {
            tokens.push({ type: 'VARIABLE', value: raw, pos: start })
          }
        }

        continue
      }

      throw new Error(`Unerwartetes Zeichen "${ch}" an Position ${i}`)
    }

    this.tokens = tokens
  }

  // ── Parser (Recursive Descent) ──────────────────────────────────────────────

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null
  }

  private consume(type: TokenType): Token {
    const token = this.peek()
    if (!token || token.type !== type) {
      const found = token?.value ?? 'EOF'
      throw new Error(
        `Erwartet "${type}", gefunden "${found}" an Position ${token?.pos ?? this.pos}`,
      )
    }
    this.pos++
    return token
  }

  private has(type: TokenType): boolean {
    return this.peek()?.type === type
  }

  /**
   * expression = term (('+' | '-') term)*
   */
  private parseExpression(): number {
    let result = this.parseTerm()

    while (this.has('PLUS') || this.has('MINUS')) {
      if (this.has('PLUS')) {
        this.consume('PLUS')
        result += this.parseTerm()
      } else {
        this.consume('MINUS')
        result -= this.parseTerm()
      }
    }

    return result
  }

  /**
   * term = factor (('*' | '/') factor)*
   * M5-Konvention: `/` rundet Math.floor pro Division.
   */
  private parseTerm(): number {
    let result = this.parseFactor()

    while (this.has('MULT') || this.has('DIV')) {
      if (this.has('MULT')) {
        this.consume('MULT')
        result *= this.parseFactor()
      } else {
        this.consume('DIV')
        // M5: Jede Division wird einzeln abgerundet
        result = Math.floor(result / this.parseFactor())
      }
    }

    return result
  }

  /**
   * factor = NUMBER | VARIABLE | FUNCTION | DICE | '(' expression ')' | '-' factor
   */
  private parseFactor(): number {
    // Unäres Minus
    if (this.has('MINUS')) {
      this.consume('MINUS')
      return -this.parseFactor()
    }

    if (this.has('NUMBER')) {
      const token = this.consume('NUMBER')
      return parseInt(token.value, 10)
    }

    if (this.has('DICE')) {
      const token = this.consume('DICE')
      // Für evaluate() nehmen wir den Erwartungswert
      return this.evaluateDiceExpected(token.value)
    }

    if (this.has('FUNCTION')) {
      const token = this.consume('FUNCTION')
      this.consume('LPAREN')
      const arg = this.parseExpression()
      this.consume('RPAREN')
      return this.applyFunction(token.value, arg)
    }

    if (this.has('VARIABLE')) {
      const token = this.consume('VARIABLE')
      const value = this.context[token.value]
      if (value === undefined) {
        throw new Error(
          `Unbekannte Variable "${token.value}" an Position ${token.pos}`,
        )
      }
      return value
    }

    if (this.has('LPAREN')) {
      this.consume('LPAREN')
      const result = this.parseExpression()
      this.consume('RPAREN')
      return result
    }

    const token = this.peek()
    throw new Error(
      `Unerwartetes Token "${token?.value ?? 'EOF'}" an Position ${token?.pos ?? this.pos}`,
    )
  }

  /**
   * Berechnet den Erwartungswert eines Dice-Tokens.
   * nWm → n * (m+1)/2, Wm → (m+1)/2, W% → 50.5
   */
  private evaluateDiceExpected(raw: string): number {
    const upper = raw.toUpperCase()

    if (upper === 'W%') return 50.5

    // nWm oder Wm
    const match = upper.match(/^(\d+)?W(\d+)$/)

    if (!match) {
      throw new Error(`Ungültige Würfelnotation "${raw}"`)
    }

    const count = match[1] ? parseInt(match[1], 10) : 1
    const sides = parseInt(match[2], 10)
    const expectedPerDie = (sides + 1) / 2

    return count * expectedPerDie
  }

  /**
   * Wendet eine benannte Funktion auf einen Argumentwert an.
   */
  private applyFunction(name: string, arg: number): number {
    if (name === 'bonus' || name === 'fertigkeitsbonus') {
      return this.fertigkeitsbonus(arg)
    }
    throw new Error(`Unbekannte Funktion "${name}"`)
  }

  /**
   * M5-Fertigkeitsbonus-Tabelle.
   *   ≤5   → −2
   *   ≤20  → −1
   *   ≤80  →  0
   *   ≤95  → +1
   *   >95  → +2
   */
  private fertigkeitsbonus(v: number): number {
    if (v <= 5) return -2
    if (v <= 20) return -1
    if (v <= 80) return 0
    if (v <= 95) return +1
    return +2
  }
}

/** Singleton-Instanz. FormulaEngine ist zustandslos, daher sicher als Singleton. */
export const formulaEngine = new FormulaEngine()
