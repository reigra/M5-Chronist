<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue'

/**
 * Update-Banner — erscheint wenn eine neue App-Version verfügbar ist.
 * Der Nutzer kann die neue Version sofort laden oder den Banner schließen.
 * useRegisterSW registriert den Service Worker und stellt reaktive Flags bereit.
 */
const { needRefresh, updateServiceWorker } = useRegisterSW()

function reload(): void {
  updateServiceWorker(true)
}

function dismiss(): void {
  needRefresh.value = false
}
</script>

<template>
  <div v-if="needRefresh" class="update-banner" role="alert">
    <span class="update-banner__text">
      Eine neue Version ist verfügbar.
    </span>
    <button class="update-banner__btn update-banner__btn--primary" @click="reload">
      Jetzt aktualisieren
    </button>
    <button class="update-banner__btn" @click="dismiss" aria-label="Schließen">
      ✕
    </button>
  </div>
</template>

<style scoped>
.update-banner {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  background: #2a4a7a;
  color: #fff;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
  font-family: sans-serif;
  font-size: 0.9rem;
  z-index: 9999;
  white-space: nowrap;
}

.update-banner__text {
  flex: 1;
}

.update-banner__btn {
  padding: 0.3rem 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 4px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  font-size: 0.85rem;
}

.update-banner__btn--primary {
  background: #fff;
  color: #2a4a7a;
  font-weight: 600;
  border-color: #fff;
}

.update-banner__btn--primary:hover {
  background: #e8eef7;
}

.update-banner__btn:not(.update-banner__btn--primary):hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
