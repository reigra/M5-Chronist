export interface EquipmentItem {
  /** Unique identifier, matches the name */
  id: string
  /** Display name */
  name: string
  /** Category group (e.g. "Beleuchtung", "Waffen (Angriff)") */
  group: string
  /** Description text */
  description: string
  /** Price in Goldstücken (decimal) */
  price: number
  /** Weight in kg (decimal) */
  weight: number
}
