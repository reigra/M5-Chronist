/**
 * CharacterSkill — a skill as it is stored on a character.
 */
export interface CharacterSkill {
  /** Matches Skill.id from the rules data */
  skillId: string
  /** Current skill value (Fertigkeitswert) */
  value: number
}

/**
 * BaseProperties — the six core stats every character has.
 */
export interface BaseProperties {
  St: number  // Stärke
  Gs: number  // Geschicklichkeit
  Gw: number  // Gewandtheit
  Ko: number  // Konstitution
  In: number  // Intelligenz
  Zt: number  // Zaubertalent
}

/**
 * DerivedProperties — secondary values calculated or rolled during creation.
 * All fields are optional — they may be unknown or not yet calculated.
 */
export interface DerivedProperties {
  pA: number   // Persönliche Ausstrahlung
  Wk: number   // Willenskraft
  Au: number   // Aussehen
  AusB: number // Ausdauerbonus
  LP: number   // Lebenspunkte
  AP: number   // AP-Maximum
  SchB: number // Schadensbonus
  B: number    // Bewegungsweite
  AnB: number  // Angriffsbonus
  AbB: number  // Abwehrbonus
  ZauB: number // Zauberbonus
  ResB: number // Resistenzbonus
}

/**
 * Character — the full data structure for one character.
 * This is what gets saved to and loaded from storage.
 */
export interface Character {
  /** Unique identifier (generated at creation) */
  id: string
  /** Character name */
  name: string
  /** Player's real name */
  player: string
  /** Race ID — references Race.id in the rules data */
  raceId: string
  /** Type ID — references CharacterType.id in the rules data */
  typeId: string
  /** Origin ID — references Origin.id in the rules data */
  originId: string
  /** Social status ID — references SocialStatus.id in the rules data */
  socialStatusId: string
  /** Six base properties */
  baseProperties: BaseProperties
  /** Derived / secondary properties */
  derivedProperties: DerivedProperties
  /** Total experience treasure (Erfahrungsschatz) — cumulative EP ever earned */
  totalEs: number
  /** Experience points currently available to spend */
  availableEp: number
  /** All skills the character has learned */
  skills: CharacterSkill[]
  /** IDs of all spells the character has learned */
  spells: string[]
  /** ISO date string when the character was created */
  createdAt: string
  /** ISO date string when the character was last modified */
  updatedAt: string
}
