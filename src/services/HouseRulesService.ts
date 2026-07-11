import { rulesStorage } from './RulesStorage'
import type { StoredSource } from './RulesStorage'
import type { RulebookData } from '../types/Rules'
import type { Spell } from '../types/Spell'

/**
 * HouseRulesService — manages per-character house rule sources in IndexedDB.
 *
 * Each character gets one source entry in the MagusNG-Rules database with
 * priority 0 (highest), so its fields win during mergeById.
 */
export class HouseRulesService {
  /**
   * Source ID prefix used for all house rule entries.
   */
  private static readonly ID_PREFIX = 'houserules'

  /**
   * Ensure a house rules source exists for the given character name.
   * Creates a new source with priority 0 if none exists yet.
   *
   * @param characterName - Display name of the character.
   * @returns The stored source (existing or newly created).
   */
  async ensureSource(characterName: string): Promise<StoredSource> {
    const sourceId = `${HouseRulesService.ID_PREFIX}-${characterName}`
    const all = await rulesStorage.getAllSources()
    const existing = all.find(s => s.id === sourceId)
    if (existing) return existing

    const data: RulebookData = {
      metadata: {
        id: sourceId,
        title: `Hausregeln ${characterName}`,
        version: '1',
        scriptVersion: __APP_VERSION__,
        priority: 0,
        createdAt: new Date().toISOString(),
        notes: `Hausregeln für ${characterName}`,
      },
    }

    const entry: StoredSource = {
      id: sourceId,
      title: data.metadata.title,
      version: data.metadata.version,
      priority: 0,
      enabled: true,
      data,
    }

    await rulesStorage.saveSource(entry)
    return entry
  }

  /**
   * Set the short description of a spell in the character's house rules.
   * Creates or updates the spell entry so that only `id` and `shortDescription`
   * are present — remaining Spell fields are left undefined and will be filled
   * by higher-priority (lower number) rule sources during mergeById.
   *
   * @param characterName - Display name of the character.
   * @param spellId       - The spell's unique ID.
   * @param description   - The new short description text.
   */
  async setSpellShortDescription(
    characterName: string,
    spellId: string,
    description: string,
  ): Promise<void> {
    const source = await this.ensureSource(characterName)
    const spells: Spell[] = source.data.spells ?? []

    const idx = spells.findIndex(s => s.id === spellId)
    if (idx >= 0) {
      spells[idx] = { ...spells[idx], shortDescription: description }
    } else {
      spells.push({ id: spellId, shortDescription: description } as Spell)
    }

    source.data.spells = spells
    await rulesStorage.saveSource(source)
  }
}

export const houseRulesService = new HouseRulesService()
