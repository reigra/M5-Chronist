import type { Character } from '../types/Character'
import type { CharacterType } from '../types/CharacterType'
import type { EquipmentItem } from '../types/Equipment'

/**
 * One changed field shown in the diff view during import.
 */
export interface DiffEntry {
  label: string
  oldValue: string | number
  newValue: string | number
}

/**
 * Compute a flat list of differences between two characters.
 * Compares scalar fields, properties, boni, skills, and inventory.
 * Skips id, createdAt, updatedAt — those are not relevant to the user.
 *
 * @param existing - The character currently saved in IndexedDB.
 * @param incoming - The character parsed from the imported file.
 * @returns Array of changed fields. Empty if the characters are identical.
 */
export function computeDiff(existing: Character, incoming: Character): DiffEntry[] {
  const entries: DiffEntry[] = []

  // Scalar identity fields
  const scalarFields: Array<{ key: keyof Character; label: string }> = [
    { key: 'name',           label: 'Name' },
    { key: 'player',         label: 'Player' },
    { key: 'raceId',         label: 'Race' },
    { key: 'typeId',         label: 'Type' },
    { key: 'originId',       label: 'Origin' },
    { key: 'socialStatusId', label: 'Social Status' },
    { key: 'totalEs',        label: 'ES (total)' },
    { key: 'availableEp',    label: 'EP (available)' },
    { key: 'gold',           label: 'Gold' },
  ]

  for (const { key, label } of scalarFields) {
    const oldVal = existing[key]
    const newVal = incoming[key]
    if (oldVal !== newVal) {
      entries.push({ label, oldValue: String(oldVal), newValue: String(newVal) })
    }
  }

  // Properties
  for (const key of Object.keys(existing.properties) as Array<keyof typeof existing.properties>) {
    const oldVal = existing.properties[key]
    const newVal = incoming.properties[key]
    if (oldVal !== newVal) {
      entries.push({ label: `Eigenschaft: ${key}`, oldValue: oldVal, newValue: newVal })
    }
  }

  // Boni
  for (const key of Object.keys(existing.boni) as Array<keyof typeof existing.boni>) {
    const oldVal = existing.boni[key]
    const newVal = incoming.boni[key]
    if (oldVal !== newVal) {
      entries.push({ label: `Bonus: ${key}`, oldValue: oldVal, newValue: newVal })
    }
  }

  // Skills — compare by skillId
  const existingSkillMap = new Map(existing.skills.map(s => [s.skillId, s.value]))
  const incomingSkillMap = new Map(incoming.skills.map(s => [s.skillId, s.value]))

  for (const [id, oldFw] of existingSkillMap) {
    const newFw = incomingSkillMap.get(id)
    if (newFw === undefined) {
      entries.push({ label: `Skill: ${id}`, oldValue: `FW ${oldFw}`, newValue: '(removed)' })
    } else if (newFw !== oldFw) {
      entries.push({ label: `Skill: ${id}`, oldValue: `FW ${oldFw}`, newValue: `FW ${newFw}` })
    }
  }

  for (const [id, newFw] of incomingSkillMap) {
    if (!existingSkillMap.has(id)) {
      entries.push({ label: `Skill: ${id}`, oldValue: '(new)', newValue: `FW ${newFw}` })
    }
  }

  // Inventory — compare by item id
  const existingItems = existing.inventory ?? []
  const incomingItems = incoming.inventory ?? []

  if (existingItems.length > 0 || incomingItems.length > 0) {
    const oldMap = new Map<string, EquipmentItem>()
    const newMap = new Map<string, EquipmentItem>()

    for (const item of existingItems) {
      oldMap.set(item.id || `${item.name}|${item.group}`, item)
    }
    for (const item of incomingItems) {
      newMap.set(item.id || `${item.name}|${item.group}`, item)
    }

    for (const [key, oldItem] of oldMap) {
      const newItem = newMap.get(key)
      if (!newItem) {
        entries.push({ label: `Equipment: ${oldItem.name}`, oldValue: '(present)', newValue: '(removed)' })
      } else if (JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
        entries.push({ label: `Equipment: ${oldItem.name}`, oldValue: '(changed)', newValue: '(changed)' })
      }
    }

    for (const [key, newItem] of newMap) {
      if (!oldMap.has(key)) {
        entries.push({ label: `Equipment: ${newItem.name}`, oldValue: '(none)', newValue: '(added)' })
      }
    }
  }

  return entries
}

/**
 * Check whether a character type can cast spells.
 * A type is a caster if it has at least one spell group defined.
 *
 * @param type - The character type to check (or undefined).
 * @returns True if the type has spell groups.
 */
export function isCaster(type: CharacterType | undefined): boolean {
  const sc = type?.spellCosts
  return !!sc && Object.keys(sc).length > 0
}

/**
 * Migrate a raw object to the current Character schema.
 * Handles old-format migration (baseProperties → properties),
 * ensures innate skills are present, and adds default values
 * for pp on skills and spells.
 *
 * @param raw - The raw object parsed from storage or file.
 * @returns A valid Character object.
 */
export function migrate(raw: any): Character {
  if (raw.baseProperties && !raw.properties) {
    const bp = raw.baseProperties ?? {}
    const dp = raw.derivedProperties ?? {}
    raw = {
      ...raw,
      properties: {
        St: bp.St ?? 0, Gs: bp.Gs ?? 0, Gw: bp.Gw ?? 0,
        Ko: bp.Ko ?? 0, In: bp.In ?? 0, Zt: bp.Zt ?? 0,
        pA: dp.pA ?? 0, Wk: dp.Wk ?? 0, Au: dp.Au ?? 0,
        LP: dp.LP ?? 0, AP: dp.AP ?? 0, B: dp.B ?? 0,
      },
      boni: {
        AusB:  dp.AusB  ?? 0,
        SchB:  dp.SchB  ?? 0,
        AnB:   dp.AnB   ?? 0,
        AbB:   dp.AbB   ?? 0,
        ZauB:  dp.ZauB  ?? 0,
        ResBg: dp.ResBg ?? 0,
        ResBk: dp.ResBk ?? dp.ResB ?? 0,
      },
    }
    delete raw.baseProperties
    delete raw.derivedProperties
  }

  // Ensure innate skills are present with correct starting values.
  const knownIds = new Set((raw.skills ?? []).map((s: any) => s.skillId))
  const props = raw.properties ?? {}
  const boni = raw.boni ?? {}

  // Raufen: (St+Gw)/20 + AnB, Zwerge +1
  if (!knownIds.has('Raufen')) {
    const rv = Math.floor(((props.St ?? 0) + (props.Gw ?? 0)) / 20)
             + (boni.AnB ?? 0)
             + (raw.raceId === 'zwerg' ? 1 : 0)
    raw.skills = [...(raw.skills ?? []), { skillId: 'Raufen', value: Math.max(0, rv) }]
  }

  // Trinken: Ko/10
  if (!knownIds.has('Trinken')) {
    const tv = Math.floor((props.Ko ?? 0) / 10)
    raw.skills = [...(raw.skills ?? []), { skillId: 'Trinken', value: Math.max(0, tv) }]
  }

  // Wahrnehmung: FW 6
  if (!knownIds.has('Wahrnehmung')) {
    raw.skills = [...(raw.skills ?? []), { skillId: 'Wahrnehmung', value: 6 }]
  }

  // Abwehr: FW 11
  if (!knownIds.has('Abwehr')) {
    raw.skills = [...(raw.skills ?? []), { skillId: 'Abwehr', value: 11 }]
  }

  // Resistenz: FW 11
  if (!knownIds.has('Resistenz')) {
    raw.skills = [...(raw.skills ?? []), { skillId: 'Resistenz', value: 11 }]
  }

  // Zaubern: FW 11 für Charaktere mit Zaubersprüchen
  if (Array.isArray(raw.spells) && raw.spells.length > 0 && !knownIds.has('Zaubern')) {
    raw.skills = [...(raw.skills ?? []), { skillId: 'Zaubern', value: 11 }]
  }

  // Migrate skills: add pp if missing
  if (Array.isArray(raw.skills)) {
    raw.skills = raw.skills.map((s: any) => s.pp === undefined ? { ...s, pp: 0 } : s)
  }

  // Migrate spells: convert string[] to CharacterSpell[], add pp if missing
  if (Array.isArray(raw.spells)) {
    raw.spells = raw.spells.map((s: any) => {
      if (typeof s === 'string') return { spellId: s, pp: 0 }
      return s.pp === undefined ? { ...s, pp: 0 } : s
    })
  }

  return raw
}
