export interface WeaponPropertyRestriction {
  min?: number
  max?: number
}

export interface EquipmentItem {
  /** Unique identifier, matches the name */
  id: string
  /** Display name */
  name: string
  /** Category group (e.g. "Beleuchtung", "Schwerter") */
  group: string
  /** Description text */
  description: string
  /** Where it is carried (e.g. "Rucksack", "Gürtel") */
  location: string
  /** Price in Goldstücken (decimal) */
  price: number
  /** Weight in kg (decimal) */
  weight: number
  /** Damage dice (e.g. "1W6+1") — only for weapon-type equipment */
  damage?: string
  /** Property restrictions (e.g. min St) — only for weapon-type equipment */
  propertyRestrictions?: Record<string, WeaponPropertyRestriction>
  /** Range values — only for ranged weapon-type equipment */
  distance?: string[]
  /** AP saved by armour — only for armour-type equipment */
  saveAP?: number
  /** Weapon type derived from group (e.g. "Fern", "Angriff") */
  waffentyp?: string
  /** Whether the item is treated as a weapon */
  waffe?:   boolean
  /** Attack bonus */
  anb?:     number
  /** Damage bonus */
  schb?:    number
  /** Parry bonus */
  abb?:     number
  /** Whether the weapon is magical */
  magisch?: boolean
  /** Whether the character is specialised in this weapon */
  spezialwaffe?: boolean
  /** Skill ID of the associated Waffenfertigkeit skill (e.g. "Schwerter") */
  skillId?: string
}
