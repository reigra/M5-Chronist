/**
 * CharacterType — a character class (Typ) such as Krieger or Zauberer.
 *
 * groupCosts: EP cost per TE for each skill group.
 * spellCosts: EP cost per TE for each spell group. Only present for
 *   types with category "Zauberer" or "KampfZauberer".
 */
export interface CharacterType {
  /** Official Midgard abbreviation (e.g. "Kr", "Hä") */
  id: string
  /** Full display name (e.g. "Krieger") */
  name: string
  /** Broad category: "Kämpfer" | "KampfZauberer" | "Zauberer" */
  category: string
  /** EP cost per TE for each skill group */
  groupCosts: Record<string, number>
  /** EP cost per TE for each spell group (magic types only) */
  spellCosts?: Record<string, number>
  /** Flache Boni auf Eigenschaften/Resistenzen (z.B. ResBg, ResBk) */
  propertyBonuses?: Array<{ id: string; value: number }>
}
