export interface EquipmentItem {
  /** Unique identifier, matches the name */
  id: string
  /** Display name */
  name: string
  /** Category group (e.g. "Beleuchtung", "Waffen (Angriff)") */
  group: string
  /** Description text */
  description: string
  /** Where it is carried (e.g. "Rucksack", "Gürtel") */
  location: string
  /** Price in Goldstücken (decimal) */
  price: number
  /** Weight in kg (decimal) */
  weight: number
}

export interface CharacterEquipmentItem {
  name: string
  group: string
  description: string
  location: string
  price: number
  weight: number
}
