/**
 * Spell — a single magic spell from a rulebook.
 */
export interface Spell {
  /** Unique identifier (spell name in German) */
  id: string
  /** Display name */
  name: string
  /** Spell level (1–10) */
  level: number
  /** Lernkosten (Trainingseinheiten) */
  learnCost?: number
  /** Type: "Wortzauber" | "Gestenmagie" | etc. */
  spellType: string
  /** Group: "Beherr." | "Beweg." | "Erkenn." | etc. */
  spellGroup: string
  /** Associated elements */
  elements: string[]
  /** Required material component, or null */
  material: string | null
  /** AP cost description */
  apCost: string
  /** Time required to cast */
  castingTime: string
  /** Range description */
  range: string
  /** Target type */
  targetType: string
  /** Area of effect */
  effectArea: string
  /** Duration description */
  duration: string
  /** Spell tradition: "druidisch" | "magisch" | "priesterlich" | etc. */
  origin: string
  /** Short description for list views */
  shortDescription: string
  /** Source reference (e.g. "Arkanum S. 63") */
  source: string
}

/**
 * SpellDescription — full description text for a spell.
 */
export interface SpellDescription {
  /** Matches Spell.id */
  id: string
  /** Full descriptive text */
  description: string
}
