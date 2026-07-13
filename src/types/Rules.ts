import type { Skill } from './Skill'
import type { CharacterType } from './CharacterType'
import type { Race, Origin, SocialStatus } from './Race'
import type { Spell, SpellDescription } from './Spell'
import type { SkillRulesConfig } from './SkillRules'
import type { EquipmentItem } from './Equipment'

/** Eine Sprache aus languages.json. */
export interface Language {
  /** Eindeutige ID — wird beim Import auf `name` normalisiert, falls nicht vorhanden. */
  id?: string
  name: string
  old?: boolean
  regions: string[]
}

/** Eine Schrift aus scripts.json. */
export interface Script {
  /** Eindeutige ID — wird beim Import auf `name` normalisiert, falls nicht vorhanden. */
  id?: string
  name: string
  old?: boolean
  secret?: boolean
  regions: string[]
}

/**
 * RulebookMetadata — the "metadata" block inside a combined source file.
 */
export interface RulebookMetadata {
  id: string
  title: string
  version: string
  scriptVersion?: string
  /** Numerische Priorität: niedriger Wert = höhere Priorität (0 = höchste). */
  priority?: number
  createdAt: string
  notes: string
}

/**
 * One entry in the Grad threshold table.
 * Defines the minimum totalEs required to be at a given Grad.
 */
export interface GradThreshold {
  grad: number
  minEs: number
}

/**
 * RulebookData — the full content of one combined source JSON file.
 * All sections are optional because not every rulebook contains every type.
 */
export interface RulebookData {
  metadata: RulebookMetadata
  skills?: Skill[]
  types?: CharacterType[]
  races?: Race[]
  origins?: Origin[]
  socialStatuses?: SocialStatus[]
  languages?: Language[]
  scripts?: Script[]
  spells?: Spell[]
  spellDescriptions?: SpellDescription[]
  skillRules?: SkillRulesConfig
  equipment?: EquipmentItem[]
  gradThresholds?: GradThreshold[]
  costColumns?: string[]
  costPatterns?: number[][]
}

/**
 * RulesData — all loaded rules merged from all active sources.
 * Used as the single in-memory rules store.
 */
export interface RulesData {
  skills: Skill[]
  types: CharacterType[]
  races: Race[]
  origins: Origin[]
  socialStatuses: SocialStatus[]
  languages: Language[]
  scripts: Script[]
  spells: Spell[]
  spellDescriptions: SpellDescription[]
  skillRules?: SkillRulesConfig
  equipment: EquipmentItem[]
  gradThresholds?: GradThreshold[]
  costColumns?: string[]
  costPatterns?: number[][]
}
