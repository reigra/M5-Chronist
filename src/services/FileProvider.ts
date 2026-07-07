/**
 * FileProvider — interface for reading/writing JSON files from various sources.
 *
 * Implementations: LocalFileProvider (FS Access API), GoogleDriveProvider (Picker + Drive API).
 */

export interface FileProvider {
  readonly name: string

  /** Read a JSON file. Returns the parsed data and the file name. */
  readFile(nameHint?: string): Promise<{ data: unknown; fileName: string }>

  /** Write a JSON-serializable object to a file. */
  writeFile(data: unknown, suggestedName: string): Promise<void>

  /** Whether this provider is available in the current browser. */
  isAvailable(): boolean
}

/**
 * LocalFileProvider — uses the File System Access API (Chromium only).
 */
export class LocalFileProvider implements FileProvider {
  readonly name = 'Lokales Dateisystem'

  async readFile(): Promise<{ data: unknown; fileName: string }> {
    if (!('showOpenFilePicker' in window)) {
      throw new Error(
        'File System Access API is not supported in this browser. ' +
        'Please use Chrome, Edge, or Opera.',
      )
    }
    const [handle] = await (window as any).showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    })
    const file = await handle.getFile()
    const text = await file.text()
    return { data: JSON.parse(text), fileName: file.name }
  }

  async writeFile(data: unknown, suggestedName: string): Promise<void> {
    if (!('showSaveFilePicker' in window)) {
      throw new Error(
        'File System Access API is not supported in this browser. ' +
        'Please use Chrome, Edge, or Opera.',
      )
    }
    const handle = await (window as any).showSaveFilePicker({
      suggestedName,
      types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }],
    })
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()
  }

  isAvailable(): boolean {
    return 'showOpenFilePicker' in window
  }
}

// ── Google API type stubs (no extra packages needed) ─────────────────────────

declare global {
  var google: {
    accounts: {
      oauth2: {
        initTokenClient(config: {
          client_id: string
          scope: string
          callback: (response: { access_token?: string; error?: string; expires_in?: number }) => void
        }): { requestAccessToken(): void }
        initCodeClient(config: {
          client_id: string
          scope: string
          ux_mode: 'popup' | 'redirect'
          code_challenge?: string
          code_challenge_method?: string
          state?: string
          callback: (response: { code?: string; error?: string }) => void
        }): { requestCode(): void }
      }
    }
    picker: {
      PickerBuilder: new () => {
        setAppId(id: string): any
        setOAuthToken(token: string): any
        addView(view: any): any
        setCallback(fn: (data: any) => void): any
        build(): { setVisible(v: boolean): void }
      }
      DocsView: new () => {
        setParent(folderId: string): any
      }
      ViewId: { DOCS: any }
      Action: { PICKED: string }
    }
  }
  var gapi: {
    load(api: string, params: { callback: () => void }): void
  }
}

// ── GoogleDriveProvider ─────────────────────────────────────────────────────

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = src
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.head.appendChild(el)
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function sanitizeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').trim()
}

/**
 * Save a file to disk.
 *
 * Uses the File System Access API (`showSaveFilePicker`) in Chromium browsers
 * (Chrome, Edge, Opera) so the user can pick the target location. Falls back to
 * a direct Blob download via `<a download>` when the API is unavailable.
 *
 * If the user cancels the save dialog, the function silently returns.
 */
export async function saveFileAs(
  content: string | Blob,
  fileName: string,
  mimeType: string,
): Promise<void> {
  const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'Datei', accept: { [mimeType]: ['.' + (fileName.split('.').pop() ?? '')] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    } catch (e) {
      // User cancelled → silently ignore
      if (e instanceof Error && e.name === 'AbortError') return
      // Re-throw unexpected errors
      throw e
    }
  }

  // Fallback for browsers without File System Access API
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

// ── Module-level token cache (shared across all GoogleDriveProvider instances) ──

let cachedAccessToken: string | null = null
let cachedTokenExpiry: number | null = null
let cachedRefreshToken: string | null = null
let gisApiLoaded = false
let pickerApiLoaded = false

const STORAGE_TOKEN_KEY = 'magusng_gdrive_token'
const STORAGE_EXPIRY_KEY = 'magusng_gdrive_token_exp'
const STORAGE_REFRESH_KEY = 'magusng_gdrive_refresh_token'
/** Margin in ms: request a new token 5 minutes before it actually expires. */
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000

/**
 * GoogleDriveProvider — uses Google Picker API for file selection and Drive API v3
 * for download (files.get?alt=media) and upload (multipart).
 *
 * Manages a folder tree: MagusNG/characters or MagusNG/rules.
 *
 * Authentication uses the Authorization Code flow with client_secret
 * (Google Cloud Console client type: "Web application").  The access token
 * is refreshed silently afterwards, so the Google account picker appears
 * only on the very first use.
 *
 * Tokens are persisted in localStorage and survive browser restarts.
 *
 * Note: PKCE (RFC 7636) is intentionally not used here.  The Google Cloud
 * Console OAuth client for this project is registered as "Web application",
 * which requires client_secret in the token exchange.  Switching to a
 * "Public" client type would allow PKCE, but that type does not support
 * the Drive API scopes used by this application.
 */
export class GoogleDriveProvider implements FileProvider {
  readonly name = 'Google Drive'
  private readonly folder: string
  private folderId: string | null = null

  constructor(folder: 'characters' | 'rules' | 'backup') {
    this.folder = folder
  }

  async readFile(): Promise<{ data: unknown; fileName: string }> {
    const token = await this.ensureAccessToken()
    await this.ensureFolderTree()
    const doc = await this.openPicker(token)
    const json = await this.downloadFile(doc.id)
    return { data: JSON.parse(json), fileName: doc.name }
  }

  async writeFile(data: unknown, suggestedName: string): Promise<void> {
    await this.ensureAccessToken()
    const folderId = await this.ensureFolderTree()
    const metadata = { name: suggestedName, mimeType: 'application/json', parents: [folderId] }
    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
    form.append('file', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))

    const res = await this.fetchWithToken(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      { method: 'POST', body: form },
    )
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Drive upload failed (${res.status}): ${text}`)
    }
  }

  /**
   * Open a picker and read the selected file as a Blob (binary data).
   * Used by BackupService to read backup ZIPs from Drive.
   */
  async readBlob(): Promise<{ blob: Blob; fileName: string }> {
    const token = await this.ensureAccessToken()
    await this.ensureFolderTree()
    const doc = await this.openPicker(token)
    const blob = await this.downloadBlob(doc.id)
    return { blob, fileName: doc.name }
  }

  /**
   * Download a file as Blob via Drive API v3 (files.get with alt=media).
   */
  private async downloadBlob(fileId: string): Promise<Blob> {
    const res = await this.fetchWithToken(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    )
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Drive download failed (${res.status}): ${text}`)
    }
    return res.blob()
  }

  /**
   * Upload a Blob (e.g. a ZIP archive) to the configured Drive folder.
   * Unlike writeFile(), this accepts an arbitrary Blob with its own MIME type.
   */
  async writeBlob(blob: Blob, suggestedName: string): Promise<void> {
    await this.ensureAccessToken()
    const folderId = await this.ensureFolderTree()
    const metadata = { name: suggestedName, mimeType: blob.type, parents: [folderId] }
    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
    form.append('file', blob)

    const res = await this.fetchWithToken(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      { method: 'POST', body: form },
    )
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Drive upload failed (${res.status}): ${text}`)
    }
  }

  isAvailable(): boolean {
    return !!import.meta.env.VITE_GOOGLE_CLIENT_ID
  }

  /**
   * Fetch wrapper that automatically attaches the Bearer token and retries
   * once if the server responds with 401 (expired/stale token).
   */
  private async fetchWithToken(url: string, options: RequestInit = {}): Promise<Response> {
    const execute = async (): Promise<Response> => {
      const token = await this.ensureAccessToken()
      return fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.headers as Record<string, string> ?? {}),
        },
      })
    }

    let res = await execute()
    if (res.status === 401) {
      // Stale access token — clear it (keep refresh token) and try once more
      cachedAccessToken = null
      cachedTokenExpiry = null
      try {
        localStorage.removeItem(STORAGE_TOKEN_KEY)
        localStorage.removeItem(STORAGE_EXPIRY_KEY)
      } catch { /* ignore */ }
      res = await execute()
    }
    return res
  }

  // ── Token lifecycle ──────────────────────────────────────────────────────────

  /**
   * Returns a valid access token.
   *
   * Priority:
   *  1. Module-level cache (fastest)
   *  2. localStorage (survives restarts)
   *  3. Silent refresh via stored refresh token (no UI)
   *  4. Full auth flow (account picker — once per user)
   */
  private async ensureAccessToken(): Promise<string> {
    // 1. Module-level cache
    if (cachedAccessToken && cachedTokenExpiry && Date.now() < cachedTokenExpiry) {
      return cachedAccessToken
    }

    // 2. localStorage
    this.loadTokensFromStorage()
    if (cachedAccessToken && cachedTokenExpiry && Date.now() < cachedTokenExpiry) {
      return cachedAccessToken
    }

    // 3. Silent refresh with stored refresh token
    if (cachedRefreshToken) {
      try {
        const result = await this.refreshAccessToken(cachedRefreshToken)
        cachedAccessToken = result.access_token
        cachedTokenExpiry = Date.now() + result.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS
        this.persistTokens()
        return cachedAccessToken
      } catch {
        // Refresh token expired / revoked — full re-auth required
        this.clearTokens()
      }
    }

    // 4. Full auth flow (first time or after revoke)
    return this.authenticateWithPkce()
  }

  /**
   * Authorization Code flow.
   *
   * Uses client_secret for token exchange because the Google Cloud Console OAuth
   * client is registered as "Web application" type.  PKCE would require a "Public"
   * client type, but that type is not available for Drive API scopes in our setup.
   *
   * Called once per user lifetime — afterwards the refresh token keeps access
   * alive silently.
   */
  private async authenticateWithPkce(): Promise<string> {
    await this.loadGisApi()

    const tokens = await new Promise<{
      access_token: string
      expires_in: number
      refresh_token: string
    }>((resolve, reject) => {
      google.accounts.oauth2.initCodeClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
        ux_mode: 'popup',
        callback: async (response: any) => {
          if (response.error) { reject(new Error(response.error)); return }
          try {
            const result = await this.exchangeCodeForTokens(response.code!)
            resolve(result)
          } catch (e) {
            reject(e)
          }
        },
      } as any).requestCode()
    })

    cachedAccessToken = tokens.access_token
    cachedRefreshToken = tokens.refresh_token
    cachedTokenExpiry = Date.now() + tokens.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS
    this.persistTokens()
    return cachedAccessToken
  }

  /**
   * Exchange an authorization code for access + refresh tokens.
   */
  private async exchangeCodeForTokens(
    code: string,
  ): Promise<{ access_token: string; expires_in: number; refresh_token: string }> {
    const body = new URLSearchParams({
      code,
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
      client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string,
    })
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Token exchange failed: ${text}`)
    }
    return res.json()
  }

  /**
   * Use a refresh token to obtain a new access token (no user interaction).
   */
  private async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ access_token: string; expires_in: number }> {
    const body = new URLSearchParams({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })
    const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET
    if (clientSecret) body.set('client_secret', clientSecret)
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Token refresh failed: ${text}`)
    }
    return res.json()
  }

  // ── localStorage helpers ─────────────────────────────────────────────────────

  private loadTokensFromStorage(): void {
    loadTokensFromStorage()
  }

  private persistTokens(): void {
    persistTokens()
  }

  private clearTokens(): void {
    clearTokens()
  }

  private async loadGisApi(): Promise<void> {
    if (gisApiLoaded) return
    await loadScript('https://accounts.google.com/gsi/client')
    gisApiLoaded = true
  }

  /**
   * Ensure the MagusNG/{folder} tree exists and return the folder ID.
   * For 'backup', the backup ZIP goes directly into MagusNG (no subfolder).
   * For 'characters' and 'rules', a subfolder is created.
   */
  async ensureFolderTree(): Promise<string> {
    if (this.folderId) return this.folderId

    const rootId = await this.findOrCreateFolder(null, 'MagusNG')
    if (this.folder === 'backup') {
      this.folderId = rootId
      return rootId
    }
    const subId = await this.findOrCreateFolder(rootId, this.folder)
    this.folderId = subId
    return subId
  }

  /**
   * Find an existing folder by name (and optional parent), or create one.
   */
  private async findOrCreateFolder(parentId: string | null, name: string): Promise<string> {
    const parentClause = parentId
      ? ` and '${parentId}' in parents`
      : " and 'root' in parents"
    const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`)
    const searchRes = await this.fetchWithToken(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5`,
    )
    if (!searchRes.ok) {
      const text = await searchRes.text()
      throw new Error(`Drive folder search failed (${searchRes.status}): ${text}`)
    }

    const searchData = await searchRes.json()
    const files = searchData.files as Array<{ id: string }> | undefined
    if (files && files.length > 0) return files[0].id

    const body: Record<string, unknown> = { name, mimeType: 'application/vnd.google-apps.folder' }
    if (parentId) body.parents = [parentId]
    const createRes = await this.fetchWithToken('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!createRes.ok) {
      const text = await createRes.text()
      throw new Error(`Drive folder creation failed (${createRes.status}): ${text}`)
    }
    const createData = await createRes.json()
    return createData.id as string
  }

  private async openPicker(token: string): Promise<{ id: string; name: string }> {
    await this.loadPickerApi()
    return new Promise((resolve) => {
      const view = new google.picker.DocsView()
        .setParent(this.folderId!)

      const picker = new google.picker.PickerBuilder()
        .setAppId(import.meta.env.VITE_GOOGLE_APP_ID as string)
        .setOAuthToken(token)
        .addView(view)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const doc = data.docs[0]
            resolve({ id: doc.id, name: doc.name })
          }
        })
        .build()
      picker.setVisible(true)
    })
  }

  private async loadPickerApi(): Promise<void> {
    if (pickerApiLoaded) return
    await loadScript('https://apis.google.com/js/api.js')
    await new Promise<void>((resolve) => gapi.load('picker', { callback: () => resolve() }))
    pickerApiLoaded = true
  }

  /**
   * Download the file content via Drive API v3 (files.get with alt=media).
   * More reliable than relying on the Picker's downloadUrl field.
   */
  private async downloadFile(fileId: string): Promise<string> {
    const res = await this.fetchWithToken(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    )
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Drive download failed (${res.status}): ${text}`)
    }
    return res.text()
  }
}

// ── Module-level token helpers (shared across all GoogleDriveProvider instances) ──

function loadTokensFromStorage(): void {
  if (cachedAccessToken && cachedRefreshToken !== null) return
  try {
    cachedAccessToken = localStorage.getItem(STORAGE_TOKEN_KEY)
    const expiryStr = localStorage.getItem(STORAGE_EXPIRY_KEY)
    cachedTokenExpiry = expiryStr ? parseInt(expiryStr, 10) : null
    cachedRefreshToken = localStorage.getItem(STORAGE_REFRESH_KEY)
  } catch { /* ignore */ }
}

function persistTokens(): void {
  try {
    localStorage.setItem(STORAGE_TOKEN_KEY, cachedAccessToken ?? '')
    localStorage.setItem(STORAGE_EXPIRY_KEY, (cachedTokenExpiry ?? 0).toString())
    localStorage.setItem(STORAGE_REFRESH_KEY, cachedRefreshToken ?? '')
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('magusng:drive-changed'))
}

function clearTokens(): void {
  cachedAccessToken = null
  cachedRefreshToken = null
  cachedTokenExpiry = null
  try {
    localStorage.removeItem(STORAGE_TOKEN_KEY)
    localStorage.removeItem(STORAGE_EXPIRY_KEY)
    localStorage.removeItem(STORAGE_REFRESH_KEY)
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('magusng:drive-changed'))
}

/**
 * Check whether the user has previously authenticated with Google Drive.
 * Tokens are stored in localStorage and survive browser restarts.
 */
export function hasDriveTokens(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_REFRESH_KEY)
  } catch {
    return false
  }
}

/**
 * Initiate Google Drive authentication and create the folder structure.
 *
 * Calling this triggers the OAuth flow (account picker) if no valid
 * token is cached. After successful auth the MagusNG/, MagusNG/characters/
 * and MagusNG/rules/ folders are created eagerly and sequentially
 * to avoid Drive API race conditions.
 *
 * Safe to call when already authenticated — returns immediately.
 */
export async function connectDrive(): Promise<void> {
  const charProvider = new GoogleDriveProvider('characters')
  await charProvider.ensureFolderTree()
  // After the first call the token is cached; a second instance uses it silently.

  const rulesProvider = new GoogleDriveProvider('rules')
  await rulesProvider.ensureFolderTree()
}

/**
 * Revoke Google Drive access:
 * 1. Call the Google OAuth revoke endpoint to invalidate tokens server-side.
 * 2. Clear all cached and stored tokens locally.
 *
 * After calling this, the next Drive operation will show the account picker again.
 */
export async function revokeDriveAccess(): Promise<void> {
  loadTokensFromStorage()

  const token = cachedRefreshToken || cachedAccessToken
  if (token) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      })
    } catch {
      // Ignore network errors — still clear local tokens
    }
  }

  clearTokens()
}

  /**
   * Fetch the email address of the currently authenticated Google account.
   * Requires the `userinfo.email` scope (included in the OAuth request).
   * Silently refreshes the access token if needed (no UI popup).
   * Returns `null` if no token is available or the request fails.
   */
export async function getDriveUserEmail(): Promise<string | null> {
  loadTokensFromStorage()

  // Silent refresh if the access token is expired but a refresh token exists
  if ((!cachedAccessToken || !cachedTokenExpiry || Date.now() >= cachedTokenExpiry) && cachedRefreshToken) {
    try {
      const body = new URLSearchParams({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
        grant_type: 'refresh_token',
        refresh_token: cachedRefreshToken,
      })
      const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET
      if (clientSecret) body.set('client_secret', clientSecret)
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      if (res.ok) {
        const result = await res.json()
        cachedAccessToken = result.access_token
        cachedTokenExpiry = Date.now() + result.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS
        persistTokens()
      }
    } catch { /* ignore — fall through */ }
  }

  const token = cachedAccessToken
  if (!token) return null

  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data as { email?: string }).email ?? null
  } catch {
    return null
  }
}
