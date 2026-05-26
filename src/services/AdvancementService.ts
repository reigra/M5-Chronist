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
   * the lowest value found. Returns 999 if none of the skill's groups are listed,
   * making that skill effectively unlearnable via normal rules.
   *
   * @param skill - The skill to evaluate.
   * @param type  - The character's type.
   */
  private cheapestGroupCost(skill: Skill, type: CharacterType): number {
    const costs = (skill.groups ?? [])
      .map(group => type.groupCosts[group])
      .filter((cost): cost is number => cost !== undefined)
    return costs.length > 0 ? Math.min(...costs) : 999
  }

  /**
   * Calculate the EP cost to learn a skill from scratch (Lernen).
   *
   * @param skill - The skill to learn.
   * @param type  - The character's type.
   * @returns EP cost as a whole number.
   */
  learnCost(skill: Skill, type: CharacterType): number {
    return skill.learnCost * this.cheapestGroupCost(skill, type)
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
  advanceCost(skill: Skill, currentValue: number, type: CharacterType): number | null {
    if (currentValue >= skill.maxValue) return null
    const stepIndex = currentValue - skill.baseValue
    const teCost = skill.advancementCosts[stepIndex]
    if (teCost === undefined) return null
    return teCost * this.cheapestGroupCost(skill, type)
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
  learnSkill(character: Character, skill: Skill, type: CharacterType): Character {
    const cost = this.learnCost(skill, type)

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
  advanceSkill(character: Character, skill: Skill, type: CharacterType): Character {
    const charSkill = character.skills.find(s => s.skillId === skill.id)
    if (!charSkill) {
      throw new Error(`${skill.name} has not been learned yet.`)
    }

    const cost = this.advanceCost(skill, charSkill.value, type)
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
}

/** Shared singleton — use this throughout the app. */
export const advancementService = new AdvancementService()
