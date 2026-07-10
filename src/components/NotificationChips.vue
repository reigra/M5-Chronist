<script setup lang="ts">
import { useNotifications } from '../composables/useNotifications'

const { notifications, dismiss } = useNotifications()
</script>

<template>
  <TransitionGroup name="chip" tag="div" class="notifications">
    <div
      v-for="n in notifications"
      :key="n.id"
      class="notification-chip"
      :class="`notification-chip--${n.type}`"
    >
      <span class="notification-chip__message">{{ n.message }}</span>
      <button class="notification-chip__close" @click="dismiss(n.id)">×</button>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.notifications {
  position: fixed;
  top: 4rem;
  right: 1rem;
  z-index: 9998;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 24rem;
}

.notification-chip {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.8rem;
  border-radius: 4px;
  font-family: sans-serif;
  font-size: 0.85rem;
  background: #fff;
  border-left: 4px solid;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: opacity 0.25s, transform 0.25s;
}

.notification-chip--ok {
  background: #d4edda;
  border-left-color: #2a7a2a;
}

.notification-chip--warning {
  background: #fff3cd;
  border-left-color: #b8860b;
}

.notification-chip--error {
  background: #f8d7da;
  border-left-color: #c00;
}

.notification-chip__message {
  flex: 1;
  color: #222;
}

.notification-chip__close {
  flex-shrink: 0;
  width: 1.4rem;
  height: 1.4rem;
  border: none;
  background: transparent;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  color: #888;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notification-chip__close:hover {
  background: #eee;
  color: #222;
}

.chip-enter-active,
.chip-leave-active {
  transition: all 0.25s ease;
}

.chip-enter-from {
  opacity: 0;
  transform: translateX(1.5rem);
}

.chip-leave-to {
  opacity: 0;
  transform: translateX(1.5rem);
}

.chip-move {
  transition: transform 0.25s ease;
}
</style>
