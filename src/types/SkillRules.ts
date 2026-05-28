/**
 * SkillRules — TypeScript-Typen für die skillRules.json-Konfiguration.
 *
 * Konfiguriert zwei Sonderfall-Kategorien:
 *   - splitSkills:         eine Fertigkeit wird als mehrere Zeilen im Charakterbogen angezeigt
 *   - multiInstanceSkills: eine Fertigkeit kann mehrfach mit unterschiedlicher Spezialisierung gelernt werden
 */

/** Eine Variante eines Split-Skills (z. B. "Resistenz (Geist)"). */
export interface SplitSkillVariant {
  /** Anzeigename im Charakterbogen. */
  displayName: string
  /** Schlüssel in character.boni für den abgeleiteten Bonus dieser Variante. */
  bonusKey?: string
}

/** Konfiguration für eine Fertigkeit, die in mehrere Zeilen aufgeteilt wird. */
export interface SplitSkillRule {
  /** ID der Basis-Fertigkeit in skills.json (z. B. "Resistenz"). */
  baseSkillId: string
  /** Liste der Anzeige-Varianten, die aus dem einen Eintrag erzeugt werden. */
  variants: SplitSkillVariant[]
}

/** Instanzquelle: Werte kommen aus einer rules-Tabelle (z. B. languages, scripts). */
export interface InstanceSourceRules {
  type: 'rules'
  /** Schlüssel in RulesData (z. B. "languages" oder "scripts"). */
  rulesKey: string
  /** Feldname für den Anzeigenamen in der Quelltabelle (z. B. "name"). */
  nameField: string
}

/** Instanzquelle: Werte sind fest in der Config hinterlegt. */
export interface InstanceSourceFixed {
  type: 'fixed'
  /** Feste Liste möglicher Spezialisierungen (z. B. Überlebensgebiete). */
  values: string[]
}

export type InstanceSource = InstanceSourceRules | InstanceSourceFixed

/** Konfiguration für eine Fertigkeit, die mehrfach mit Spezialisierung gelernt werden kann. */
export interface MultiInstanceSkillRule {
  /** ID der Basis-Fertigkeit in skills.json (z. B. "Sprache"). */
  baseSkillId: string
  /** Präfix, das im Charakter-Skill-Array verwendet wird (z. B. "Sprache:"). */
  idPrefix: string
  /** Woher die möglichen Spezialisierungen kommen. */
  instanceSource: InstanceSource
}

/** Gesamte Konfiguration aus skillRules.json. */
export interface SkillRulesConfig {
  splitSkills: SplitSkillRule[]
  multiInstanceSkills: MultiInstanceSkillRule[]
}
