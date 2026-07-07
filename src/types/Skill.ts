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
  /** Source type from the EVA XML (e.g. "Fertigkeit", "Waffenfertigkeit") */
  typ?: string
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
  /** Optional derived bonus key to add on top (e.g. AnB, AbB, ZauB, ResBg, ResBk) */
  bonusKey?: 'AusB' | 'SchB' | 'AnB' | 'AbB' | 'ZauB' | 'ResBg' | 'ResBk'
  /**
   * Optional: ID der Basis-Fertigkeit bei gestapelten Fertigkeiten (Stacked Skill).
   * Der effektive FW ergibt sich aus FW der Basis-Fertigkeit + FW dieser Fertigkeit.
   * Beispiel: Sehen (FW 2) mit baseSkillId "Wahrnehmung" (FW 6) → effektiver FW 8.
   */
  baseSkillId?: string
  /** Optional notes or rule exceptions */
  notes: string
  /**
   * Base modifier when using this skill unlearned (e.g. 6 means roll + 6).
   * Only present on skills that can be attempted without learning them first.
   * Absent means the skill cannot be used unlearned.
   */
  /** Index into costPatterns for region-based EP cost lookup (Mogadil system). */
  costPatternId?: number
  unlearnedValue?: number
  /**
   * Grade-dependent advancement table (Abwehr, Resistenz, Zaubern).
   * When present, the FW is NOT advanced via EP but increases when the
   * character reaches certain Grad thresholds. Shown as a hint only —
   * the player enters the new value manually.
   */
  gradValues?: Array<{ grad: number; fw: number }>
}
