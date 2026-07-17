import type { Character } from './Character'

/**
 * ValidationIssue — ein einzelnes Problem, das bei der Validierung gefunden wurde.
 */
export interface ValidationIssue {
  /** Pfad zum fehlerhaften Feld (z.B. "properties.St" oder "skills.Raufen.value") */
  path: string
  /** Schweregrad */
  severity: 'error' | 'warning' | 'info'
  /** Maschinenlesbarer Fehlercode (z.B. "MISSING_RACE", "PROPERTY_OUT_OF_RANGE") */
  code: string
  /** Für Menschen lesbare Beschreibung */
  message: string
  /** Erwarteter Wert (optional) */
  expected?: string | number
  /** Tatsächlicher Wert (optional) */
  actual?: string | number
}

/**
 * ValidationResult — das Ergebnis einer vollständigen Validierung.
 */
export interface ValidationResult {
  issues: ValidationIssue[]
  hasErrors: boolean
  hasWarnings: boolean
}

/**
 * FixDescription — Beschreibt eine durch autoFix() durchgeführte Korrektur.
 */
export interface FixDescription {
  action: string
  target: string
  description: string
}

/**
 * FixResult — Ergebnis eines autoFix()-Durchlaufs.
 */
export interface FixResult {
  fixed: Character
  applied: FixDescription[]
}
