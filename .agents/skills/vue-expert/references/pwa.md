# PWA & Service Workers

This project uses `vite-plugin-pwa` (configured in `vite.config.ts`) with `registerType: 'prompt'`.
Before writing PWA code, retrieve the current `vite-plugin-pwa` and Workbox docs — do not guess
flag names or config shapes from memory.

## Configuration

```ts
// vite.config.ts
VitePWA({
  registerType: 'prompt',
  manifest: {
    name: process.env.VITE_PWA_NAME || 'Magus NG',
    short_name: process.env.VITE_PWA_NAME || 'Magus NG',
    display: 'standalone',
    start_url: '/',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
    navigateFallback: 'index.html',
  },
})
```

- `manifest.name`/`short_name` are driven by `VITE_PWA_NAME`, so dev builds (`Magus NG - DEV`) stay distinguishable from production in the installed app.
- `navigateFallback: 'index.html'` is what serves SPA routes while offline.
- `registerType: 'prompt'` is deliberate: the user decides when to reload. Do not switch to `autoUpdate` — an automatic reload would discard in-progress character edits.

## Registering the Service Worker

`src/components/UpdateBanner.vue` already owns registration and the update prompt:

```ts
import { useRegisterSW } from 'virtual:pwa-register/vue'

const { needRefresh, updateServiceWorker } = useRegisterSW()
```

Extend that component instead of adding a second registration or a second update prompt.
`updateServiceWorker(false)` sends `skipWaiting` without reloading; the reload happens on the
`controllerchange` listener so the page never goes blank mid-update.

## Runtime Caching

`globPatterns` precaches the built assets. Add `workbox.runtimeCaching` only for requests the
precache cannot cover:

```ts
workbox: {
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/api\./,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
  ],
}
```

Keep character data out of the Workbox cache — it lives in IndexedDB, not in HTTP responses.

## Install Prompt

Chrome fires `beforeinstallprompt`; keep the deferred event and use it only in a user gesture:

```ts
// src/composables/usePwaInstall.ts
import { ref, onMounted } from 'vue'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePwaInstall() {
  const canInstall = ref(false)
  const isInstalled = ref(false)
  let deferredPrompt: BeforeInstallPromptEvent | null = null

  onMounted(() => {
    isInstalled.value = window.matchMedia('(display-mode: standalone)').matches

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault()
      deferredPrompt = event as BeforeInstallPromptEvent
      canInstall.value = true
    })

    window.addEventListener('appinstalled', () => {
      isInstalled.value = true
      canInstall.value = false
      deferredPrompt = null
    })
  })

  async function install(): Promise<boolean> {
    if (!deferredPrompt) return false

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    deferredPrompt = null
    canInstall.value = false

    return outcome === 'accepted'
  }

  return { canInstall, isInstalled, install }
}
```

## Offline Detection

```ts
// src/composables/useOnlineStatus.ts
import { ref, onMounted, onUnmounted } from 'vue'

export function useOnlineStatus() {
  const isOnline = ref(navigator.onLine)

  function updateOnlineStatus(): void {
    isOnline.value = navigator.onLine
  }

  onMounted(() => {
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
  })

  onUnmounted(() => {
    window.removeEventListener('online', updateOnlineStatus)
    window.removeEventListener('offline', updateOnlineStatus)
  })

  return { isOnline }
}
```

The app is fully client-side, so offline mode must not block character editing — only Drive and
LaTeX export depend on connectivity.
