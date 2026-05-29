import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    // __APP_VERSION__ wird zur Build-Zeit aus package.json injiziert
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      // manifest.json liegt bereits in public/ — nicht neu generieren
      manifest: false,
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
