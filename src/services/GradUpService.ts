import type { Character } from '../types/Character'
import type { RulesData, GradUpRules, GradUpRule } from '../types/Rules'
import type { Skill } from '../types/Skill'
import { computeGrad } from './GradUtils'

/**
 * GradStepInput — Eingabedaten für einen einzelnen Gradschritt.
 */
export interface GradStepInput {
  /** W%-Ergebnis (1–100) */
  wpResult: number
  /** 1W3-Ergebnis für die Eigenschaftssteigerung (nur wenn W% > 50) */
  propertyGain: number
  /** Bei freier Wahl (W% 96–100): die gewählte Eigenschaft */
  chosenProperty?: string
  /** 1W3-Ergebnis für AP-Erhöhung */
  apDice: number
}

/**
 * GradStepResult — Resultat eines einzelnen Gradschritts.
 */
export interface GradStepResult {
  geaenderteEigenschaft: { name: string; alterWert: number; neuerWert: number } | null
  apErhoehung: number
  neuerAusB: number
}

/**
 * Default-GradUpRules, wenn in den Rules-Daten keine vorhanden sind.
 */
const DEFAULT_GRADUP_RULES: GradUpRules = {
  apDice: '1W3',
  propertyGainDice: '1W3',
  propertyMaxValue: 100,
  propertyGainTable: [
    { range: [1, 50],   property: null },
    { range: [51, 55],  property: 'Wk' },
    { range: [56, 60],  property: 'pA' },
    { range: [61, 65],  property: 'Au' },
    { range: [66, 70],  property: 'St' },
    { range: [71, 75],  property: 'Gs' },
    { range: [76, 80],  property: 'Gw' },
    { range: [81, 85],  property: 'Ko' },
    { range: [86, 90],  property: 'In' },
    { range: [91, 95],  property: 'Zt' },
    { range: [96, 100], property: 'free' },
  ],
}

/**
 * GradUpService — kapselt die Logik für Gradaufstiege.
 *
 * Berechnet AP-Zuwachs und Eigenschaftssteigerung pro Gradschritt
 * auf Basis der Rules-Daten. Arbeitet immutable (gibt neue Character-Objekte zurück).
 */
export class GradUpService {
  /**
   * Holt die GradUpRules aus den Rules-Daten (mit Fallback auf Defaults).
   */
  private getGradUpRules(rules: RulesData): GradUpRules {
    return rules.universalRules?.gradUpRules ?? DEFAULT_GRADUP_RULES
  }

  /**
   * Schlägt anhand des W%-Wurfs die betroffene Eigenschaft nach.
   *
   * @param wpResult - Das W%-Ergebnis (1–100).
   * @param table    - Die Eigenschaftssteigerungs-Tabelle.
   * @returns Die Eigenschafts-ID (z.B. "St") oder null (keine Steigerung) oder "free" (freie Wahl).
   */
  lookupProperty(wpResult: number, table: GradUpRule[]): string | null {
    for (const entry of table) {
      const [lo, hi] = entry.range
      if (wpResult >= lo && wpResult <= hi) {
        return entry.property
      }
    }
    return null
  }

  /**
   * Berechnet den Ausdauerbonus (AusB) für einen Character.
   * Formel: Ko/10 + St/20 (wie in M5_FORMULAS).
   */
  private computeAusB(props: Character['properties']): number {
    return Math.floor(props.Ko / 10) + Math.floor(props.St / 20)
  }

  /**
   * Berechnet die Änderungen für EINEN Gradschritt.
   *
   * @param character    - Der aktuelle Character vor diesem Schritt.
   * @param rules        - Die geladenen Rules-Daten.
   * @param currentGrad  - Der aktuelle Grad vor diesem Schritt.
   * @param input        - Die Würfelergebnisse für diesen Schritt.
   * @returns Das Ergebnis dieses Gradschritts.
   */
  computeStep(
    character: Character,
    rules: RulesData,
    currentGrad: number,
    input: GradStepInput,
  ): { character: Character; result: GradStepResult } {
    const gradUpRules = this.getGradUpRules(rules)
    const table = gradUpRules.propertyGainTable
    const propertyMax = gradUpRules.propertyMaxValue
    let updated = { ...character }

    // ── 1. Eigenschaftssteigerung ──
    let changedProperty: { name: string; alterWert: number; neuerWert: number } | null = null
    const propName = this.lookupProperty(input.wpResult, table)

    function updateProperty(props: Character['properties'], key: string, value: number): Character['properties'] {
      const result: Record<string, number> = { ...props as unknown as Record<string, number> }
      result[key] = value
      return result as unknown as Character['properties']
    }

    function propsMap(p: Character['properties']): Record<string, number> {
      return p as unknown as Record<string, number>
    }

    if (propName && propName !== 'free' && input.propertyGain > 0) {
      // Bestimmte Eigenschaft steigern
      const alterWert = propsMap(updated.properties)[propName] ?? 0
      const neuerWert = Math.min(alterWert + input.propertyGain, propertyMax)
      if (neuerWert !== alterWert) {
        updated = {
          ...updated,
          properties: updateProperty(updated.properties, propName, neuerWert),
        }
        changedProperty = { name: propName, alterWert, neuerWert }
      }
    } else if (propName === 'free' && input.chosenProperty && input.propertyGain > 0) {
      // Freie Wahl (W% 96–100)
      const alterWert = propsMap(updated.properties)[input.chosenProperty] ?? 0
      const neuerWert = Math.min(alterWert + input.propertyGain, propertyMax)
      if (neuerWert !== alterWert) {
        updated = {
          ...updated,
          properties: updateProperty(updated.properties, input.chosenProperty, neuerWert),
        }
        changedProperty = { name: input.chosenProperty, alterWert, neuerWert }
      }
    }

    // ── 2. AP-Erhöhung ──
    // ΔAusB = Differenz durch Ko-Änderung im selben Schritt.
    // Nur die Änderung wird auf AP addiert, nicht der volle AusB.
    const alterAusB = this.computeAusB(character.properties)
    const neuerAusB = this.computeAusB(updated.properties)
    const deltaAusB = neuerAusB - alterAusB

    // Klassenbonus: nur für Grad ≤ 5
    let classBonus = 0
    if (currentGrad <= 5) {
      const charType = rules.types.find(t => t.id === character.typeId)
      if (charType?.apGain) {
        classBonus = charType.apGain.lowGradBonus
      }
    }

    const apErhoehung = input.apDice + deltaAusB + classBonus
    updated = {
      ...updated,
      properties: {
        ...updated.properties,
        AP: (updated.properties.AP ?? 0) + apErhoehung,
      },
      boni: {
        ...updated.boni,
        AusB: neuerAusB,
      },
    }

    const result: GradStepResult = {
      geaenderteEigenschaft: changedProperty,
      apErhoehung,
      neuerAusB,
    }

    return { character: updated, result }
  }

  /**
   * Wendet N Gradschritte nacheinander an.
   * Jeder Schritt baut auf dem vorherigen auf.
   *
   * @param character - Der Character vor allen Gradschritten.
   * @param rules     - Die geladenen Rules-Daten.
   * @param steps     - Die Würfelergebnisse für jeden Schritt.
   * @returns Der Character nach allen Gradschritten (inkl. FW-Updates).
   */
  applyGradSteps(
    character: Character,
    rules: RulesData,
    steps: GradStepInput[],
  ): Character {
    let current = { ...character }

    for (let i = 0; i < steps.length; i++) {
      const gradBeforeStep = computeGrad(current.totalEs)
      const currentStepGrad = gradBeforeStep - (steps.length - 1 - i)
      const stepResult = this.computeStep(current, rules, currentStepGrad, steps[i])
      current = stepResult.character
    }

    // FW-Updates für grad-basierte Skills
    current = this.updateGradSkills(current, rules)

    return {
      ...current,
      updatedAt: new Date().toISOString(),
    }
  }

  /**
   * Aktualisiert grad-basierte Fähigkeitswerte (Abwehr, Resistenz, Zaubern)
   * auf den aktuellen Grad.
   */
  private updateGradSkills(character: Character, rules: RulesData): Character {
    const totalEs = character.totalEs
    const newSkills = character.skills.map(cs => {
      const skillSchema = rules.skills.find(s => s.id === cs.skillId)
      if (!skillSchema?.gradValues) return cs

      const neuerWert = this.lookupGradValue(skillSchema, totalEs)
      if (neuerWert === cs.value) return cs
      return { ...cs, value: neuerWert }
    })
    return { ...character, skills: newSkills }
  }

  /**
   * Schlägt den FW für einen Skill mit gradValues[]-Tabelle nach.
   *
   * @param skill   - Der Skill mit gradValues-Tabelle.
   * @param totalEs - Der Erfahrungsschatz des Characters.
   * @returns Der passende FW für den aktuellen Grad.
   */
  private lookupGradValue(skill: Skill, totalEs: number): number {
    if (!skill.gradValues || skill.gradValues.length === 0) {
      return skill.baseValue ?? 0
    }

    // Sort descending by grad, find the first entry whose grad threshold
    // is met by the current totalEs.
    const sorted = [...skill.gradValues].sort((a, b) => b.grad - a.grad)
    const currentGrad = computeGrad(totalEs)

    for (const entry of sorted) {
      if (currentGrad >= entry.grad) {
        return entry.fw
      }
    }

    return sorted[sorted.length - 1]?.fw ?? 0
  }
}

/** Shared singleton — use this throughout the app. */
export const gradUpService = new GradUpService()
