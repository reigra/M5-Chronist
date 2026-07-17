import type { Skill } from './Skill'
import type { CharacterType } from './CharacterType'
import type { Race, Origin, SocialStatus } from './Race'
import type { Spell, SpellDescription } from './Spell'
import type { SkillRulesConfig } from './SkillRules'
import type { EquipmentItem } from './Equipment'

/**
 * UniversalFormula — eine Formeldefinition im Regelwerk.
 * Wird für Boni und Fertigkeiten verwendet.
 */
export interface UniversalFormula {
  /** Eindeutige ID (z.B. "AnB", "raufen", "lp-formel") */
  id: string
  /** Formel-String in der definierten Formelsprache */
  formula: string
  /** Ob Würfel-Notation (W) in der Formel vorkommen darf */
  allowsDice: boolean
  /** Optionale Beschreibung (UI/Debug) */
  description?: string
}

/**
 * InnateSkill — ein obligatorischer Fertigkeits-Eintrag im Regelwerk.
 * Definiert, welche Skills ein Charakter automatisch erhalten muss.
 */
export interface InnateSkill {
  /** Skill-ID (z.B. "Raufen", "Abwehr") — dient auch als Merge-Key */
  id: string
  /** Optionale direkte Formel für den FW (z.B. "Ko/10") */
  formula?: string
  /** Referenz auf eine formula.id (z.B. "raufen") */
  formulaId?: string
  /** Wenn true: FW kommt aus Skill.gradValues[]-Tabelle */
  gradValues?: boolean
  /** Fallback-FW wenn keine Formel/gradValues */
  defaultFw: number
  /** Optional: gestapelt auf einen Basis-Skill (z.B. Hören → Wahrnehmung) */
  stacked?: boolean
  /** Optional: Basis-Skill-ID für gestapelte Skills */
  baseSkillId?: string
  /** Optional: Bedingung für das Anlegen des Skills */
  condition?: 'hasSpells' | string
}

/**
 * UniversalRules — universelle Regeln, die für alle Charaktere gelten.
 * Enthält Formeln und obligatorische Fertigkeiten.
 */
export interface UniversalRules {
  formulas: UniversalFormula[]
  innateSkills: InnateSkill[]
}

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
  universalRules?: UniversalRules
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
  universalRules: UniversalRules
}
