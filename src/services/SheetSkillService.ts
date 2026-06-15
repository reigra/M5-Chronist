import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { Skill } from '../types/Skill'
import type { SkillRulesConfig } from '../types/SkillRules'

export interface SheetSkillRow {
  name: string
  displayEw: number
  linkedProperty: string
  unlearned: boolean
  isWeapon: boolean
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
   * Verarbeitet drei Sonderfälle über die skillRules-Konfiguration:
   *   1. Split-Skills (z. B. Resistenz → zwei Zeilen)
   *   2. Multi-Instanz-Skills (z. B. "Sprache:Albisch" → Basis-Fertigkeit "Sprache")
   *   3. Normale Fertigkeiten
   *
   * @param character  - Der Charakter, dessen Fertigkeiten angezeigt werden.
   * @param rules      - Die aktuell aktiven Regelwerk-Daten.
   * @param skillRules - Die Spezialkonfiguration für Split- und Multi-Instanz-Fertigkeiten.
   */
  buildRows(character: Character, rules: RulesData, skillRules: SkillRulesConfig): SheetSkillRow[] {
    const learnedIds = new Set(character.skills.map(cs => cs.skillId))
    const learnedRows: SheetSkillRow[] = []

    for (const cs of character.skills) {
      // 1. Split-Skill: eine Fertigkeit wird als mehrere Zeilen dargestellt (z. B. Resistenz)
      const splitRule = skillRules.splitSkills?.find(s => s.baseSkillId === cs.skillId)
      if (splitRule) {
        const baseSkill = rules.skills.find(s => s.id === splitRule.baseSkillId)
        const linkedProperty = baseSkill?.linkedProperty ?? null
        const propertyBonus = linkedProperty && isCharacterPropertyKey(linkedProperty)
          ? fertigkeitsbonus(character.properties[linkedProperty] ?? 0)
          : 0

        for (const variant of splitRule.variants) {
          const bonusValue = variant.bonusKey
            ? ((character.boni as unknown as Record<string, number>)[variant.bonusKey] ?? 0)
            : 0
          learnedRows.push({
            name: variant.displayName,
            displayEw: cs.value + propertyBonus + bonusValue,
            linkedProperty: linkedProperty ?? '—',
            unlearned: false,
            isWeapon: false,
          })
        }
        continue
      }

      // 2. Multi-Instanz-Skill: z. B. "Sprache:Albisch" → Basis-Fertigkeit "Sprache"
      const multiRule = skillRules.multiInstanceSkills?.find(m => cs.skillId.startsWith(m.idPrefix))
      if (multiRule) {
        const baseSkill = rules.skills.find(s => s.id === multiRule.baseSkillId)
        if (!baseSkill) continue
        // Anzeigename: "Sprache:Albisch" → "Sprache: Albisch"
        const displayName = cs.skillId.replace(':', ': ')
        learnedRows.push({
          name: displayName,
          displayEw: computeEw(character, baseSkill, cs.value),
          linkedProperty: baseSkill.linkedProperty ?? '—',
          unlearned: false,
          isWeapon: false,
        })
        continue
      }

      // 3. Normale Fertigkeit
      const skill = rules.skills.find(s => s.id === cs.skillId)
      if (!skill) continue

      learnedRows.push({
        name: skill.name,
        displayEw: computeEw(character, skill, cs.value),
        linkedProperty: skill.linkedProperty ?? '—',
        unlearned: false,
        isWeapon: skill.typ === 'Waffenfertigkeit',
      })
    }

    const unlearnedRows = rules.skills
      .filter(s => s.unlearnedValue !== undefined && !learnedIds.has(s.id))
      .map(s => ({
        name: s.name,
        displayEw: s.unlearnedValue as number,
        linkedProperty: s.linkedProperty ?? '—',
        unlearned: true,
        isWeapon: s.typ === 'Waffenfertigkeit',
      }))

    return [...learnedRows, ...unlearnedRows].sort((a, b) => a.name.localeCompare(b.name))
  }
}

export const sheetSkillService = new SheetSkillService()