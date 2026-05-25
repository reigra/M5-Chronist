<script setup lang="ts">
import { UI } from './constants/ui'
</script>

<template>
  <nav class="app-nav">
    <router-link to="/" class="nav-home">{{ UI.appBrand }}</router-link>
    <router-link to="/character/new" class="nav-link">{{ UI.appNewChar }}</router-link>
  </nav>
  <RouterView />
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
</style>
