import type { Skill } from './Skill'
import type { CharacterType } from './CharacterType'
import type { Race, Origin, SocialStatus } from './Race'
import type { Spell, SpellDescription } from './Spell'

/** Eine Sprache aus languages.json. */
export interface Language {
  name: string
  old?: boolean
  regions: string[]
}

/** Eine Schrift aus scripts.json. */
export interface Script {
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
}
