/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Wird von Vite zur Build-Zeit aus package.json injiziert. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_GOOGLE_API_KEY: string
  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly VITE_GOOGLE_APP_ID: string
  readonly VITE_GOOGLE_CLIENT_SECRET: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
