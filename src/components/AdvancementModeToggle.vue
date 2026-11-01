<script setup lang="ts">
import { UI } from '../constants/ui'
import type { AdvancementMode } from '../types/Advancement'

/** Selected cost mode (Normal / Belohnung). */
const mode = defineModel<AdvancementMode>({ required: true })
</script>

<template>
  <div class="mode-toggle" role="radiogroup" :aria-label="UI.advModeLabel">
    <span class="mode-label">{{ UI.advModeLabel }}</span>
    <div class="mode-buttons">
      <button
        type="button"
        role="radio"
        class="mode-btn"
        :class="{ 'is-active': mode === 'normal' }"
        :aria-checked="mode === 'normal'"
        @click="mode = 'normal'"
      >{{ UI.advModeNormal }}</button>
      <button
        type="button"
        role="radio"
        class="mode-btn mode-btn--reward"
        :class="{ 'is-active': mode === 'reward' }"
        :aria-checked="mode === 'reward'"
        :title="UI.advModeRewardHint"
        @click="mode = 'reward'"
      >{{ UI.advModeReward }}</button>
    </div>
  </div>
</template>

<style scoped>
.mode-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85em;
}

.mode-label {
  color: #555;
  white-space: nowrap;
}

.mode-buttons {
  display: inline-flex;
  border: 1px solid #aaa;
  border-radius: 4px;
  overflow: hidden;
}

.mode-btn {
  padding: 0.2rem 0.6rem;
  border: none;
  background: #f5f5f5;
  color: #444;
  font: inherit;
  cursor: pointer;
}

.mode-btn + .mode-btn {
  border-left: 1px solid #aaa;
}

.mode-btn:hover:not(.is-active) {
  background: #e8e8e8;
}

.mode-btn.is-active {
  background: #2a4a7a;
  color: #fff;
  font-weight: 600;
}

.mode-btn--reward.is-active {
  background: #e6c800;
  color: #3d3500;
}
</style>
