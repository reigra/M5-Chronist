/**
 * Advancement — types for the cost calculation of learning and advancing.
 */

/**
 * How learning/advancement costs are calculated.
 *
 * - `normal`: regular costs (EP plus the teacher's gold fee).
 * - `reward`: Ausbildung als Belohnung — kein Gold; Steigern und Zauber lernen
 *   kosten nur die Hälfte an EP (nach Abzug der PP, aufgerundet).
 */
export type AdvancementMode = 'normal' | 'reward'