import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { EquipmentItem } from '../types/Equipment'
import { computeGrad } from './GradUtils'

/**
 * LatexExportService — generates a LaTeX character sheet for Martin Väth's
 * m5figur-magusng document class and optionally compiles it via the TeXLive.net API.
 *
 * @usage
 *   const tex = latexExportService.generate(character, rules)
 *   const blob = await latexExportService.compileToPdf(tex, clsContent)
 */
export class LatexExportService {

  /**
   * Generate the full .tex content for a character.
   *
   * @param character - The character to export.
   * @param rules     - The currently active rules data.
   * @returns A complete LaTeX document as a string.
   */
  generate(character: Character, rules: RulesData): string {
    const lines: string[] = []
    const push = (...args: string[]) => { for (const a of args) lines.push(a) }

    // ── Preamble ──────────────────────────────────────────────────────────────
//    push('\\documentclass{m5figur-mv}[2026/07/07]')
    push('\\documentclass{m5figur-magusng}[2026/07/07]')
    push('')
    push('\\begin{document}')
    push('')

    // ── Lookups ────────────────────────────────────────────────────────────────
    const typeObj = rules.types.find(t => t.id === character.typeId)
    const typeName = typeObj?.name ?? character.typeId
    const isCaster = typeObj?.spellCosts !== undefined
      && Object.keys(typeObj.spellCosts).length > 0

    // ── Identity ───────────────────────────────────────────────────────────────
    push(`\\DefData{Figur}{${this.esc(character.name)}}`)
    push(`\\DefData{Spieler}{${this.esc(character.player)}}`)
    push(`\\DefData{Typ}{${this.esc(typeName)}}`)
    push(`\\DefData{Grad}{${computeGrad(character.totalEs)}}`)
    push(`\\DefData{Spezialisierung}{}`)

    if (character.weaponSpecializations?.length) {
      push(`% Spezialwaffen: ${character.weaponSpecializations.join(', ')}`)
    }
    if (character.spellSpecialization) {
      push(`% Spezialgebiet: ${character.spellSpecialization}`)
    }

    // ── Properties (Eigenschaften) ─────────────────────────────────────────────
    const p = character.properties
    const b = character.boni
    push(`\\DefData{St}{${p.St}}`)
    push(`\\DefData{Gs}{${p.Gs}}`)
    push(`\\DefData{Gw}{{${p.Gw}}{${p.Gw}}}% Normal bzw. in Rüstung`)
    push(`\\DefData{Ko}{${p.Ko}}`)
    push(`\\DefData{In}{${p.In}}`)
    push(`\\DefData{Zt}{${p.Zt}}`)
    push(`\\DefData{Au}{${p.Au}}`)
    push(`\\DefData{pA}{${p.pA}}`)
    push(`\\DefData{Wk}{${p.Wk}}`)
    push(`\\DefData{B}{{${p.B}}{${p.B}}}% Normal bzw. in Rüstung`)
    push(`\\DefData{GiT}{\\StandardGiT}`)

    // ── Raufen ─────────────────────────────────────────────────────────────────
    const raufenSkill = character.skills.find(s => s.skillId === 'Raufen')
    if (raufenSkill) {
      push(`\\DefData{Raufen}{${raufenSkill.value}}`)
    }

    // ── Derived bonuses (Boni) ──────────────────────────────────────────────────
    push(`\\DefData{Ausdauerbonus}{${b.AusB}}`)
    push(`\\DefData{Schadensbonus}{${b.SchB}}`)
    push(`\\DefData{Angriffsbonus}{{${b.AnB}}{${b.AnB}}}% Normal bzw. in Rüstung`)
    push(`\\DefData{Abwehrbonus}{{${b.AbB}}{${b.AbB}}}% Normal bzw. in Rüstung`)
    push(`\\DefData{ResistenzBonus}{{${b.ResBg}}{${b.ResBk}}}`)
    push(`\\DefData{Zauberbonus}{${b.ZauB}}`)

    // ── LP / AP / GG / SG ──────────────────────────────────────────────────────
    push(`\\DefData{LP}{${p.LP}}`)
    push(`\\DefData{AP}{${p.AP}}`)

    const pers = character.personalia
    push(`\\DefData{GG}{${pers?.gg ?? 0}}`)
    push(`\\DefData{SG}{${pers?.sg ?? 0}}`)
    push(`\\DefData{Geburtsdatum}{}`)
    push(`\\DefData{Alter}{${pers?.alter ?? ''}}`)
    push(`\\DefData{haendig}{${pers?.haendigkeit ?? '\\mgqquad'}}`)
    push(`\\DefData{Groesse}{${pers?.groesse ?? '\\mgqquad'}}`)
    push(`\\DefData{Gestalt}{${this.esc(pers?.gestalt ?? '')}}`)
    push(`\\DefData{Gewicht}{${pers?.gewicht ?? ''}}`)
    push(`\\DefData{Stand}{${this.esc(statusName(character, rules))}}`)
    push(`\\DefData{Heimat}{${this.esc(originName(character, rules))}}`)
    push(`\\DefData{Glaube}{${this.esc(pers?.glaube ?? '')}}`)

    // ── Skills (Fertigkeiten) ──────────────────────────────────────────────────
    push('')
    push('% Fertigkeiten — Figurenblatt')

    // Mappings für Sinne (eigenes \DefData-Format statt \Fertigkeit1)
    const SENSE_LATEX_KEYS: Record<string, string> = {
      'Hören': 'Hoeren',
      'Nachtsicht': 'Nachtsicht',
      'Riechen': 'Riechen',
      'Sechster Sinn': 'SechsterSinn',
      'Sehen': 'Sehen',
    }
    const SENSE_IDS = new Set(Object.keys(SENSE_LATEX_KEYS))
    const senses: Array<{ latexKey: string; modifier: number; effective: number }> = []

    const weaponSkillIds = new Set<string>()
    const weaponSkills: Array<{ id: string; value: number; pp: number }> = []
    const nonWeaponSkills: Array<{ id: string; value: number; pp: number }> = []

    for (const cs of character.skills) {
      // Skip Abwehr, Resistenz, Zaubern, Raufen — they are handled via \DefData
      if (['Abwehr', 'Resistenz', 'Zaubern', 'Raufen'].includes(cs.skillId)) continue

      const skillDef = rules.skills.find(s => s.id === cs.skillId)
      const isWeapon = skillDef?.typ === 'Waffenfertigkeit'
        || this.isMultiInstanceWeapon(cs.skillId, rules)

      // Bei gestapelten Fertigkeiten (baseSkillId) den effektiven FW berechnen
      const effectiveValue = skillDef?.baseSkillId
        ? (character.skills.find(s => s.skillId === skillDef.baseSkillId)?.value ?? 0) + cs.value
        : cs.value

      // Sinne haben ihr eigenes \DefData-Format statt \Fertigkeit1
      if (SENSE_IDS.has(cs.skillId)) {
        senses.push({ latexKey: SENSE_LATEX_KEYS[cs.skillId], modifier: cs.value, effective: effectiveValue })
        continue
      }

      if (isWeapon) {
        weaponSkills.push({ id: cs.skillId, value: effectiveValue, pp: cs.pp ?? 0 })
        weaponSkillIds.add(cs.skillId)
      } else {
        nonWeaponSkills.push({ id: cs.skillId, value: effectiveValue, pp: cs.pp ?? 0 })
      }
    }

    // Sinne als \DefData ausgeben (Format: {modifier}{effectiveFW})
    for (const s of senses) {
      push(`\\DefData{${s.latexKey}}{{${s.modifier}}{${s.effective}}}`)
    }

    // Non-weapon: \Fertigkeit1
    for (const s of nonWeaponSkills) {
      const refName = this.toAsciiRef(s.id)
      push(`\\Fertigkeit1[${refName}]{${this.esc(s.id)}}[${s.value}]${s.pp > 0 ? `[${s.pp}]` : ''}`)
    }

    // Weapon skills: \Fertigkeit2
    push('')
    push('% Waffenfertigkeiten — Figurenblatt')
    for (const s of weaponSkills) {
      const refName = this.toAsciiRef(s.id)
      push(`\\Fertigkeit2[${refName}]{${this.esc(s.id)}}[${s.value}]${s.pp > 0 ? `[${s.pp}]` : ''}`)
    }

    // ── Combat base skills (Abwehr, Resistenz, Zaubern) with computed values ──
    // These are referenced via \Fertigkeit1 in the example, but the actual
    // display values come from \DefData{Abwehr}, \DefData{Resistenz}, \DefData{Zaubern}
    const abwehr = character.skills.find(s => s.skillId === 'Abwehr')
    if (abwehr) push(`\\Fertigkeit1{Abwehr}[${abwehr.value}]`)

    const zaubern = character.skills.find(s => s.skillId === 'Zaubern')
    if (zaubern) push(`\\Fertigkeit1{Zaubern}[${zaubern.value}]`)

    const resistenz = character.skills.find(s => s.skillId === 'Resistenz')
    if (resistenz) push(`\\Fertigkeit1{Resistenz}[${resistenz.value}]`)

    // ── Abenteuerblatt Fertigkeiten ────────────────────────────────────────────
    push('')
    push('% Fertigkeiten — Abenteuerblatt')
    for (const s of nonWeaponSkills) {
      const skillDef = rules.skills.find(sk => sk.id === s.id)
      if (!skillDef) continue
      const refName = this.toAsciiRef(s.id)
      const leit = this.mapLeiteigenschaft(skillDef.linkedProperty)
      push(`\\Fertig1[${refName}]{${refName}}${leit ? `{${leit}}` : '{}'}`)
    }

    // ── Weapons from inventory ──────────────────────────────────────────────────
    const inventoryWeapons = (character.inventory ?? []).filter(i => i.waffe)
    push('')
    push('% Waffen — Abenteuerblatt')

    // Format: \Waffe1[Beschreibung]{Referenz}[Modifikation]{AB}[Schaden]
    //   [Modifikation] = itemspezifischer Bonus (anb + spezialwaffe)
    //   {AB}           = LaTeX addiert den Charakter-Angriffsbonus automatisch
    //   [Schaden]      = Würfel + \PlusSB{bonus} für Nahkampf (LaTeX addiert SchB)
    for (const item of inventoryWeapons) {
      const refName = item.skillId ? this.toAsciiRef(item.skillId) : ''
      const hasRef = refName && weaponSkillIds.has(item.skillId!)
      const descName = this.esc(item.name)

      const mod = (item.anb ?? 0) + (item.spezialwaffe ? 2 : 0)
      const modStr = mod !== 0 ? `[${mod > 0 ? '+' : ''}${mod}]` : ''

      const dmgStr = this.formatWeaponDamage(item)
      const ref = hasRef ? refName : this.esc(item.name)

      push(`\\Waffe1[${descName}]{${ref}}${modStr}{AB}[${dmgStr}]`)
    }

    // ── Spells ─────────────────────────────────────────────────────────────────
    if (isCaster && character.spells.length > 0) {
      push('')
      push('% Zauber — Zauberblatt')

      const sorted = character.spells
        .map(s => {
          const spell = rules.spells.find(sp => sp.id === s.spellId)
          return { spell, pp: s.pp ?? 0 }
        })
        .filter(s => s.spell)
        .sort((a, b) => (a.spell!.level - b.spell!.level) || a.spell!.name.localeCompare(b.spell!.name))

      for (const s of sorted) {
        const sp = s.spell!
        push(`\\Zauber1{${this.esc(sp.name)}}{${sp.apCost}}{${this.esc(sp.spellType)}}{${this.esc(sp.castingTime)}}{${this.esc(sp.range)}}{${this.esc(sp.targetType)}}{${this.esc(sp.effectArea)}}{${this.esc(sp.duration)}}{${this.escShort(sp.shortDescription)}}{${this.esc(sp.origin)}}`)
      }
    }

    // ── Output all sheets ──────────────────────────────────────────────────────
    push('')
    push('% Ausgabe aller Blätter')
    push('\\Output{Figurenblatt}')
    push('\\Output{Abenteuerblatt}')
    if (isCaster) {
      push('\\Output{Zauberblatt}')
    }

    push('')
    push('\\end{document}')

    return lines.join('\n')
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Escape special LaTeX characters in a string.
   */
  private esc(value: string | number | undefined | null): string {
    if (value === undefined || value === null) return ''
    return String(value)
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/[{}$%&_#^~|]/g, (c) => `\\${c}`)
  }

  /**
   * Short description without line breaks
   */
  private escShort(value: string | undefined | null): string {
    if (!value) return ''
    return this.esc(value.replace(/\s+/g, ' ').trim())
  }

  /**
   * Create an ASCII-safe reference name from a skill id, stripping non-ASCII chars.
   */
  private toAsciiRef(id: string): string {
    return id.replace(/[^a-zA-Z0-9]/g, '')
  }

  /**
   * Map the linkedProperty field to the LaTeX Leiteigenschaft key.
   */
  private mapLeiteigenschaft(prop: string | undefined): string {
    if (!prop) return ''
    // The class uses the abbreviations: St, Gs, Gw, Ko, In, Zt, Au, pA, Wk
    // Also supports AB (Angriffsbonus) as a special value
    const map: Record<string, string> = {
      St: 'St', Gs: 'Gs', Gw: 'Gw', Ko: 'Ko', In: 'In',
      Zt: 'Zt', Au: 'Au', pA: 'pA', Wk: 'Wk',
    }
    return map[prop] ?? ''
  }

  /**
   * Check if a skill is a weapon skill via multi-instance rules.
   */
  private isMultiInstanceWeapon(skillId: string, rules: RulesData): boolean {
    if (!rules.skillRules?.multiInstanceSkills) return false
    for (const rule of rules.skillRules.multiInstanceSkills) {
      if (skillId.startsWith(rule.idPrefix)) {
        const base = rules.skills.find(s => s.id === rule.baseSkillId)
        return base?.typ === 'Waffenfertigkeit'
      }
    }
    return false
  }

  /**
   * Format the damage string for a weapon item.
   *
   * - Nahkampf (not Fernkampf): replace trailing "+N" with "\PlusSB{N}"
   *   so LaTeX automatically adds the character's Schadensbonus.
   * - Fernkampf: keep as-is (no strength bonus).
   * - No match: return raw damage or empty string.
   */
  private formatWeaponDamage(item: EquipmentItem): string {
    const dmg = item.damage ?? ''
    if (!dmg) return ''

    // Determine if this is a ranged weapon — check skill group
    // Items without skillId or unknown group get \PlusSB (safer for melee defaults)
    if (item.skillId && /fern/i.test(item.skillId)) {
      return dmg
    }

    // Match trailing "+<number>", e.g. "1W6+1" → prefix="1W6", bonus="1"
    const match = dmg.match(/^(.+?)\+(\d+)$/)
    if (match) {
      return `${match[1]}\\PlusSB{${match[2]}}`
    }

    // No trailing bonus — still add bare \PlusSB{0} so LaTeX applies SchB
    // e.g. "1W6" → "1W6\PlusSB{0}"
    return `${dmg}\\PlusSB{0}`
  }

}

// ── Helper functions ───────────────────────────────────────────────────────────

function statusName(character: Character, rules: RulesData): string {
  const s = rules.socialStatuses.find(x => x.id === character.socialStatusId)
  return s?.name ?? character.socialStatusId
}

function originName(character: Character, rules: RulesData): string {
  const o = rules.origins.find(x => x.id === character.originId)
  return o?.name ?? character.originId
}

/** Shared singleton */
export const latexExportService = new LatexExportService()
