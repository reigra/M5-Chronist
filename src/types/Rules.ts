import type { Skill } from './Skill'
import type { CharacterType } from './CharacterType'
import type { Race, Origin, SocialStatus } from './Race'
import type { Spell, SpellDescription } from './Spell'
import type { SkillRulesConfig } from './SkillRules'
import type { Weapon } from './Weapon'
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
  isCore: boolean
  /** Wenn true: diese Quelle überschreibt andere Quellen (höchste Priorität). */
  houseRule?: boolean
  createdAt: string
  notes: string
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
  weapons?: Weapon[]
  equipment?: EquipmentItem[]
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
  weapons: Weapon[]
  equipment: EquipmentItem[]
}
