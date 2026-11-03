import type { Character } from '../types/Character'
import type { Skill } from '../types/Skill'
import type { CharacterType } from '../types/CharacterType'
import type { Spell } from '../types/Spell'
import type { AdvancementMode } from '../types/Advancement'
import type { Technique, TechniqueRules } from '../types/Technique'

/** Lehrgeld für das Lernen einer Fertigkeit (GS je LE). */
const GOLD_PER_SKILL_LE = 200
/** Lehrgeld für das Lernen eines Zaubers (GS je LE). */
const GOLD_PER_SPELL_LE = 100
/** Lehrgeld für das Steigern einer Fertigkeit (GS je TE). */
const GOLD_PER_TE = 20

/** Result of a spell learn cost calculation. */
export interface SpellLearnCost {
  /** EP to pay after PP reduction and reward halving. */
  epCost: number
  /** EP in the same mode without PP reduction (for the strikethrough display). */
  originalEpCost: number
  /** LE covered by PP of the spell group. */
  ppUsed: number
  /** Teacher's gold fee (0 in reward mode). */
  goldCost: number
}

/** Result of a technique learn cost calculation. */
export interface TechniqueLearnCost {
  /** EP to pay (halved and rounded up in reward mode). */
  epCost: number
  /** Teacher's gold fee (0 in reward mode). */
  goldCost: number
  /** EP per LE from type.fightCosts. */
  epPerLe: number
}

/**
 * AdvancementService — calculates EP costs and applies skill learning and advancement.
 *
 * EP cost formula:
 *   Lernen:   skill.learnCost (TE)             × cheapest group cost (EP/TE)
 *   Steigern: skill.advancementCosts[step] (TE) × cheapest group cost (EP/TE)
 *
 * Gold may replace up to 50 % of the EP cost (epToPayWithGold).
 * Gold deduction is handled by the caller (view).
 *
 * Belohnungs-Ausbildung (mode = 'reward'): kein Lehrgeld, kein EP-Ersatz durch Gold.
 * Steigern, Zauber und Techniken lernen kosten die Hälfte an EP; PP werden zuerst abgezogen,
 * danach wird die Summe halbiert und aufgerundet. Fertigkeiten lernen kostet volle EP.
 *
 * The "cheapest group cost" is the lowest value in the character type's groupCosts
 * map that matches any of the skill's groups. This allows the player to learn a skill
 * under the most favourable group for their type.
 */
// TODO: not imported by name — only `advancementService` singleton is used externally
export class AdvancementService {
  /**
   * Find the cheapest EP-per-TE cost factor for a skill given a character type.
   *
   * Looks up each of the skill's groups in the type's groupCosts map and returns
   * the lowest value found. If the skill has no groups but has a costPatternId,
   * falls back to the Mogadil cost pattern lookup:
   *   costPatterns[costPatternId][costColumns.indexOf(type.id)]
   *
   * Returns 999 if none of the skill's groups are listed and no pattern matches,
   * making that skill effectively unlearnable via normal rules.
   *
   * @param skill        - The skill to evaluate.
   * @param type         - The character's type.
   * @param costPatterns - Optional cost pattern matrix (Mogadil system).
   * @param costColumns  - Optional column labels for the cost pattern matrix.
   */
  private cheapestGroupCost(
    skill: Skill,
    type: CharacterType,
    costPatterns?: number[][],
    costColumns?: string[],
  ): number {
    const costs = (skill.groups ?? [])
      .map(group => type.groupCosts?.[group])
      .filter((cost): cost is number => cost !== undefined)
    if (costs.length > 0) return Math.min(...costs)

    // Fallback: Mogadil cost pattern lookup
    if (
      costPatterns &&
      costColumns &&
      skill.costPatternId !== undefined &&
      costColumns.length > 0
    ) {
      const colIdx = costColumns.indexOf(type.id)
      if (colIdx >= 0 && costPatterns[skill.costPatternId]?.[colIdx] !== undefined) {
        return costPatterns[skill.costPatternId][colIdx]
      }
    }

    return 999
  }

  /**
   * Apply the reward halving to an EP amount (after PP reduction).
   *
   * @param ep   - EP cost in normal mode.
   * @param mode - Cost mode.
   * @returns The EP cost for the given mode (halved and rounded up in reward mode).
   */
  private applyMode(ep: number, mode: AdvancementMode): number {
    return mode === 'reward' ? Math.ceil(ep / 2) : ep
  }

  /**
   * Teacher's gold fee for learning a skill (200 GS per LE, 0 in reward mode).
   *
   * @param skill - The skill to learn.
   * @param mode  - Cost mode.
   */
  learnGoldCost(skill: Skill, mode: AdvancementMode = 'normal'): number {
    return mode === 'reward' ? 0 : skill.learnCost * GOLD_PER_SKILL_LE
  }

  /**
   * Teacher's gold fee for advancing a skill (20 GS per TE, 0 in reward mode).
   *
   * @param teAfterPp - TE still to pay after PP reduction.
   * @param mode      - Cost mode.
   */
  advanceGoldCost(teAfterPp: number, mode: AdvancementMode = 'normal'): number {
    return mode === 'reward' ? 0 : teAfterPp * GOLD_PER_TE
  }

  /**
   * Maximum EP that may be paid with gold (50 % of the cost, 0 in reward mode).
   *
   * @param cost - EP cost of the action.
   * @param mode - Cost mode.
   */
  maxGoldEp(cost: number, mode: AdvancementMode = 'normal'): number {
    return mode === 'reward' ? 0 : Math.floor(cost / 2)
  }

  /**
   * Calculate EP and gold cost to learn a spell.
   *
   * PP of the spell group reduce the LE first; in reward mode the remaining EP
   * are halved (rounded up) and no gold is due.
   *
   * @param spell       - The spell to learn.
   * @param group       - Normalized spell group key into type.spellCosts.
   * @param type        - The character's type.
   * @param ppAvailable - PP available in the spell group.
   * @param mode        - Cost mode.
   * @returns EP cost, EP cost without PP, PP used, and gold fee.
   */
  spellLearnCost(spell: Spell, group: string, type: CharacterType, ppAvailable: number, mode: AdvancementMode = 'normal'): SpellLearnCost {
    const le = spell.learnCost ?? 0
    const epPerLe = type.spellCosts?.[group] ?? 0
    const ppUsed = Math.min(le, ppAvailable)
    return {
      epCost: this.applyMode((le - ppUsed) * epPerLe, mode),
      originalEpCost: this.applyMode(le * epPerLe, mode),
      ppUsed,
      goldCost: mode === 'reward' ? 0 : (le - ppUsed) * GOLD_PER_SPELL_LE,
    }
  }

  /**
   * Calculate EP and gold cost to learn a technique.
   *
   * EP = LE × type.fightCosts[discipline]; gold = LE × techniqueRules.goldPerLe
   * (0 if no rule data). Reward mode halves the EP and waives gold.
   *
   * @param technique - The technique to learn.
   * @param type      - The character's type.
   * @param rules     - Technique rule data from the loaded rules (optional).
   * @param mode      - Cost mode.
   * @returns The costs, or null if the type has no cost for the discipline.
   */
  techniqueLearnCost(technique: Technique, type: CharacterType, rules: TechniqueRules | undefined, mode: AdvancementMode = 'normal'): TechniqueLearnCost | null {
    const epPerLe = type.fightCosts?.[technique.discipline]
    if (epPerLe === undefined) return null
    const le = technique.learnCost
    return {
      epCost: this.applyMode(le * epPerLe, mode),
      goldCost: mode === 'reward' ? 0 : le * (rules?.goldPerLe ?? 0),
      epPerLe,
    }
  }

  /**
   * Calculate the EP cost to learn a skill from scratch (Lernen).
   *
   * @param skill        - The skill to learn.
   * @param type         - The character's type.
   * @param costPatterns - Optional cost pattern matrix (Mogadil system).
   * @param costColumns  - Optional column labels for the cost pattern matrix.
   * @returns EP cost as a whole number.
   */
  learnCost(skill: Skill, type: CharacterType, costPatterns?: number[][], costColumns?: string[]): number {
    return skill.learnCost * this.cheapestGroupCost(skill, type, costPatterns, costColumns) * 3
  }

  /**
   * Calculate the EP cost to advance a skill by one level (Steigern).
   *
   * PP (Praktikapunkte) auf dem Skill reduzieren die TE-Kosten 1:1.
   * Returns null if the skill is already at its maximum value or the advancement
   * table does not have an entry for the current step.
   *
   * @param skill        - The skill to advance.
   * @param currentValue - The character's current FW for this skill.
   * @param type         - The character's type.
   * @param pp           - Power Points available on this skill (reduce TE cost).
   * @param mode         - Cost mode; reward halves the EP after PP reduction.
   * @returns EP cost, or null if no further advancement is possible.
   */
  advanceCost(skill: Skill, currentValue: number, type: CharacterType, costPatterns?: number[][], costColumns?: string[], pp: number = 0, mode: AdvancementMode = 'normal'): number | null {
    // Angeborene Fertigkeiten (z.B. Raufen, Trinken) haben keine Steigerungstabelle.
    if (!skill.advancementCosts?.length) return null
    if (currentValue >= skill.maxValue) return null
    const stepIndex = currentValue - skill.baseValue
    const teCost = skill.advancementCosts[stepIndex]
    if (teCost === undefined) return null
    const teAfterPp = Math.max(0, teCost - pp)
    return this.applyMode(teAfterPp * this.cheapestGroupCost(skill, type, costPatterns, costColumns), mode)
  }

  /**
   * Apply skill learning to a character (Lernen).
   *
   * Does NOT mutate the original character — returns a new object with the
   * updated EP balance, the new skill added at base value, and a fresh updatedAt.
   *
   * @param character - The current character.
   * @param skill     - The skill to learn.
   * @param type      - The character's type.
   * @throws Error if EP is insufficient or the skill is already known.
   */
  learnSkill(character: Character, skill: Skill, type: CharacterType, costPatterns?: number[][], costColumns?: string[]): Character {
    const cost = this.learnCost(skill, type, costPatterns, costColumns)

    if (character.availableEp < cost) {
      throw new Error(`Not enough EP. Need ${cost}, have ${character.availableEp}.`)
    }
    if (character.skills.some(s => s.skillId === skill.id)) {
      throw new Error(`${skill.name} is already learned.`)
    }

    return {
      ...character,
      availableEp: character.availableEp - cost,
      skills: [...character.skills, { skillId: skill.id, value: skill.baseValue, pp: 0 }],
      updatedAt: new Date().toISOString(),
    }
  }

  /**
   * Lernt eine Multi-Instanz-Fertigkeit (z. B. "Sprache:Albisch").
   *
   * EP-Kosten und Basiswert werden vom Basis-Skill übernommen.
   * Die instanceId (z. B. "Sprache:Albisch") wird direkt als skillId gespeichert.
   *
   * @param character  - Der aktuelle Charakter.
   * @param skill      - Der Basis-Skill (z. B. "Sprache").
   * @param instanceId - Die vollständige Instanz-ID (z. B. "Sprache:Albisch").
   * @param type       - Der Charaktertyp.
   */
  learnSkillInstance(character: Character, skill: Skill, instanceId: string, type: CharacterType, costPatterns?: number[][], costColumns?: string[]): Character {
    const cost = this.learnCost(skill, type, costPatterns, costColumns)

    if (character.availableEp < cost) {
      throw new Error(`Not enough EP. Need ${cost}, have ${character.availableEp}.`)
    }
    if (character.skills.some(s => s.skillId === instanceId)) {
      throw new Error(`${instanceId} is already learned.`)
    }

    return {
      ...character,
      availableEp: character.availableEp - cost,
      skills: [...character.skills, { skillId: instanceId, value: skill.baseValue, pp: 0 }],
      updatedAt: new Date().toISOString(),
    }
  }

  /**
   * Apply skill advancement to a character (Steigern).
   *
   * Does NOT mutate the original character — returns a new object with the
   * updated EP balance, the skill's FW raised by 1, and a fresh updatedAt.
   *
   * Gold may replace up to 50% of the EP cost (epToPayWithGold).
   * The gold deduction itself is handled by the caller.
   *
   * @param character      - The current character.
   * @param skill          - The skill to advance.
   * @param type           - The character's type.
   * @param epToPayWithGold - EP cost to cover with gold (max 50% of total, ignored in reward mode).
   * @param mode           - Cost mode; reward halves the EP after PP reduction.
   * @throws Error if EP is insufficient, the skill is not learned, or it is at max.
   */
  advanceSkill(character: Character, skill: Skill, type: CharacterType, costPatterns?: number[][], costColumns?: string[], epToPayWithGold: number = 0, mode: AdvancementMode = 'normal'): Character {
    const charSkill = character.skills.find(s => s.skillId === skill.id)
    if (!charSkill) {
      throw new Error(`${skill.name} has not been learned yet.`)
    }

    if (!skill.advancementCosts?.length) {
      throw new Error(`${skill.name} cannot be advanced.`)
    }
    if (charSkill.value >= skill.maxValue) {
      throw new Error(`${skill.name} is already at its maximum value.`)
    }
    const stepIndex = charSkill.value - skill.baseValue
    const teCost = skill.advancementCosts[stepIndex]
    if (teCost === undefined) {
      throw new Error(`${skill.name} is already at its maximum value.`)
    }

    const pp = charSkill.pp ?? 0
    const ppUsed = Math.min(teCost, pp)
    const cost = this.applyMode((teCost - ppUsed) * this.cheapestGroupCost(skill, type, costPatterns, costColumns), mode)

    const maxGoldEp = this.maxGoldEp(cost, mode)
    const effectiveEpGold = Math.min(Math.max(0, epToPayWithGold), maxGoldEp)
    const epToDeduct = cost - effectiveEpGold

    if (character.availableEp < epToDeduct) {
      throw new Error(`Not enough EP. Need ${epToDeduct}, have ${character.availableEp}.`)
    }

    return {
      ...character,
      availableEp: character.availableEp - epToDeduct,
      skills: character.skills.map(s =>
        s.skillId === skill.id ? { ...s, value: s.value + 1, pp: Math.max(0, (s.pp ?? 0) - ppUsed) } : s,
      ),
      updatedAt: new Date().toISOString(),
    }
  }

  /**
   * Steigert eine einzelne Instanz einer Multi-Instanz-Fertigkeit (z. B. "Sprache:Albisch").
   *
   * Steigerungskosten werden vom Basis-Skill berechnet; gesucht wird nach der exakten instanceId.
   *
   * @param character  - Der aktuelle Charakter.
   * @param skill      - Der Basis-Skill (z. B. "Sprache") für die Kostenberechnung.
   * @param instanceId - Die vollständige Instanz-ID (z. B. "Sprache:Albisch").
   * @param type       - Der Charaktertyp.
   * @param epToPayWithGold - EP cost to cover with gold (max 50% of total, ignored in reward mode).
   * @param mode       - Cost mode; reward halves the EP after PP reduction.
   */
  advanceSkillInstance(character: Character, skill: Skill, instanceId: string, type: CharacterType, costPatterns?: number[][], costColumns?: string[], epToPayWithGold: number = 0, mode: AdvancementMode = 'normal'): Character {
    const charSkill = character.skills.find(s => s.skillId === instanceId)
    if (!charSkill) {
      throw new Error(`${instanceId} has not been learned yet.`)
    }

    if (!skill.advancementCosts?.length) {
      throw new Error(`${skill.name} cannot be advanced.`)
    }
    if (charSkill.value >= skill.maxValue) {
      throw new Error(`${instanceId} is already at its maximum value.`)
    }
    const stepIndex = charSkill.value - skill.baseValue
    const teCost = skill.advancementCosts[stepIndex]
    if (teCost === undefined) {
      throw new Error(`${instanceId} is already at its maximum value.`)
    }

    const pp = charSkill.pp ?? 0
    const ppUsed = Math.min(teCost, pp)
    const cost = this.applyMode((teCost - ppUsed) * this.cheapestGroupCost(skill, type, costPatterns, costColumns), mode)

    const maxGoldEp = this.maxGoldEp(cost, mode)
    const effectiveEpGold = Math.min(Math.max(0, epToPayWithGold), maxGoldEp)
    const epToDeduct = cost - effectiveEpGold

    if (character.availableEp < epToDeduct) {
      throw new Error(`Not enough EP. Need ${epToDeduct}, have ${character.availableEp}.`)
    }

    return {
      ...character,
      availableEp: character.availableEp - epToDeduct,
      skills: character.skills.map(s =>
        s.skillId === instanceId ? { ...s, value: s.value + 1, pp: Math.max(0, (s.pp ?? 0) - ppUsed) } : s,
      ),
      updatedAt: new Date().toISOString(),
    }
  }
}

/** Shared singleton — use this throughout the app. */
export const advancementService = new AdvancementService()
