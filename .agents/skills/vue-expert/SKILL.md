---
name: vue-expert
description: Builds and reviews Vue 3 components with the Composition API, script setup, typed props/emits, composables, Vue Router routing, PWA/service-worker work, and Vite build configuration. Use when creating or refactoring Vue 3 components or composables, wiring reactivity (ref, reactive, computed, watch), configuring Vite or vite-plugin-pwa, or typing Vue components. This project uses no Nuxt, Pinia, Quasar, or Capacitor.
license: MIT
metadata:
  author: https://github.com/Jeffallan
  company: https://synergetic.solutions
  version: "1.1.0-magusng.1"
  domain: frontend
  triggers: Vue 3, Composition API, script setup, Vue composables, reactive, ref, computed, Vue Router, Vite Vue, vite-plugin-pwa, PWA, service worker, TypeScript, sourcemap, build optimization
  role: specialist
  scope: implementation
  output-format: code
  related-skills: typescript-pro
---

# Vue Expert

Senior Vue specialist with deep expertise in Vue 3 Composition API, reactivity system, and the Vite/PWA build used in this repository.

> Locally trimmed for MagusNG: the upstream Nuxt, Pinia, Quasar and Capacitor chapters were removed. Global state lives in framework-free service singletons under `src/services/` — there is no store library.

## Core Workflow

1. **Analyze requirements** - Identify component hierarchy, state needs, routing
2. **Design architecture** - Plan composables, service usage, component structure
3. **Implement** - Build components with Composition API and proper reactivity
4. **Validate** - Run `npx vue-tsc -b` for type errors. If type errors are found: fix each issue and re-run until the output is clean. The repository has no test suite; `npm run build` is the only verification gate.
5. **Optimize** - Minimize re-renders, optimize computed properties, lazy load

## Reference Guide

Load detailed guidance based on context:

| Topic | Reference | Load When |
|-------|-----------|-----------|
| Composition API | `references/composition-api.md` | ref, reactive, computed, watch, lifecycle |
| Components | `references/components.md` | Props, emits, slots, provide/inject |
| TypeScript | `references/typescript.md` | Typing props, generic components, type safety |
| Build Tooling | `references/build-tooling.md` | Vite config, sourcemaps, optimization, bundling |
| PWA | `references/pwa.md` | vite-plugin-pwa, workbox, service worker, manifest, install/update flow |

## Project Conventions

- **Global state**: framework-free service singletons (`src/services/`) that views import directly. Do not introduce Pinia, Vuex, or another store.
- **UI text**: German strings belong in `src/constants/ui.ts` and are used as `UI.key`. Do not hardcode new text in templates.
- **Styling**: no CSS framework. Keep plain scoped `<style>` per component; shared button classes live in `src/styles/buttons.css`.
- **Routing**: only `HomeView` is eagerly imported in `src/router/index.ts`. Every other route stays lazy.
- **Immutability**: services return new objects (for example `AdvancementService`, `CharacterValidator.autoFix`). Never mutate the object passed in.
- **Browser limits**: local file import/export uses the File System Access API (Chromium only).

## Quick Example

Minimal component demonstrating preferred patterns:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{ initialCount?: number }>()

const count = ref(props.initialCount ?? 0)
const doubled = computed(() => count.value * 2)

function increment() {
  count.value++
}
</script>

<template>
  <button @click="increment">Count: {{ count }} (doubled: {{ doubled }})</button>
</template>
```

## Constraints

### MUST DO
- Use Composition API (NOT Options API)
- Use `<script setup>` syntax for components
- Use type-safe props with TypeScript
- Use `ref()` for primitives, `reactive()` for objects
- Use `computed()` for derived state
- Use proper lifecycle hooks (onMounted, onUnmounted, etc.)
- Implement proper cleanup in composables
- Add new German UI strings to `src/constants/ui.ts`

### MUST NOT DO
- Use Options API (data, methods, computed as object)
- Mix Composition API with Options API
- Mutate props directly
- Create reactive objects unnecessarily
- Use watch when computed is sufficient
- Forget to cleanup watchers and effects
- Access DOM before onMounted
- Introduce a state library (Pinia, Vuex) — use service singletons

## Output Templates

When implementing Vue features, provide:
1. Component file with `<script setup>` and TypeScript
2. Composable if reusable logic exists
3. Brief explanation of reactivity decisions

## Knowledge Reference

Vue 3 Composition API, Vue Router 4, Vite, vite-plugin-pwa, TypeScript, reactive programming, performance optimization

Maintained by [@jeffallan](https://github.com/jeffallan), Principal Consultant at [Synergetic Solutions](https://synergetic.solutions)

[Documentation](https://jeffallan.github.io/claude-skills/skills/frontend/vue-expert/)
