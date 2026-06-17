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
          callback: (response: { access_token?: string; error?: string }) => void
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

/**
 * GoogleDriveProvider — uses Google Picker API for file selection and Drive API v3
 * for download (files.get?alt=media) and upload (multipart).
 *
 * Manages a folder tree: MagusNG/characters or MagusNG/rules.
 * Access token is held in memory only (no IndexedDB persistence in this version).
 */
export class GoogleDriveProvider implements FileProvider {
  readonly name = 'Google Drive'
  private readonly folder: string
  private accessToken: string | null = null
  private gisApiLoaded = false
  private pickerApiLoaded = false
  private folderId: string | null = null

  constructor(folder: 'characters' | 'rules') {
    this.folder = folder
  }

  async readFile(): Promise<{ data: unknown; fileName: string }> {
    const token = await this.ensureAccessToken()
    await this.ensureFolderTree(token)
    const doc = await this.openPicker(token)
    const json = await this.downloadFile(doc.id, token)
    return { data: JSON.parse(json), fileName: doc.name }
  }

  async writeFile(data: unknown, suggestedName: string): Promise<void> {
    const token = await this.ensureAccessToken()
    const folderId = await this.ensureFolderTree(token)
    const metadata = { name: suggestedName, mimeType: 'application/json', parents: [folderId] }
    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
    form.append('file', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) throw new Error('Google Drive upload failed')
  }

  isAvailable(): boolean {
    return !!import.meta.env.VITE_GOOGLE_CLIENT_ID
  }

  private async ensureAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken
    await this.loadGisApi()

    return new Promise((resolve, reject) => {
      google.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (res) => {
          if (res.error) { reject(new Error(res.error)); return }
          this.accessToken = res.access_token!
          resolve(res.access_token!)
        },
      }).requestAccessToken()
    })
  }

  private async loadGisApi(): Promise<void> {
    if (this.gisApiLoaded) return
    await loadScript('https://accounts.google.com/gsi/client')
    this.gisApiLoaded = true
  }

  /**
   * Ensure the MagusNG/{folder} tree exists and return the sub-folder ID.
   * Minimises API calls: root folder is fetched/created once, sub-folder once.
   */
  private async ensureFolderTree(token: string): Promise<string> {
    if (this.folderId) return this.folderId

    const rootId = await this.findOrCreateFolder(token, null, 'MagusNG')
    const subId = await this.findOrCreateFolder(token, rootId, this.folder)
    this.folderId = subId
    return subId
  }

  /**
   * Find an existing folder by name (and optional parent), or create one.
   */
  private async findOrCreateFolder(token: string, parentId: string | null, name: string): Promise<string> {
    const parentClause = parentId
      ? ` and '${parentId}' in parents`
      : " and 'root' in parents"
    const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`)
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!searchRes.ok) throw new Error('Failed to search for Drive folder')

    const searchData = await searchRes.json()
    const files = searchData.files as Array<{ id: string }> | undefined
    if (files && files.length > 0) return files[0].id

    const body: Record<string, unknown> = { name, mimeType: 'application/vnd.google-apps.folder' }
    if (parentId) body.parents = [parentId]
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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
    if (this.pickerApiLoaded) return
    await loadScript('https://apis.google.com/js/api.js')
    await new Promise<void>((resolve) => gapi.load('picker', { callback: () => resolve() }))
    this.pickerApiLoaded = true
  }

  /**
   * Download the file content via Drive API v3 (files.get with alt=media).
   * More reliable than relying on the Picker's downloadUrl field.
   */
  private async downloadFile(fileId: string, token: string): Promise<string> {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) throw new Error('Failed to download file from Google Drive')
    return res.text()
  }
}
