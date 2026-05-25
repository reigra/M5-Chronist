/**
 * Race — a playable race such as Mensch or Zwerg.
 */
export interface Race {
  /** Unique identifier (e.g. "human", "dwarf") */
  id: string
  /** Display name */
  name: string
  /** Human-readable description */
  description: string
  /** Adjustments applied to base properties during character creation */
  propertyModifiers: Record<string, number>
  /** Base movement range in meters */
  baseMovement: number
  /** Type IDs available to this race */
  availableTypes: string[]
  /** Languages the character knows at creation */
  startingLanguages: string[]
  /** IDs of special racial abilities */
  specialAbilities: string[]
}

/**
 * Origin — where the character grew up (e.g. city, wilderness).
 */
export interface Origin {
  /** Unique identifier (e.g. "city") */
  id: string
  /** Display name */
  name: string
  /** Human-readable description */
  description: string
  /** Skill IDs granted at creation */
  startingSkills: string[]
  /** Languages granted at creation */
  startingLanguages: string[]
}

/**
 * SocialStatus — the character's position in society (Stand).
 */
export interface SocialStatus {
  /** Unique identifier (e.g. "free_citizen") */
  id: string
  /** Display name */
  name: string
  /** Human-readable description */
  description: string
  /** Starting gold amount */
  startingGold: number
  /** Type IDs available for this social status */
  availableTypes: string[]
}
