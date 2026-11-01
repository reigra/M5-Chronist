import { ref } from 'vue'
import type { AdvancementMode } from '../types/Advancement'

/**
 * Page-level cost mode (Normal / Belohnung), shared by AdvancementView and SpellsView.
 * Kept in memory only: it survives navigation but resets to 'normal' on reload.
 */
const advancementMode = ref<AdvancementMode>('normal')

export function useAdvancementMode() {
  return {
    advancementMode,
  }
}