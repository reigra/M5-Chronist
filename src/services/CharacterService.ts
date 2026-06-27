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
