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

// ── Module-level token cache (shared across all GoogleDriveProvider instances) ──

let cachedAccessToken: string | null = null
let cachedTokenExpiry: number | null = null
let gisApiLoaded = false
let pickerApiLoaded = false

const SESSION_STORAGE_TOKEN_KEY = 'magusng_gdrive_token'
const SESSION_STORAGE_EXPIRY_KEY = 'magusng_gdrive_token_exp'
/** Margin in ms: request a new token 5 minutes before it actually expires. */
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000

/**
 * GoogleDriveProvider — uses Google Picker API for file selection and Drive API v3
 * for download (files.get?alt=media) and upload (multipart).
 *
 * Manages a folder tree: MagusNG/characters or MagusNG/rules.
 * Access token is cached in a module-level variable + sessionStorage to avoid
 * showing the Google account picker on every operation.
 */
export class GoogleDriveProvider implements FileProvider {
  readonly name = 'Google Drive'
  private readonly folder: string
  private folderId: string | null = null

  constructor(folder: 'characters' | 'rules') {
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
    if (!res.ok) throw new Error('Google Drive upload failed')
  }

  isAvailable(): boolean {
    return !!import.meta.env.VITE_GOOGLE_CLIENT_ID
  }

  /**
   * Fetch wrapper that automatically attaches the Bearer token and retries
   * once if the server responds with 401 (expired token).
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
      // Token expired — clear cache and retry once
      cachedAccessToken = null
      cachedTokenExpiry = null
      try {
        sessionStorage.removeItem(SESSION_STORAGE_TOKEN_KEY)
        sessionStorage.removeItem(SESSION_STORAGE_EXPIRY_KEY)
      } catch { /* ignore */ }
      res = await execute()
    }
    return res
  }

  private async ensureAccessToken(): Promise<string> {
    // Module-level cache
    if (cachedAccessToken && cachedTokenExpiry && Date.now() < cachedTokenExpiry) {
      return cachedAccessToken
    }

    // sessionStorage (survives page navigations within the same tab)
    try {
      const storedToken = sessionStorage.getItem(SESSION_STORAGE_TOKEN_KEY)
      const storedExpiry = sessionStorage.getItem(SESSION_STORAGE_EXPIRY_KEY)
      if (storedToken && storedExpiry) {
        const expiry = parseInt(storedExpiry, 10)
        if (Date.now() < expiry) {
          cachedAccessToken = storedToken
          cachedTokenExpiry = expiry
          return storedToken
        }
      }
    } catch { /* sessionStorage unavailable */ }

    // No valid cached token — trigger OAuth flow
    await this.loadGisApi()

    return new Promise((resolve, reject) => {
      google.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (res) => {
          if (res.error) { reject(new Error(res.error)); return }
          const token = res.access_token!
          const expiresIn = res.expires_in ?? 3600
          const expiry = Date.now() + expiresIn * 1000 - TOKEN_EXPIRY_MARGIN_MS

          cachedAccessToken = token
          cachedTokenExpiry = expiry

          try {
            sessionStorage.setItem(SESSION_STORAGE_TOKEN_KEY, token)
            sessionStorage.setItem(SESSION_STORAGE_EXPIRY_KEY, expiry.toString())
          } catch { /* non-critical */ }

          resolve(token)
        },
      }).requestAccessToken()
    })
  }

  private async loadGisApi(): Promise<void> {
    if (gisApiLoaded) return
    await loadScript('https://accounts.google.com/gsi/client')
    gisApiLoaded = true
  }

  /**
   * Ensure the MagusNG/{folder} tree exists and return the sub-folder ID.
   * Minimises API calls: root folder is fetched/created once, sub-folder once.
   */
  private async ensureFolderTree(): Promise<string> {
    if (this.folderId) return this.folderId

    const rootId = await this.findOrCreateFolder(null, 'MagusNG')
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
    if (!searchRes.ok) throw new Error('Failed to search for Drive folder')

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
    if (!createRes.ok) throw new Error(`Failed to create Drive folder "${name}"`)
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
    if (!res.ok) throw new Error('Failed to download file from Google Drive')
    return res.text()
  }
}
