import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    watch: {
      usePolling: true,
    },
  },
  define: {
    // __APP_VERSION__ wird zur Build-Zeit aus package.json injiziert
    // Überschreibbar via Umgebungsvariable VITE_APP_VERSION (für dev-Builds)
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION || pkg.version),
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      // Name via VITE_PWA_NAME überschreibbar (für dev-Builds: "M5 - Chronist - DEV")
      manifest: {
        name: process.env.VITE_PWA_NAME || 'M5 - Chronist',
        short_name: process.env.VITE_PWA_NAME || 'M5 - Chronist',
        description: 'RPG character management app',
        start_url: '/',
        display: 'standalone',
        background_color: '#2A4A7A',
        theme_color: '#2A4A7A',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Alle App-Assets (JS, CSS, HTML, SVG) vorcachen
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
        // Navigations-Fallback: SPA-Routen offline bedienen
        navigateFallback: 'index.html',
      },
    }),
  ],
  base: '/',
})
