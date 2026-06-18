<script setup lang="ts">
import { UI } from './constants/ui'
import UpdateBanner from './components/UpdateBanner.vue'
import DevBanner from './components/DevBanner.vue'

// __APP_VERSION__ wird von Vite zur Build-Zeit aus package.json injiziert
const appVersion = __APP_VERSION__
</script>

<template>
  <nav class="app-nav">
    <router-link to="/" class="nav-home">{{ UI.appBrand }}</router-link>
    <span class="nav-version">Version {{ appVersion }}<DevBanner /></span>
    <router-link to="/character/new" class="nav-link">{{ UI.appNewChar }}</router-link>
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
</style>
