<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { UI } from './constants/ui'
import UpdateBanner from './components/UpdateBanner.vue'
import DevBanner from './components/DevBanner.vue'
import {
  hasDriveTokens,
  revokeDriveAccess,
  getDriveUserEmail,
} from './services/FileProvider'

// __APP_VERSION__ wird von Vite zur Build-Zeit aus package.json injiziert
const appVersion = __APP_VERSION__
const isDev = __APP_VERSION__.includes('-dev.')

const driveEmail = ref<string | null>(null)
const driveHasTokens = ref(false)

async function updateDriveStatus(): Promise<void> {
  const hasTokens = hasDriveTokens()
  driveHasTokens.value = hasTokens
  driveEmail.value = hasTokens ? await getDriveUserEmail() : null
}

onMounted(() => {
      window.addEventListener('magusng:drive-changed', updateDriveStatus)
  updateDriveStatus()
})

onUnmounted(() => {
  window.removeEventListener('magusng:drive-changed', updateDriveStatus)
})

async function revokeDrive(): Promise<void> {
  await revokeDriveAccess()
  // clearTokens dispatches the event → updateDriveStatus will fire
}
</script>

<template>
  <nav class="app-nav">
    <router-link to="/" class="nav-home">{{ UI.appBrand }}</router-link>
    <span class="nav-version">
      <template v-if="!isDev">Version {{ appVersion }}</template>
      <DevBanner />
    </span>
    <span class="nav-drive">
      <template v-if="driveHasTokens">
        <span class="nav-drive-email">{{ driveEmail ? `${UI.driveConnectedAs} ${driveEmail}` : UI.driveStatusConnected }}</span>
        <button class="nav-drive-revoke" @click="revokeDrive">{{ UI.driveRevokeBtn }}</button>
      </template>
      <span v-else class="nav-drive-none">{{ UI.driveStatusNone }}</span>
    </span>
    <router-link to="/help" class="nav-link nav-link--help">{{ UI.helpNav }}</router-link>
  </nav>
  <RouterView />
  <UpdateBanner />
</template>

<style>
* { box-sizing: border-box; }
body { margin: 0; background: #fff; }

.app-nav {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.6rem 1.5rem;
  background: #2a4a7a;
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-home {
  color: #fff;
  font-weight: 700;
  font-size: 1.1rem;
  text-decoration: none;
  font-family: sans-serif;
}

.nav-version {
  color: #8aaad0;
  font-size: 0.75rem;
  font-family: sans-serif;
  margin-left: -1rem;  /* optisch nah am Brand-Namen */
  align-self: flex-end;
  padding-bottom: 0.1rem;
}

.nav-link {
  color: #c8d8f0;
  font-size: 0.9rem;
  text-decoration: none;
  font-family: sans-serif;
}

.nav-link:hover,
.nav-home:hover {
  text-decoration: underline;
}

.nav-link--help {
  margin-left: auto;
  font-size: 0.85rem;
  opacity: 0.8;
}

.nav-link--help:hover {
  opacity: 1;
}

.nav-drive {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: #c8d8f0;
  font-size: 0.8rem;
  font-family: sans-serif;
}

.nav-drive-email {
  white-space: nowrap;
}

.nav-drive-revoke {
  background: none;
  border: 1px solid #8aaad0;
  color: #c8d8f0;
  font-size: 0.75rem;
  font-family: sans-serif;
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
}

.nav-drive-revoke:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.nav-drive-none {
  opacity: 0.6;
}
</style>
