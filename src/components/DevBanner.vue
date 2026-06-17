<script setup lang="ts">
const isDev = __APP_VERSION__.includes('-dev.')
const appVersion = __APP_VERSION__
</script>

<template>
  <div v-if="isDev" class="dev-banner" role="status">
    <span class="dev-banner__dot" />
    <span class="dev-banner__label">DEV</span>
    <span class="dev-banner__version">{{ appVersion }}</span>
  </div>
</template>

<style scoped>
.dev-banner {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: 0.5rem;
  padding: 0.1rem 0.5rem;
  border-radius: 3px;
  background: #c0392b;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  font-family: sans-serif;
  line-height: 1.4;
}

.dev-banner__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #f1c40f;
  animation: pulse 1.5s ease-in-out infinite;
}

.dev-banner__label {
  letter-spacing: 0.05em;
}

.dev-banner__version {
  font-weight: 400;
  opacity: 0.85;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
