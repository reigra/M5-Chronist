import type { RulesData } from '../types/Rules'
import { rulesStorage } from './RulesStorage'

/**
 * RulesLoader — loads all active rulebook sources from IndexedDB.
 *
 * Sources are managed by the user via the Rules page.
 * Returns empty arrays for all fields if no sources are stored or enabled.
 *
 * Usage:
 *   const loader = new RulesLoader()
 *   const rules  = await loader.load()
 */
export class RulesLoader {
  /**
   * Load and merge all enabled rulebook sources into a single RulesData object.
   *
   * @returns Merged RulesData from all enabled sources.
   */
  async load(): Promise<RulesData> {
    return rulesStorage.loadActive()
  }
}
