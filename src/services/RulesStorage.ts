import type { RulebookData, RulesData } from '../types/Rules'

const DB_NAME = 'MagusNG-Rules'
const DB_VERSION = 1
const STORE = 'sources'

/**
 * One source entry as stored in IndexedDB.
 * Contains the full rulebook data plus display metadata and an enabled flag.
 */
export interface StoredSource {
  id: string
  title: string
  version: string
  enabled: boolean
  data: RulebookData
}

/**
 * Lightweight summary used for display — no data payload.
 */
export interface SourceSummary {
  id: string
  title: string
  version: string
  enabled: boolean
}

/**
 * RulesStorage — saves, loads, and manages rulebook source files in IndexedDB.
 *
 * Usage:
 *   const summary = await rulesStorage.importFiles()
 *   const rules   = await rulesStorage.loadActive()
 */
export class RulesStorage {
  /**
   * Open (or create) the IndexedDB database.
   * Creates the "sources" object store on first run.
   */
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' })
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror  = () => reject(request.error)
    })
  }

  /**
   * Open a multi-file picker and import each selected JSON file as a source.
   * Each file must contain a valid "metadata.id" and "metadata.title".
   * Importing a file with an existing ID overwrites the previous entry.
   *
   * @returns Summaries of all successfully imported sources.
   * @throws  If the browser does not support the File System Access API,
   *          or if a selected file is not a valid rules file.
   */
  async importFiles(): Promise<SourceSummary[]> {
    if (!('showOpenFilePicker' in window)) {
      throw new Error('File System Access API is not supported in this browser.')
    }

    const fileHandles: FileSystemFileHandle[] = await (window as any).showOpenFilePicker({
      types: [{ description: 'JSON rules file', accept: { 'application/json': ['.json'] } }],
      multiple: true,
    })

    const imported: SourceSummary[] = []

    for (const handle of fileHandles) {
      const file = await handle.getFile()
      const text = await file.text()
      const data = JSON.parse(text) as RulebookData

      if (!data.metadata?.id || !data.metadata?.title) {
        throw new Error(
          `"${file.name}" is not a valid rules file — missing metadata.id or metadata.title.`
        )
      }

      const entry: StoredSource = {
        id:      data.metadata.id,
        title:   data.metadata.title,
        version: data.metadata.version ?? '?',
        enabled: true,
        data,
      }

      const db = await this.open()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(entry)
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror    = () => { db.close(); reject(tx.error) }
      })

      imported.push({ id: entry.id, title: entry.title, version: entry.version, enabled: true })
    }

    return imported
  }

  /**
   * Return a summary list of all stored sources (no data payload).
   *
   * @returns Array of SourceSummary, one per stored source.
   */
  async list(): Promise<SourceSummary[]> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx      = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).getAll()
      request.onsuccess = () => {
        db.close()
        resolve(
          (request.result as StoredSource[]).map(s => ({
            id:      s.id,
            title:   s.title,
            version: s.version,
            enabled: s.enabled,
          }))
        )
      }
      request.onerror = () => { db.close(); reject(request.error) }
    })
  }

  /**
   * Enable or disable a stored source by ID.
   * Disabled sources are kept in IndexedDB but excluded from loadActive().
   *
   * @param id      - The source ID to update.
   * @param enabled - True to enable, false to disable.
   */
  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx      = db.transaction(STORE, 'readwrite')
      const store   = tx.objectStore(STORE)
      const getReq  = store.get(id)

      getReq.onsuccess = () => {
        const entry = getReq.result as StoredSource | undefined
        if (!entry) { db.close(); resolve(); return }
        entry.enabled = enabled
        store.put(entry)
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror    = () => { db.close(); reject(tx.error) }
      }
      getReq.onerror = () => { db.close(); reject(getReq.error) }
    })
  }

  /**
   * Permanently remove a source from IndexedDB.
   *
   * @param id - The source ID to delete.
   */
  async remove(id: string): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror    = () => { db.close(); reject(tx.error) }
    })
  }

  /**
   * Load and merge all enabled sources into a single RulesData object.
   * Returns empty arrays for all fields if no sources are enabled.
   *
   * @returns Merged RulesData from all enabled sources.
   */
  async loadActive(): Promise<RulesData> {
    const db = await this.open()
    const entries = await new Promise<StoredSource[]>((resolve, reject) => {
      const tx      = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).getAll()
      request.onsuccess = () => { db.close(); resolve(request.result as StoredSource[]) }
      request.onerror   = () => { db.close(); reject(request.error) }
    })

    const rules: RulesData = {
      skills:           [],
      types:            [],
      races:            [],
      origins:          [],
      socialStatuses:   [],
      spells:           [],
      spellDescriptions: [],
    }

    for (const entry of entries.filter(e => e.enabled)) {
      const src = entry.data
      if (src.skills)            rules.skills.push(...src.skills)
      if (src.types)             rules.types.push(...src.types)
      if (src.races)             rules.races.push(...src.races)
      if (src.origins)           rules.origins.push(...src.origins)
      if (src.socialStatuses)    rules.socialStatuses.push(...src.socialStatuses)
      if (src.spells)            rules.spells.push(...src.spells)
      if (src.spellDescriptions) rules.spellDescriptions.push(...src.spellDescriptions)
    }

    return rules
  }
}

export const rulesStorage = new RulesStorage()
