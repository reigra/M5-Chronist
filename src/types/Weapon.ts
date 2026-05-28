/**
 * WeaponPropertyRestriction — Mindestwert (und optionaler Maximalwert)
 * für eine Eigenschaft, die zum Führen einer Waffe benötigt wird.
 */
export interface WeaponPropertyRestriction {
  min?: number
  max?: number
}

/**
 * Weapon — eine Waffe aus weapons.json.
 * id und name sind identisch (= Waffenname laut Regelwerk).
 * groups: Fertigkeits-IDs, mit denen die Waffe geführt werden kann.
 * damage: Schadenswürfel-Angabe (z.B. "1W6+1", "1W6-1 / 1W6+1" für Varianten).
 * propertyRestrictions: Mindestwerte für Eigenschaften (gleiche Struktur wie races.json).
 * distance: Nahbereich / Mittelbereich / Fernbereich; leer für reine Nahkampfwaffen.
 */
export interface Weapon {
  id:                   string
  name:                 string
  groups:               string[]
  damage:               string
  propertyRestrictions: Record<string, WeaponPropertyRestriction>
  distance:             string[]
}

/**
 * WeaponsConfig — Struktur der weapons.json-Konfigurationsdatei.
 */
export interface WeaponsConfig {
  weapons: Weapon[]
}
