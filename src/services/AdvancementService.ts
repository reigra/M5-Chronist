import type { Character } from '../types/Character'
import type { Skill } from '../types/Skill'
import type { CharacterType } from '../types/CharacterType'

/**
 * AdvancementService — calculates EP costs and applies skill learning and advancement.
 *
 * EP cost formula:
 *   Lernen:   skill.learnCost (TE)             × cheapest group cost (EP/TE)
 *   Steigern: skill.advancementCosts[step] (TE) × cheapest group cost (EP/TE)
 *
 * The "cheapest group cost" is the lowest value in the character type's groupCosts
 * map that matches any of the skill's groups. This allows the player to learn a skill
 * under the most favourable group for their type.
 */
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
   * Returns null if the skill is already at its maximum value or the advancement
   * table does not have an entry for the current step.
   *
   * @param skill        - The skill to advance.
   * @param currentValue - The character's current FW for this skill.
   * @param type         - The character's type.
   * @returns EP cost, or null if no further advancement is possible.
   */
  advanceCost(skill: Skill, currentValue: number, type: CharacterType, costPatterns?: number[][], costColumns?: string[]): number | null {
    // Angeborene Fertigkeiten (z.B. Raufen, Trinken) haben keine Steigerungstabelle.
    if (!skill.advancementCosts?.length) return null
    if (currentValue >= skill.maxValue) return null
    const stepIndex = currentValue - skill.baseValue
    const teCost = skill.advancementCosts[stepIndex]
    if (teCost === undefined) return null
    return teCost * this.cheapestGroupCost(skill, type, costPatterns, costColumns)
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
      skills: [...character.skills, { skillId: skill.id, value: skill.baseValue }],
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
      skills: [...character.skills, { skillId: instanceId, value: skill.baseValue }],
      updatedAt: new Date().toISOString(),
    }
  }

  /**
   * Apply skill advancement to a character (Steigern).
   *
   * Does NOT mutate the original character — returns a new object with the
   * updated EP balance, the skill's FW raised by 1, and a fresh updatedAt.
   *
   * @param character - The current character.
   * @param skill     - The skill to advance.
   * @param type      - The character's type.
   * @throws Error if EP is insufficient, the skill is not learned, or it is at max.
   */
  advanceSkill(character: Character, skill: Skill, type: CharacterType, costPatterns?: number[][], costColumns?: string[]): Character {
    const charSkill = character.skills.find(s => s.skillId === skill.id)
    if (!charSkill) {
      throw new Error(`${skill.name} has not been learned yet.`)
    }

    const cost = this.advanceCost(skill, charSkill.value, type, costPatterns, costColumns)
    if (cost === null) {
      throw new Error(`${skill.name} is already at its maximum value.`)
    }
    if (character.availableEp < cost) {
      throw new Error(`Not enough EP. Need ${cost}, have ${character.availableEp}.`)
    }

    return {
      ...character,
      availableEp: character.availableEp - cost,
      skills: character.skills.map(s =>
        s.skillId === skill.id ? { ...s, value: s.value + 1 } : s,
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
   */
  advanceSkillInstance(character: Character, skill: Skill, instanceId: string, type: CharacterType, costPatterns?: number[][], costColumns?: string[]): Character {
    const charSkill = character.skills.find(s => s.skillId === instanceId)
    if (!charSkill) {
      throw new Error(`${instanceId} has not been learned yet.`)
    }

    const cost = this.advanceCost(skill, charSkill.value, type, costPatterns, costColumns)
    if (cost === null) {
      throw new Error(`${instanceId} is already at its maximum value.`)
    }
    if (character.availableEp < cost) {
      throw new Error(`Not enough EP. Need ${cost}, have ${character.availableEp}.`)
    }

    return {
      ...character,
      availableEp: character.availableEp - cost,
      skills: character.skills.map(s =>
        s.skillId === instanceId ? { ...s, value: s.value + 1 } : s,
      ),
      updatedAt: new Date().toISOString(),
    }
  }
}

/** Shared singleton — use this throughout the app. */
export const advancementService = new AdvancementService()
