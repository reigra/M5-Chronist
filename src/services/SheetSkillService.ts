import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { Skill } from '../types/Skill'

export interface SheetSkillRow {
  name: string
  displayEw: number
  linkedProperty: string
  unlearned: boolean
}

/**
 * Returns the Fertigkeitsbonus for a given property value.
 */
function fertigkeitsbonus(v: number): number {
  if (v <= 5) return -2
  if (v <= 20) return -1
  if (v <= 80) return 0
  if (v <= 95) return +1
  return +2
}

function isCharacterPropertyKey(key: string): key is keyof Character['properties'] {
  return key in ({} as Character['properties']) || key in {
    St: 0, Gs: 0, Gw: 0, Ko: 0, In: 0, Zt: 0, pA: 0, Wk: 0, Au: 0, LP: 0, AP: 0, B: 0,
  }
}

/**
 * Compute sheet EW from FW + property bonus + optional derived bonus.
 */
function computeEw(character: Character, skill: Skill, fw: number): number {
  const linkedProperty = skill.linkedProperty
  const propertyBonus = linkedProperty && isCharacterPropertyKey(linkedProperty)
    ? fertigkeitsbonus(character.properties[linkedProperty] ?? 0)
    : 0
  const derivedBonus = skill.bonusKey ? (character.boni[skill.bonusKey] ?? 0) : 0

  return fw + propertyBonus + derivedBonus
}

export class SheetSkillService {
  /**
   * Build all skill rows for the character sheet.
   *
   * Uses rule-driven bonus keys from skills.json and supports a compatibility
   * fallback: if an old character still stores a single "Resistenz" skill,
   * it is shown as the two split rows if those rules exist.
   */
  buildRows(character: Character, rules: RulesData): SheetSkillRow[] {
    const learnedIds = new Set(character.skills.map(cs => cs.skillId))
    const learnedRows: SheetSkillRow[] = []

    for (const cs of character.skills) {
      if (cs.skillId === 'Resistenz') {
        // Resistenz wird direkt aufgeteilt — die Split-Varianten existieren nicht in skills.json.
        // Der abgeleitete Bonus kommt aus character.boni['ResBg'] bzw. 'ResBk'.
        const resistSkill = rules.skills.find(s => s.id === 'Resistenz')
        const linkedProperty = resistSkill?.linkedProperty ?? null
        const propertyBonus = linkedProperty && isCharacterPropertyKey(linkedProperty)
          ? fertigkeitsbonus(character.properties[linkedProperty] ?? 0)
          : 0

        learnedRows.push({
          name: 'Resistenz (Geist)',
          displayEw: cs.value + propertyBonus + (character.boni['ResBg'] ?? 0),
          linkedProperty: linkedProperty ?? '—',
          unlearned: false,
        })
        learnedRows.push({
          name: 'Resistenz (Körper)',
          displayEw: cs.value + propertyBonus + (character.boni['ResBk'] ?? 0),
          linkedProperty: linkedProperty ?? '—',
          unlearned: false,
        })
        continue
      }

      const skill = rules.skills.find(s => s.id === cs.skillId)
      if (!skill) continue

      learnedRows.push({
        name: skill.name,
        displayEw: computeEw(character, skill, cs.value),
        linkedProperty: skill.linkedProperty ?? '—',
        unlearned: false,
      })
    }

    const unlearnedRows = rules.skills
      .filter(s => s.unlearnedValue !== undefined && !learnedIds.has(s.id))
      .map(s => ({
        name: s.name,
        displayEw: s.unlearnedValue as number,
        linkedProperty: s.linkedProperty ?? '—',
        unlearned: true,
      }))

    return [...learnedRows, ...unlearnedRows].sort((a, b) => a.name.localeCompare(b.name))
  }
}

export const sheetSkillService = new SheetSkillService()