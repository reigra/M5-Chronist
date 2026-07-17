import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { ValidationResult } from '../types/CharacterValidation'
import { RulesLoader } from './RulesLoader'
import { characterStorage } from './CharacterStorage'
import { characterValidator } from './CharacterValidator'

/**
 * CharacterLoadService — orchestriert das Laden eines Charakters.
 *
 * Führt folgende Kette aus:
 * 1. Rules laden
 * 2. Character laden (durchläuft migrate())
 * 3. autoFix() — ergänzt fehlende Pflicht-Skills
 * 4. validate() — prüft gegen Regelwerk
 *
 * @example
 *   const result = await characterLoadService.load('abc-123')
 *   // result.character — autoFix-durchlaufen
 *   // result.issues    — validate-Ergebnis
 */
export class CharacterLoadService {
  /**
   * Lädt einen Charakter mit vollständiger autoFix/validate-Kette.
   *
   * @param id - Character-ID aus IndexedDB.
   * @returns Character, Rules und ValidationResult. Character ist null bei Fehlern.
   */
  async load(id: string): Promise<{
    character: Character | null
    rules: RulesData
    issues: ValidationResult
  }> {
    // 1. Rules laden
    const rulesLoader = new RulesLoader()
    const rules = await rulesLoader.load()

    // 2. Character laden (durchläuft migrate())
    const raw = await characterStorage.load(id)

    if (!raw) {
      // Character nicht gefunden — leeres ValidationResult zurückgeben
      return {
        character: null,
        rules,
        issues: { issues: [], hasErrors: false, hasWarnings: false },
      }
    }

    // 3. autoFix — ergänzt fehlende Pflicht-Skills
    const { fixed } = characterValidator.autoFix(raw, rules)

    // 4. validate
    const issues = characterValidator.validate(fixed, rules)

    return {
      character: fixed,
      rules,
      issues,
    }
  }
}

/** Singleton-Instanz. */
export const characterLoadService = new CharacterLoadService()
