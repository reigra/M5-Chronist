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
 * CharacterPersonalia — beschreibende Eigenschaften des Charakters.
 * Alle Felder optional (Rückwärtskompatibilität mit älteren Speicherständen).
 */
export interface CharacterPersonalia {
  geschlecht?:  string  // z.B. "männlich", "weiblich", "divers"
  haendigkeit?: string  // "rechts" | "links" | "beidhändig"
  alter?:       number  // Alter in Jahren
  groesse?:     number  // Größe in cm
  gewicht?:     number  // Gewicht in kg
  gestalt?:     string  // Freitext: körperliche Erscheinung
  glaube?:      string  // Gottheit / Glaube
  gg?:          number  // Göttergunst
  sg?:          number  // Schicksalsgunst
}

/**
 * CharacterProperties — alle Eigenschaften des Charakters (Basis und abgeleitet).
 */
export interface CharacterProperties {
  St: number  // Stärke
  Gs: number  // Geschicklichkeit
  Gw: number  // Gewandtheit
  Ko: number  // Konstitution
  In: number  // Intelligenz
  Zt: number  // Zaubertalent
  pA: number  // Persönliche Ausstrahlung
  Wk: number  // Willenskraft
  Au: number  // Aussehen
  LP: number  // Lebenspunkte
  AP: number  // AP-Maximum
  B:  number  // Bewegungsweite
}

/**
 * CharacterBoni — abgeleitete Boni, die auf Würfe addiert werden.
 */
export interface CharacterBoni {
  AusB: number  // Ausdauerbonus
  SchB: number  // Schadensbonus
  AnB:  number  // Angriffsbonus
  AbB:  number  // Abwehrbonus
  ZauB: number  // Zauberbonus
  ResBg: number // Resistenzbonus Geistmagie
  ResBk: number // Resistenzbonus Körpermagie
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
  /** Eigenschaften (Basis und abgeleitet) */
  properties: CharacterProperties
  /** Abgeleitete Boni */
  boni: CharacterBoni
  /** Total experience treasure (Erfahrungsschatz) — cumulative EP ever earned */
  totalEs: number
  /** Experience points currently available to spend */
  availableEp: number
  /** All skills the character has learned */
  skills: CharacterSkill[]
  /** IDs of all spells the character has learned */
  spells: string[]
  /** IDs der Spezialwaffen (max. 3 für Krieger, sonst 1 für Kämpfer/KampfZauberer) */
  weaponSpecializations?: string[]
  /** Spezialgebiet des Magiers (spellGroup-Key, nur für Typ "Ma") */
  spellSpecialization?: string
  /** Beschreibende Eigenschaften (optional, für Rückwärtskompatibilität) */
  personalia?: CharacterPersonalia
  /** ISO date string when the character was created */
  createdAt: string
  /** ISO date string when the character was last modified */
  updatedAt: string
}
