/**
 * PropertyRange — optionales Min und/oder Max für eine Eigenschaft.
 */
export interface PropertyRange {
  min?: number
  max?: number
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
  /** Erlaubte Typ-IDs — leer bedeutet alle Typen erlaubt */
  availableTypes: string[]
  /**
   * Flache Boni auf Resistenzen (z.B. ResBg, ResBk).
   * `mode: 'add'` addiert auf Formel-Ergebnis, `mode: 'set'` ersetzt es.
   */
  propertyBonuses?: Array<{ id: string; value: number; mode: 'add' | 'set' }>
  /** Verbotene Fertigkeiten (IDs aus skills.json) — fehlt wenn keine */
  forbiddenSkills?: string[]
  /** Rassenspezifische Skill-Modifier, z.B. { "Raufen": 1 } für Zwerg */
  skillBonuses?: Record<string, number>
  /** Fertigkeiten mit Startwert (angeboren) */
  skills?: Array<{ skillId: string; value: number }>
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
