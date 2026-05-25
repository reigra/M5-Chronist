/**
 * GradUtils — Grad (character level) calculation for Midgard M5.
 *
 * Grad is derived from the Erfahrungsschatz (totalEs) and is never stored on
 * the character directly. Always call computeGrad(character.totalEs) to get
 * the current Grad.
 *
 * NOTE (future): When a character crosses a Grad threshold, the following
 * values must also be updated (not yet implemented):
 *   - FW Abwehr, FW Resistenz, FW Zaubern increase
 *   - One base property may increase via dice roll
 */

/**
 * One entry in the Grad threshold table.
 * minEs: the minimum totalEs required to be at this Grad.
 */
interface GradThreshold {
  grad: number
  minEs: number
}

/**
 * Grad threshold table for Midgard M5.
 * Each entry defines the minimum ES to reach that Grad.
 * Source: official Midgard M5 rulebook.
 */
const GRAD_THRESHOLDS: GradThreshold[] = [
  { grad:  1, minEs:      0 },
  { grad:  2, minEs:    100 },
  { grad:  3, minEs:    250 },
  { grad:  4, minEs:    500 },
  { grad:  5, minEs:    750 },
  { grad:  6, minEs:  1_000 },
  { grad:  7, minEs:  1_250 },
  { grad:  8, minEs:  1_500 },
  { grad:  9, minEs:  1_750 },
  { grad: 10, minEs:  2_000 },
  { grad: 11, minEs:  2_500 },
  { grad: 12, minEs:  3_000 },
  { grad: 13, minEs:  3_500 },
  { grad: 14, minEs:  4_000 },
  { grad: 15, minEs:  4_500 },
  { grad: 16, minEs:  5_000 },
  { grad: 17, minEs:  6_000 },
  { grad: 18, minEs:  7_000 },
  { grad: 19, minEs:  8_000 },
  { grad: 20, minEs:  9_000 },
  { grad: 21, minEs: 10_000 },
  { grad: 22, minEs: 12_500 },
  { grad: 23, minEs: 15_000 },
  { grad: 24, minEs: 17_500 },
  { grad: 25, minEs: 20_000 },
  { grad: 26, minEs: 22_500 },
  { grad: 27, minEs: 25_000 },
]

/** From Grad 27 onward: one new Grad every 5,000 ES, without limit. */
const OPEN_GRAD_START_ES = 25_000
const OPEN_GRAD_START    = 27
const OPEN_GRAD_STEP_ES  = 5_000

/**
 * Compute the current Grad for a given Erfahrungsschatz value.
 *
 * Returns the highest Grad whose minEs is less than or equal to totalEs.
 *
 * @param totalEs - The character's total accumulated ES.
 * @returns The character's current Grad (0–30).
 */
export function computeGrad(totalEs: number): number {
  if (totalEs >= OPEN_GRAD_START_ES) {
    return OPEN_GRAD_START + Math.floor((totalEs - OPEN_GRAD_START_ES) / OPEN_GRAD_STEP_ES)
  }
  let grad = 0
  for (const entry of GRAD_THRESHOLDS) {
    if (totalEs >= entry.minEs) {
      grad = entry.grad
    } else {
      break
    }
  }
  return grad
}

/**
 * Return the ES required to reach the next Grad.
 * There is no maximum Grad, so this always returns a number.
 *
 * @param totalEs - The character's total accumulated ES.
 */
export function esForNextGrad(totalEs: number): number {
  if (totalEs >= OPEN_GRAD_START_ES) {
    const currentGrad = computeGrad(totalEs)
    return OPEN_GRAD_START_ES + (currentGrad - OPEN_GRAD_START + 1) * OPEN_GRAD_STEP_ES
  }
  for (const entry of GRAD_THRESHOLDS) {
    if (totalEs < entry.minEs) {
      return entry.minEs
    }
  }
  // Unreachable: totalEs < 25,000 is always covered by the table above.
  return OPEN_GRAD_START_ES
}
