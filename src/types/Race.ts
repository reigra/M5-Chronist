/**
 * PropertyRange — optionales Min und/oder Max für eine Eigenschaft.
 */
export interface PropertyRange {
  min?: number
  max?: number
}

/**
 * RacialAbility — eine angeborene Sonderfähigkeit einer Rasse.
 */
export interface RacialAbility {
  /** Fertigkeit oder Fähigkeit (referenziert die ID aus skills.json) */
  skill: string
  /** Bonus auf die Fertigkeit */
  bonus: number
}

/**
 * Race — eine spielbare Rasse, z.B. Mensch, Elfen oder Zwerge.
 */
export interface Race {
  /** Eindeutige ID (z.B. "mensch", "elfen") */
  id: string
  /** Anzeigename */
  name: string
  /** Beschränkungen für Basiseigenschaften (min/max) — fehlt bei Mensch */
  propertyRestrictions?: Record<string, PropertyRange>
  /** Beschränkungen für abgeleitete Eigenschaften (z.B. Au) — fehlt wenn keine */
  derivedRestrictions?: Record<string, PropertyRange>
  /** Bonus/Malus auf Lebenspunkte — fehlt wenn 0 */
  lpModifier?: number
  /** Würfelformel für die Bewegungsweite (z.B. "4W3+16") */
  movementFormula: string
  /** Erlaubte Typ-IDs — leer bedeutet alle Typen erlaubt */
  availableTypes: string[]
  /** Resistenzboni auf Geist- und Körpermagie */
  resistanceBonus: { geist: number; koerper: number }
  /** Verbotene Fertigkeiten (IDs aus skills.json) — fehlt wenn keine */
  forbiddenSkills?: string[]
  /** Angeborene Sonderfähigkeiten */
  specialAbilities: RacialAbility[]
  /** Erzwungene Größe — fehlt wenn freie Wahl */
  fixedSize?: string
  /** Erzwungene Händigkeit — fehlt wenn freie Wahl */
  fixedHandedness?: string
}

/**
 * Origin — Herkunft des Charakters (z.B. Stadt, Wildnis).
 */
export interface Origin {
  /** Eindeutige ID (z.B. "city") */
  id: string
  /** Anzeigename */
  name: string
  /** Beschreibung */
  description: string
  /** Fertigkeits-IDs, die bei der Erschaffung gewährt werden */
  startingSkills: string[]
  /** Sprachen, die bei der Erschaffung gewährt werden */
  startingLanguages: string[]
}

/**
 * SocialStatusSkills — Fertigkeitserwerb durch den Stand bei der Erschaffung.
 */
export interface SocialStatusSkills {
  /** Anzahl der Lerneinheiten */
  le: number
  /** Fertigkeitsgruppe (referenziert groups-Schlüssel aus skills.json) */
  group: string
  /** Maximale Schwierigkeit der wählbaren Fertigkeiten — fehlt wenn keine Einschränkung */
  maxDifficulty?: string
}

/**
 * SocialStatus — der gesellschaftliche Stand des Charakters.
 */
export interface SocialStatus {
  /** Eindeutige ID (z.B. "volk", "adel") */
  id: string
  /** Anzeigename */
  name: string
  /** Fertigkeitserwerb durch den Stand bei der Charaktererschaffung */
  startingSkills: SocialStatusSkills
}
