import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

const gitHash = execSync('git rev-parse --short HEAD').toString().trim()

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    // __APP_VERSION__ ist der kurze Git-Commit-Hash, z.B. "a3f9c12"
    __APP_VERSION__: JSON.stringify(gitHash),
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
