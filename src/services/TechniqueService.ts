import type { Character } from '../types/Character'
import type { Skill } from '../types/Skill'
import type { Technique, TechniqueDisciplineRule, TechniqueRankRule } from '../types/Technique'
import { fertigkeitsbonus } from './SheetSkillService'

/**
 * TechniqueService — evaluates technique prerequisites and ranks.
 * Pure functions; all rules come from TechniqueRules in the loaded rule data.
 */
export class TechniqueService {
  /**
   * Check the skill prerequisite of a discipline.
   *
   * @param character - The character.
   * @param rule      - Discipline rule from techniqueRules.
   * @returns The rule if its prerequisite is not met, otherwise null.
   */
  disciplineBlocker(character: Character, rule: TechniqueDisciplineRule): TechniqueDisciplineRule | null {
    const cs = character.skills.find(s => s.skillId === rule.skillId)
    return !cs || cs.value < rule.minValue ? rule : null
  }

  /**
   * Highest rank of a discipline the character has reached.
   * Ranks are checked in order; the first unmet rank stops the search.
   *
   * @param character  - The character.
   * @param rule       - Discipline rule with ranks.
   * @param techniques - All techniques from the rules.
   * @param skills     - All skills from the rules (for the linked property).
   * @returns The reached rank, or null if the discipline has no ranks.
   */
  currentRank(character: Character, rule: TechniqueDisciplineRule, techniques: Technique[], skills: Skill[]): TechniqueRankRule | null {
    const ranks = rule.ranks ?? []
    if (ranks.length === 0) return null
    const cs = character.skills.find(s => s.skillId === rule.skillId)
    const linked = skills.find(s => s.id === rule.skillId)?.linkedProperty as keyof Character['properties'] | undefined
    const bonus = linked && character.properties[linked] !== undefined ? fertigkeitsbonus(character.properties[linked]) : 0
    const learned = new Set((character.techniques ?? []).map(t => t.techniqueId))
    const countOf = (rank: string) =>
      techniques.filter(t => t.discipline === rule.id && t.rank === rank && learned.has(t.id)).length

    let reached = ranks[0]
    for (const rank of ranks.slice(1)) {
      if (rank.minSkillValue !== undefined) {
        if (!cs) break
        const value = cs.value + (rank.includeBonus ? bonus : 0)
        if (value < rank.minSkillValue) break
      }
      if (rank.requiredTechniques && countOf(rank.requiredTechniques.rank) < rank.requiredTechniques.count) break
      reached = rank
    }
    return reached
  }

  /**
   * True if the character's rank allows the technique.
   * Techniques without rank, or disciplines without ranks, are always allowed.
   *
   * @param technique - The technique to check.
   * @param rule      - Discipline rule (may be undefined).
   * @param reached   - Result of currentRank().
   */
  rankAllowed(technique: Technique, rule: TechniqueDisciplineRule | undefined, reached: TechniqueRankRule | null): boolean {
    const ranks = rule?.ranks ?? []
    if (!technique.rank || ranks.length === 0 || !reached) return true
    const idx = ranks.findIndex(r => r.id === technique.rank)
    return idx < 0 || idx <= ranks.findIndex(r => r.id === reached.id)
  }
}

/** Shared singleton — use this throughout the app. */
export const techniqueService = new TechniqueService()
