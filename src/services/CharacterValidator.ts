import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { Skill } from '../types/Skill'
import type { ValidationIssue, ValidationResult, FixDescription, FixResult } from '../types/CharacterValidation'
import { formulaEngine } from './FormulaEngine'
import { computeGrad } from './GradUtils'

/**
 * CharacterValidator — prüft Charaktere gegen das Regelwerk (validate)
 * und ergänzt fehlende Pflicht-Skills (autoFix).
 *
 * validate() ändert den Character nicht.
 * autoFix() gibt einen neuen Character zurück (immutable).
 */
export class CharacterValidator {
  /**
   * Validiert einen Character gegen die geladenen Regeln.
   * Führt alle 7 Prüfkategorien (A–H) aus.
   */
  validate(character: Character, rules: RulesData): ValidationResult {
    const issues: ValidationIssue[] = []

    // Kategorie A: Struktur & Referenzen
    this.validateCategoryA(character, rules, issues)

    // Kategorie B: Eigenschaften innerhalb Rassen-Restriktionen
    this.validateCategoryB(character, rules, issues)

    // Kategorie C: Fertigkeiten
    this.validateCategoryC(character, rules, issues)

    // Kategorie D: Zauber
    this.validateCategoryD(character, rules, issues)

    // Kategorie E: EP/Gold
    this.validateCategoryE(character, issues)

    // Kategorie F: Boni
    this.validateCategoryF(character, issues)

    // Kategorie G: Grad-abhängige Skills
    this.validateCategoryG(character, rules, issues)

    // Kategorie H: Formelfehler
    this.validateCategoryH(character, rules, issues)

    // Kategorie I: Formel-basierte Werte prüfen (Boni + InnateSkills)
    this.validateCategoryI(character, rules, issues)

    return {
      issues,
      hasErrors: issues.some(i => i.severity === 'error'),
      hasWarnings: issues.some(i => i.severity === 'warning'),
    }
  }

  /**
   * Ergänzt fehlende Pflicht-Skills (innateSkills) und Defaults.
   * Überschreibt niemals bestehende Werte.
   * Gibt einen neuen Character zurück (immutable).
   */
  autoFix(character: Character, rules: RulesData): FixResult {
    const applied: FixDescription[] = []

    // 0. Boni-Defaults sicherstellen (auch bei {} oder partiellen Boni)
    const DEFAULT_BONI = { AusB: 0, SchB: 0, AnB: 0, AbB: 0, ZauB: 0, ResBg: 0, ResBk: 0 }
    const rawBoni = character.boni
    const boni = { ...DEFAULT_BONI, ...(rawBoni ?? {}) }
    if (!rawBoni || Object.keys(rawBoni).length === 0) {
      applied.push({
        action: 'add_boni_defaults',
        target: 'boni',
        description: 'Bonus-Werte (boni) waren nicht gesetzt — auf 0 gesetzt',
      })
    }

    let skills = [...(character.skills ?? [])]
    const knownIds = new Set(skills.map(s => s.skillId))

    // Rasse und Typ ermitteln
    const race = rules.races.find(r => r.id === character.raceId)
    const type = rules.types.find(t => t.id === character.typeId)
    const skillBonuses = race?.skillBonuses ?? {}

    // Rassen- und Typ-Boni auf Default-Boni anwenden (Formel → Rasse → Typ)
    for (const pb of race?.propertyBonuses ?? []) {
      const key = pb.id as keyof Character['boni']
      if (key in boni) {
        boni[key] = pb.mode === 'set' ? pb.value : boni[key] + pb.value
      }
    }
    for (const pb of type?.propertyBonuses ?? []) {
      const key = pb.id as keyof Character['boni']
      if (key in boni) {
        boni[key] = pb.mode === 'set' ? pb.value : boni[key] + pb.value
      }
    }

    // Kontext für FormulaEngine: Eigenschaften + Boni
    const ctx = {
      ...character.properties,
      ...boni,
    }

    // Formel-Lookup
    const formulaMap = new Map<string, string>()
    for (const f of (rules.universalRules?.formulas ?? [])) {
      formulaMap.set(f.id, f.formula)
    }

    // 1. InnateSkills iterieren, fehlende ergänzen
    for (const innate of (rules.universalRules?.innateSkills ?? [])) {
      // Condition prüfen
      if (innate.condition === 'hasSpells' && (!character.spells || character.spells.length === 0)) {
        continue
      }

      if (knownIds.has(innate.id)) continue

      // FW berechnen
      let fw = innate.defaultFw

      if (innate.formula !== undefined) {
        // Direkte Formel
        try {
          fw = Math.max(0, formulaEngine.evaluate(innate.formula, ctx))
        } catch (e) {
          // Formelfehler — Fallback auf defaultFw
          fw = innate.defaultFw
        }
      } else if (innate.formulaId !== undefined) {
        // Formel per ID referenzieren
        const formulaStr = formulaMap.get(innate.formulaId)
        if (formulaStr !== undefined) {
          try {
            fw = Math.max(0, formulaEngine.evaluate(formulaStr, ctx))
          } catch (e) {
            fw = innate.defaultFw
          }
        }
      } else if (innate.gradValues) {
        // gradValues: Skill-Schema nachschlagen
        const skillSchema = rules.skills.find(s => s.id === innate.id)
        if (skillSchema?.gradValues) {
          fw = this.lookupGradValue(skillSchema, character.totalEs)
        }
      }

      // Rassen-Bonus addieren
      const bonus = skillBonuses[innate.id] ?? 0
      fw += bonus

      skills.push({ skillId: innate.id, value: fw, pp: 0 })
      knownIds.add(innate.id)

      applied.push({
        action: 'add_innate_skill',
        target: innate.id,
        description: `Skill "${innate.id}" mit FW ${fw} ergänzt`,
      })
    }

    // 2. PP-Defaults auf Skills ohne pp
    skills = skills.map(s => s.pp === undefined ? { ...s, pp: 0 } : s)

    // 3. Spell-Defaults
    let spells = [...(character.spells ?? [])]
    spells = spells.map(s => {
      if (typeof s === 'string') {
        applied.push({
          action: 'convert_spell_string',
          target: s,
          description: `Spell "${s}" von String nach Objekt konvertiert`,
        })
        return { spellId: s, pp: 0 }
      }
      return s.pp === undefined ? { ...s, pp: 0 } : s
    })

    const fixed: Character = {
      ...character,
      boni,
      skills,
      spells,
    }

    return { fixed, applied }
  }

  /**
   * Korrigiert formel-basierte Werte (Boni, InnateSkills, Grad-Skills, Reichweite).
   * Überschreibt bestehende Werte mit den berechneten Sollwerten.
   * Gibt einen neuen Character zurück (immutable).
   *
   * Reihenfolge:
   * 1. Boni aus Formeln (BONUS_FORMULA_MISMATCH)
   * 2. InnateSkill-FWs aus Formeln (INNATE_FORMULA_MISMATCH)
   * 3. Grad-basierte Skills (GRAD_SKILL_VALUE_MISMATCH)
   * 4. Basis-/Maximalwert-Korrektur (SKILL_BELOW_BASE / SKILL_ABOVE_MAX)
   */
  correctIssues(character: Character, rules: RulesData): FixResult {
    const applied: FixDescription[] = []

    let boni: Character['boni'] = { ...(character.boni ?? {}) }
    let skills = character.skills.map(s => ({ ...s }))

    // ── Kontext für FormulaEngine ──
    const ctx: Record<string, number> = {
      ...character.properties,
      ...boni,
    }

    // Formel-Lookup-Tabelle
    const formulaMap = new Map<string, string>()
    for (const f of (rules.universalRules?.formulas ?? [])) {
      formulaMap.set(f.id, f.formula)
    }

    // ── 1. Boni aus Formeln korrigieren ──
    for (const formula of (rules.universalRules?.formulas ?? [])) {
      const id = formula.id as keyof Character['boni']
      if (!(id in boni)) continue

      try {
        const expected = formulaEngine.evaluate(formula.formula, ctx)
        if (boni[id] !== expected) {
          const old = boni[id]
          boni[id] = expected
          ctx[id] = expected
          applied.push({
            action: 'correct_bonus',
            target: id,
            description: `Bonus ${id} von ${old} auf ${expected} korrigiert (${formula.formula})`,
          })
        }
      } catch {
        // Syntax-Fehler — von validate() gemeldet, hier ignorieren
      }
    }

    // ── 1b. Rassen- und Typ-Boni auf Boni anwenden (Formel → Rasse → Typ) ──
    const corrRace = rules.races.find(r => r.id === character.raceId)
    const corrType = rules.types.find(t => t.id === character.typeId)
    for (const pb of corrRace?.propertyBonuses ?? []) {
      const key = pb.id as keyof Character['boni']
      if (!(key in boni)) continue
      const old = boni[key]
      boni[key] = pb.mode === 'set' ? pb.value : boni[key] + pb.value
      ctx[key] = boni[key]
      if (old !== boni[key]) {
        applied.push({
          action: 'correct_bonus',
          target: key,
          description: `Bonus ${key} von ${old} auf ${boni[key]} korrigiert (Rasse, mode:${pb.mode})`,
        })
      }
    }
    for (const pb of corrType?.propertyBonuses ?? []) {
      const key = pb.id as keyof Character['boni']
      if (!(key in boni)) continue
      const old = boni[key]
      boni[key] = pb.mode === 'set' ? pb.value : boni[key] + pb.value
      ctx[key] = boni[key]
      if (old !== boni[key]) {
        applied.push({
          action: 'correct_bonus',
          target: key,
          description: `Bonus ${key} von ${old} auf ${boni[key]} korrigiert (Typ, mode:${pb.mode})`,
        })
      }
    }

    // ── 2. InnateSkill-FWs aus Formeln korrigieren ──
    for (const innate of (rules.universalRules?.innateSkills ?? [])) {
      let formulaStr: string | undefined

      if (innate.formulaId) {
        formulaStr = formulaMap.get(innate.formulaId)
      } else if (innate.formula !== undefined) {
        formulaStr = innate.formula
      }

      if (!formulaStr) continue

      const idx = skills.findIndex(s => s.skillId === innate.id)
      if (idx === -1) continue

      try {
        const expected = Math.max(0, formulaEngine.evaluate(formulaStr, ctx))

        if (skills[idx].value !== expected) {
          const old = skills[idx].value
          skills[idx] = { ...skills[idx], value: expected }
          applied.push({
            action: 'correct_innate_skill',
            target: innate.id,
            description: `FW von "${innate.id}" von ${old} auf ${expected} korrigiert (${formulaStr})`,
          })
        }
      } catch {
        // Syntax-Fehler ignorieren
      }
    }

    // ── 3. Grad-basierte Skills korrigieren ──
    for (let i = 0; i < skills.length; i++) {
      const schema = rules.skills.find(s => s.id === skills[i].skillId)
      if (!schema?.gradValues) continue

      const expectedFw = this.lookupGradValue(schema, character.totalEs)
      if (skills[i].value !== expectedFw) {
        const old = skills[i].value
        skills[i] = { ...skills[i], value: expectedFw }
        applied.push({
          action: 'correct_grad_skill',
          target: skills[i].skillId,
          description: `FW von "${skills[i].skillId}" von ${old} auf ${expectedFw} korrigiert (Grad ${computeGrad(character.totalEs)})`,
        })
      }
    }

    // ── 4. Basis-/Maximalwert-Korrektur ──
    for (let i = 0; i < skills.length; i++) {
      const schema = rules.skills.find(s => s.id === skills[i].skillId)
      if (!schema) continue

      if (skills[i].value < schema.baseValue) {
        const old = skills[i].value
        skills[i] = { ...skills[i], value: schema.baseValue }
        applied.push({
          action: 'correct_skill_range',
          target: skills[i].skillId,
          description: `FW von "${skills[i].skillId}" von ${old} auf ${schema.baseValue} korrigiert (Basiswert)`,
        })
      } else if (skills[i].value > schema.maxValue) {
        const old = skills[i].value
        skills[i] = { ...skills[i], value: schema.maxValue }
        applied.push({
          action: 'correct_skill_range',
          target: skills[i].skillId,
          description: `FW von "${skills[i].skillId}" von ${old} auf ${schema.maxValue} korrigiert (Maximalwert)`,
        })
      }
    }

    const fixed: Character = {
      ...character,
      boni,
      skills,
    }

    return { fixed, applied }
  }

  // ── Kategorie A: Struktur & Referenzen ──────────────────────────────────────

  private validateCategoryA(character: Character, rules: RulesData, issues: ValidationIssue[]): void {
    // MISSING_RACE
    if (!rules.races.some(r => r.id === character.raceId)) {
      issues.push({
        path: 'raceId',
        severity: 'error',
        code: 'MISSING_RACE',
        message: `Rasse "${character.raceId}" nicht im Regelwerk gefunden`,
        actual: character.raceId,
      })
    }

    // MISSING_TYPE
    if (!rules.types.some(t => t.id === character.typeId)) {
      issues.push({
        path: 'typeId',
        severity: 'error',
        code: 'MISSING_TYPE',
        message: `Typ "${character.typeId}" nicht im Regelwerk gefunden`,
        actual: character.typeId,
      })
    }

    // TYPE_NOT_ALLOWED_FOR_RACE
    const race = rules.races.find(r => r.id === character.raceId)
    if (race && race.availableTypes.length > 0 && !race.availableTypes.includes(character.typeId)) {
      issues.push({
        path: 'typeId',
        severity: 'error',
        code: 'TYPE_NOT_ALLOWED_FOR_RACE',
        message: `Typ "${character.typeId}" ist für Rasse "${race.name}" nicht erlaubt`,
        actual: character.typeId,
      })
    }

    // UNKNOWN_SKILL
    for (const skill of character.skills) {
      // Multi-Instanz-Skills wie "Sprache:Albisch" haben keine direkte rules.skills-ID
      if (rules.skillRules?.multiInstanceSkills?.some(m => skill.skillId.startsWith(m.idPrefix))) {
        continue
      }

      if (!rules.skills.some(s => s.id === skill.skillId)) {
        issues.push({
          path: `skills.${skill.skillId}`,
          severity: 'error',
          code: 'UNKNOWN_SKILL',
          message: `Fertigkeit "${skill.skillId}" nicht im Regelwerk gefunden`,
          actual: skill.skillId,
        })
      }
    }

    // MISSING_ORIGIN
    if (!rules.origins.some(o => o.id === character.originId)) {
      issues.push({
        path: 'originId',
        severity: 'error',
        code: 'MISSING_ORIGIN',
        message: `Herkunft "${character.originId}" nicht im Regelwerk gefunden`,
        actual: character.originId,
      })
    }

    // MISSING_SOCIAL_STATUS
    if (!rules.socialStatuses.some(s => s.id === character.socialStatusId)) {
      issues.push({
        path: 'socialStatusId',
        severity: 'error',
        code: 'MISSING_SOCIAL_STATUS',
        message: `Stand "${character.socialStatusId}" nicht im Regelwerk gefunden`,
        actual: character.socialStatusId,
      })
    }

    // FORBIDDEN_SKILL
    if (race?.forbiddenSkills) {
      for (const skill of character.skills) {
        if (race.forbiddenSkills.includes(skill.skillId)) {
          issues.push({
            path: `skills.${skill.skillId}`,
            severity: 'error',
            code: 'FORBIDDEN_SKILL',
            message: `Fertigkeit "${skill.skillId}" ist für Rasse "${race.name}" verboten`,
            actual: skill.skillId,
          })
        }
      }
    }
  }

  // ── Kategorie B: Eigenschaften ──────────────────────────────────────────────

  private validateCategoryB(character: Character, rules: RulesData, issues: ValidationIssue[]): void {
    const race = rules.races.find(r => r.id === character.raceId)
    if (!race) return

    const baseProps: Record<string, number> = {
      St: character.properties.St,
      Gs: character.properties.Gs,
      Gw: character.properties.Gw,
      Ko: character.properties.Ko,
      In: character.properties.In,
      Zt: character.properties.Zt,
    }

    for (const [key, value] of Object.entries(baseProps)) {
      const range = race.propertyRestrictions?.[key]
      if (range) {
        if ((range.min !== undefined && value < range.min) ||
            (range.max !== undefined && value > range.max)) {
          issues.push({
            path: `properties.${key}`,
            severity: 'error',
            code: 'PROPERTY_OUT_OF_RANGE',
            message: `Eigenschaft ${key} (${value}) außerhalb des Rassenlimits${
              range.min !== undefined ? ` [${range.min}` : ' [—'
            }${range.max !== undefined ? `-${range.max}]` : ']'}`,
            actual: value,
            expected: range.min !== undefined
              ? `${range.min}-${range.max ?? '∞'}`
              : undefined,
          })
        }
      }
    }

    // DERIVED_OUT_OF_RANGE (Au)
    const derivedRestrictions = race.derivedRestrictions
    if (derivedRestrictions) {
      for (const [key, value] of Object.entries(character.properties)) {
        const range = derivedRestrictions[key]
        if (range) {
          if ((range.min !== undefined && (value as number) < range.min) ||
              (range.max !== undefined && (value as number) > range.max)) {
            issues.push({
              path: `properties.${key}`,
              severity: 'error',
              code: 'DERIVED_OUT_OF_RANGE',
              message: `Abgeleitete Eigenschaft ${key} (${value}) außerhalb des Limits${
                range.min !== undefined ? ` [${range.min}` : ' [—'
              }${range.max !== undefined ? `-${range.max}]` : ']'}`,
              actual: value as number,
            })
          }
        }
      }
    }
  }

  // ── Kategorie C: Fertigkeiten ──────────────────────────────────────────────

  private validateCategoryC(character: Character, rules: RulesData, issues: ValidationIssue[]): void {
    // Skill-Schema-Lookup
    const skillMap = new Map<string, Skill>()
    for (const skill of rules.skills) {
      skillMap.set(skill.id, skill)
    }

    for (const cs of character.skills) {
      const schema = skillMap.get(cs.skillId)
      if (!schema) continue

      // SKILL_BELOW_BASE
      if (cs.value < schema.baseValue) {
        issues.push({
          path: `skills.${cs.skillId}.value`,
          severity: 'error',
          code: 'SKILL_BELOW_BASE',
          message: `Fertigkeit "${cs.skillId}" (FW ${cs.value}) unter Basiswert ${schema.baseValue}`,
          actual: cs.value,
          expected: schema.baseValue,
        })
      }

      // SKILL_ABOVE_MAX
      if (cs.value > schema.maxValue) {
        issues.push({
          path: `skills.${cs.skillId}.value`,
          severity: 'error',
          code: 'SKILL_ABOVE_MAX',
          message: `Fertigkeit "${cs.skillId}" (FW ${cs.value}) über Maximalwert ${schema.maxValue}`,
          actual: cs.value,
          expected: schema.maxValue,
        })
      }

      // MISSING_BASE_SKILL
      if (schema.baseSkillId && !character.skills.some(s => s.skillId === schema.baseSkillId)) {
        issues.push({
          path: `skills.${cs.skillId}`,
          severity: 'error',
          code: 'MISSING_BASE_SKILL',
          message: `Fertigkeit "${cs.skillId}" benötigt Basis-Fertigkeit "${schema.baseSkillId}"`,
        })
      }

    }

    // MISSING_INNATE_SKILL
    for (const innate of (rules.universalRules?.innateSkills ?? [])) {
      // Condition prüfen
      if (innate.condition === 'hasSpells' && (!character.spells || character.spells.length === 0)) {
        continue
      }

      if (!character.skills.some(s => s.skillId === innate.id)) {
        issues.push({
          path: `skills.${innate.id}`,
          severity: 'warning',
          code: 'MISSING_INNATE_SKILL',
          message: `Pflicht-Fertigkeit "${innate.id}" fehlt`,
        })
      }
    }

    // MISSING_RACIAL_SKILL
    const race = rules.races.find(r => r.id === character.raceId)
    if (race?.skills) {
      for (const rs of race.skills) {
        if (!character.skills.some(s => s.skillId === rs.skillId)) {
          issues.push({
            path: `skills.${rs.skillId}`,
            severity: 'warning',
            code: 'MISSING_RACIAL_SKILL',
            message: `Rassen-Fertigkeit "${rs.skillId}" fehlt`,
          })
        }
      }
    }
  }

  // ── Kategorie D: Zauber ────────────────────────────────────────────────────

  private validateCategoryD(character: Character, rules: RulesData, issues: ValidationIssue[]): void {
    if (!character.spells || character.spells.length === 0) return

    // SPELLS_WITHOUT_CASTER_TYPE
    const type = rules.types.find(t => t.id === character.typeId)
    if (type && (!type.spellCosts || Object.keys(type.spellCosts).length === 0)) {
      issues.push({
        path: 'spells',
        severity: 'warning',
        code: 'SPELLS_WITHOUT_CASTER_TYPE',
        message: `Charakter hat Zauber, aber Typ "${type.name}" hat keine Zauberkosten`,
      })
    }

    // UNKNOWN_SPELL
    for (const spell of character.spells) {
      const spellId = typeof spell === 'string' ? spell : spell.spellId
      if (!rules.spells.some(s => s.id === spellId)) {
        issues.push({
          path: `spells.${spellId}`,
          severity: 'warning',
          code: 'UNKNOWN_SPELL',
          message: `Zauber "${spellId}" nicht im Regelwerk gefunden`,
          actual: spellId,
        })
      }
    }
  }

  // ── Kategorie E: EP/Gold ───────────────────────────────────────────────────

  private validateCategoryE(character: Character, issues: ValidationIssue[]): void {
    // EP_EXCEEDS_ES
    if (character.availableEp > character.totalEs) {
      issues.push({
        path: 'availableEp',
        severity: 'warning',
        code: 'EP_EXCEEDS_ES',
        message: `Verfügbare EP (${character.availableEp}) übersteigen Erfahrungsschatz (${character.totalEs})`,
        actual: character.availableEp,
        expected: character.totalEs,
      })
    }

    // NEGATIVE_GOLD
    if ((character.gold ?? 0) < 0) {
      issues.push({
        path: 'gold',
        severity: 'warning',
        code: 'NEGATIVE_GOLD',
        message: `Gold ist negativ (${character.gold})`,
        actual: character.gold,
      })
    }
  }

  // ── Kategorie F: Boni ──────────────────────────────────────────────────────

  private validateCategoryF(character: Character, issues: ValidationIssue[]): void {
    if (!character.boni || Object.keys(character.boni).length === 0) return

    const allZero = Object.values(character.boni).every(v => v === 0)
    if (allZero) {
      issues.push({
        path: 'boni',
        severity: 'info',
        code: 'BONUS_VALUE_SUSPICIOUS',
        message: 'Alle Boni sind auf 0 — wurden sie korrekt gesetzt?',
      })
    }
  }

  // ── Kategorie G: Grad-abhängige Skills ─────────────────────────────────────

  private validateCategoryG(character: Character, rules: RulesData, issues: ValidationIssue[]): void {
    const grad = computeGrad(character.totalEs)

    for (const cs of character.skills) {
      const schema = rules.skills.find(s => s.id === cs.skillId)
      if (!schema?.gradValues) continue

      const expectedFw = this.lookupGradValue(schema, character.totalEs)

      if (cs.value !== expectedFw) {
        issues.push({
          path: `skills.${cs.skillId}.value`,
          severity: 'warning',
          code: 'GRAD_SKILL_VALUE_MISMATCH',
          message: `Fertigkeit "${cs.skillId}" hat FW ${cs.value}, erwartet wird FW ${expectedFw} für Grad ${grad}`,
          actual: cs.value,
          expected: expectedFw,
        })
      }
    }
  }

  // ── Kategorie H: Formelfehler ──────────────────────────────────────────────

  private validateCategoryH(character: Character, rules: RulesData, issues: ValidationIssue[]): void {
    const ctx = {
      ...character.properties,
      ...character.boni,
    }

    for (const formula of (rules.universalRules?.formulas ?? [])) {
      try {
        formulaEngine.evaluate(formula.formula, ctx)
      } catch (e) {
        issues.push({
          path: `universalRules.formulas.${formula.id}`,
          severity: 'error',
          code: 'FORMULA_ERROR',
          message: `Formel "${formula.id}" (${formula.formula}) kann nicht ausgewertet werden: ${(e as Error).message}`,
        })
      }
    }
  }

  // ── Kategorie I: Formel-basierte Werte ──────────────────────────────────────

  private validateCategoryI(character: Character, rules: RulesData, issues: ValidationIssue[]): void {
    if (!character.boni || Object.keys(character.boni).length === 0) return

    const ctx = {
      ...character.properties,
      ...character.boni,
    }

    // Formel-Lookup
    const formulaMap = new Map<string, string>()
    for (const f of (rules.universalRules?.formulas ?? [])) {
      formulaMap.set(f.id, f.formula)
    }

    // Rasse und Typ für propertyBonuses
    const valRace = rules.races.find(r => r.id === character.raceId)
    const valType = rules.types.find(t => t.id === character.typeId)

    // 1. Bonus-Formeln prüfen (character.boni[key] vs. Formel + Rasse/Typ)
    for (const formula of (rules.universalRules?.formulas ?? [])) {
      const id = formula.id
      if (!(id in character.boni)) continue

      let expected: number
      try {
        expected = formulaEngine.evaluate(formula.formula, ctx)
      } catch {
        continue  // Syntax-Fehler wird von Kategorie H gemeldet
      }

      // Rassen- und Typ-Boni auf den Sollwert anrechnen
      const raceBonus = valRace?.propertyBonuses?.find(pb => pb.id === id)
      if (raceBonus) {
        expected = raceBonus.mode === 'set' ? raceBonus.value : expected + raceBonus.value
      }
      const typeBonus = valType?.propertyBonuses?.find(pb => pb.id === id)
      if (typeBonus) {
        expected = typeBonus.mode === 'set' ? typeBonus.value : expected + typeBonus.value
      }

      const actual = (character.boni as unknown as Record<string, number>)[id]
      if (actual !== expected) {
        issues.push({
          path: `boni.${id}`,
          severity: 'warning',
          code: 'BONUS_FORMULA_MISMATCH',
          message: `Bonus ${id} ist ${actual}, erwartet ${expected} (Formel + Rasse/Typ-Boni)`,
          actual,
          expected,
        })
      }
    }

    // 2. InnateSkill-Formeln prüfen (skills[].value vs. Formel)
    for (const innate of (rules.universalRules?.innateSkills ?? [])) {
      let formulaStr: string | undefined

      if (innate.formulaId) {
        formulaStr = formulaMap.get(innate.formulaId)
      } else if (innate.formula !== undefined) {
        formulaStr = innate.formula
      }

      if (!formulaStr) continue

      const cs = character.skills.find(s => s.skillId === innate.id)
      if (!cs) continue  // fehlt → MISSING_INNATE_SKILL

      let expected: number
      try {
        expected = formulaEngine.evaluate(formulaStr, ctx)
      } catch {
        continue
      }

      if (cs.value !== expected) {
        issues.push({
          path: `skills.${innate.id}.value`,
          severity: 'warning',
          code: 'INNATE_FORMULA_MISMATCH',
          message: `Fertigkeit "${innate.id}" hat FW ${cs.value}, Formel ${formulaStr} ergibt ${expected}`,
          actual: cs.value,
          expected,
        })
      }
    }
  }

  // ── Helper: lookupGradValue ────────────────────────────────────────────────

  /**
   * Schlägt den FW für einen Skill mit gradValues[]-Tabelle nach.
   * Sortiert absteigend nach Grad, erster Treffer mit grad ≤ currentGrad.
   * Fallback: skill.baseValue.
   */
  private lookupGradValue(skill: Skill, totalEs: number): number {
    const grad = computeGrad(totalEs)
    if (!skill.gradValues || skill.gradValues.length === 0) {
      return skill.baseValue
    }

    const sorted = [...skill.gradValues].sort((a, b) => b.grad - a.grad)

    for (const entry of sorted) {
      if (entry.grad <= grad) {
        return entry.fw
      }
    }

    return skill.baseValue
  }
}

/** Singleton-Instanz. */
export const characterValidator = new CharacterValidator()
