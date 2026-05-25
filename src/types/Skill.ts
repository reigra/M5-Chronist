/**
 * Skill — a single learnable and advanceable ability.
 *
 * advancementCosts: EP cost (in TE) for each advancement step.
 *   The first entry is the cost to advance from the base value,
 *   each subsequent entry covers the next level bracket.
 */
export interface Skill {
  /** Unique identifier, matches the name in German (e.g. "Klettern") */
  id: string
  /** Display name */
  name: string
  /** Skill groups this skill belongs to (e.g. ["Alltag", "Körper"]) */
  groups: string[]
  /** Difficulty rating per group */
  difficulty: Record<string, string>
  /** TE cost to learn this skill from scratch */
  learnCost: number
  /** EP cost (in TE) for each advancement step */
  advancementCosts: number[]
  /** Base value when first learned */
  baseValue: number
  /** Maximum achievable value */
  maxValue: number
  /** Base property that is added to check rolls */
  linkedProperty: string
  /** Optional notes or rule exceptions */
  notes: string
  /**
   * Base modifier when using this skill unlearned (e.g. 6 means roll + 6).
   * Only present on skills that can be attempted without learning them first.
   * Absent means the skill cannot be used unlearned.
   */
  unlearnedValue?: number
}
