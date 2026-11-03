/**
 * Technique — eine Kampftechnik (z.B. aus Ars Armorum).
 * All game rules (costs, prerequisites, ranks) come from imported rule data.
 */
export interface Technique {
  /** Unique identifier: "<discipline>:<name>" (names repeat across disciplines) */
  id: string
  /** Display name (KiDo: kanthanischer Name) */
  name: string
  /** Discipline id, e.g. "Kampfkunst"; key into CharacterType.fightCosts and TechniqueRules.disciplines */
  discipline: string
  /** Angriff | Verteidigung | Finte | Geist | Schuss | Fecht | Leib */
  form: string
  /** Variante, e.g. "Attackieren", "Anstürmen", "Ausweichen" */
  variant?: string
  /** Stufe (1–10) */
  level: number
  /** Lerneinheiten (LE) */
  learnCost: number
  /** AP-Verbrauch */
  apCost: string
  /** EP0: no EP for using the technique */
  ep0: boolean
  /** Gegner-Einschränkungen (codes, labels in TechniqueRules.restrictionNames) */
  restrictions: string[]
  /** Waffengruppen */
  weapons?: string
  /** Übersetzung des Namens (KiDo) */
  translation?: string
  /** Rank id within the discipline (KiDo: S | E | M), see TechniqueDisciplineRule.ranks */
  rank?: string
  /** Erlaubte Schulfarben (KiDo) */
  colors?: string[]
  /** Art der Technik: sanft | hart | beide (KiDo) */
  kind?: string
  /** Source reference, e.g. "Ars Armorum S. 55" */
  source: string
  /** Parser could not read the full entry */
  parseWarning?: boolean
}

/**
 * TechniqueDescription — full description text for a technique.
 */
export interface TechniqueDescription {
  /** Matches Technique.id */
  id: string
  /** Full descriptive text */
  description: string
}

/**
 * TechniqueRankRule — one rank of a discipline (e.g. KiDo Schüler/Eingeweihter/Meister).
 * Ranks are ordered; a rank is reached when all its conditions and those of the previous ranks hold.
 */
export interface TechniqueRankRule {
  /** Rank id, matches Technique.rank */
  id: string
  /** Display name */
  name: string
  /** Minimum value of the discipline skill */
  minSkillValue?: number
  /** True: minSkillValue includes the Fertigkeitsbonus of the skill's linked property */
  includeBonus?: boolean
  /** Number of learned techniques of a given rank required */
  requiredTechniques?: { rank: string; count: number }
}

/**
 * TechniqueDisciplineRule — prerequisites of one discipline.
 */
export interface TechniqueDisciplineRule {
  /** Discipline id, matches Technique.discipline */
  id: string
  /** Skill that must be learned */
  skillId: string
  /** Minimum skill value (0 = learned is enough); without property bonus */
  minValue: number
  /** Optional ordered ranks restricting which techniques can be learned */
  ranks?: TechniqueRankRule[]
}

/**
 * TechniqueRules — rule data for learning techniques.
 */
export interface TechniqueRules {
  /** Lehrgeld je LE */
  goldPerLe: number
  /** Restriction code → label (e.g. "G" → "Größe") */
  restrictionNames?: Record<string, string>
  /** Disciplines in display order */
  disciplines: TechniqueDisciplineRule[]
}
