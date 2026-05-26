import type { Character } from '../types/Character'

const DB_NAME = 'MagusNG'
const DB_VERSION = 1
const STORE = 'characters'

/**
 * CharacterStorage — saves and loads characters using IndexedDB.
 *
 * All public methods open the database on demand and close it when done.
 * Characters are identified by their `id` field (used as the object store key).
 */
export class CharacterStorage {
  /**
   * Open (or create) the IndexedDB database.
   * Creates the "characters" object store on the first run.
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
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Save a character to IndexedDB.
   * Overwrites any existing record with the same ID.
   *
   * @param character - The character to save.
   */
  async save(character: Character): Promise<void> {
    const db = await this.open()
    // IndexedDB uses the structured clone algorithm, which cannot serialize
    // Vue reactive Proxy objects. Round-tripping through JSON produces a
    // guaranteed plain object that can always be cloned.
    const plain = JSON.parse(JSON.stringify(character)) as Character
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(plain)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    })
  }

  /**
   * Load a single character by ID from IndexedDB.
   * Returns null if no character with that ID is found.
   *
   * @param id - The character's unique ID.
   */
  async load(id: string): Promise<Character | null> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).get(id)
      request.onsuccess = () => {
        db.close()
        const raw = request.result
        if (!raw) { resolve(null); return }
        resolve(CharacterStorage.migrate(raw) as Character)
      }
      request.onerror = () => { db.close(); reject(request.error) }
    })
  }

  /**
   * Migrate a raw IndexedDB record to the current Character schema.
   * Handles the old format (baseProperties + derivedProperties) transparently.
   */
  private static migrate(raw: any): Character {
    if (raw.baseProperties && !raw.properties) {
      const bp = raw.baseProperties ?? {}
      const dp = raw.derivedProperties ?? {}
      raw = {
        ...raw,
        properties: {
          St: bp.St ?? 0, Gs: bp.Gs ?? 0, Gw: bp.Gw ?? 0,
          Ko: bp.Ko ?? 0, In: bp.In ?? 0, Zt: bp.Zt ?? 0,
          pA: dp.pA ?? 0, Wk: dp.Wk ?? 0, Au: dp.Au ?? 0,
          LP: dp.LP ?? 0, AP: dp.AP ?? 0, B: dp.B ?? 0,
        },
        boni: {
          AusB:  dp.AusB  ?? 0,
          SchB:  dp.SchB  ?? 0,
          AnB:   dp.AnB   ?? 0,
          AbB:   dp.AbB   ?? 0,
          ZauB:  dp.ZauB  ?? 0,
          ResBg: dp.ResBg ?? 0,
          ResBk: dp.ResBk ?? dp.ResB ?? 0,
        },
      }
      delete raw.baseProperties
      delete raw.derivedProperties
    }

    // Ensure innate skills Raufen, Trinken and Wahrnehmung are present.
    const innate = [
      { skillId: 'Raufen',       value: 8 },
      { skillId: 'Trinken',      value: 7 },
      { skillId: 'Wahrnehmung',  value: 6 },
    ]
    const knownIds = new Set((raw.skills ?? []).map((s: any) => s.skillId))
    for (const entry of innate) {
      if (!knownIds.has(entry.skillId)) {
        raw.skills = [...(raw.skills ?? []), entry]
      }
    }

    return raw
  }

  /**
   * List all characters saved in IndexedDB.
   * Returns only the ID and name of each character — enough for a list view.
   */
  async list(): Promise<Array<{ id: string; name: string }>> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).getAll()
      request.onsuccess = () => {
        db.close()
        resolve((request.result as Character[]).map(c => ({ id: c.id, name: c.name })))
      }
      request.onerror = () => { db.close(); reject(request.error) }
    })
  }

  /**
   * Open a file picker and parse the selected JSON file into a Character object.
   * Does NOT save anything to IndexedDB — the caller decides what to do next.
   *
   * @throws Error if the API is not supported or the file cannot be parsed.
   * @throws AbortError if the user cancels the file picker.
   */
  async readFromFile(): Promise<Character> {
    if (!('showOpenFilePicker' in window)) {
      throw new Error(
        'File System Access API is not supported in this browser. ' +
        'Please use Chrome, Edge, or Opera.',
      )
    }

    const [fileHandle] = await (window as any).showOpenFilePicker({
      types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    })

    const file = await fileHandle.getFile()
    const text = await file.text()
    return JSON.parse(text) as Character
  }

  /**
   * Export a character to a JSON file using the File System Access API.
   *
   * Opens a save dialog pre-filled with the character's name as the filename.
   * Writes the character as formatted JSON (2-space indent).
   *
   * Requires a Chromium-based browser. Silently does nothing if the user
   * cancels the dialog (AbortError is not re-thrown).
   *
   * @param character - The character to export.
   * @throws Error if the File System Access API is not available.
   */
  async exportToFile(character: Character): Promise<void> {
    if (!('showSaveFilePicker' in window)) {
      throw new Error(
        'File System Access API is not supported in this browser. ' +
        'Please use Chrome, Edge, or Opera.',
      )
    }

    let fileHandle: FileSystemFileHandle
    try {
      fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: `${character.name}.json`,
        types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }],
      })
    } catch (e) {
      // User cancelled the dialog — nothing to do.
      if (e instanceof Error && e.name === 'AbortError') return
      throw e
    }

    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(character, null, 2))
    await writable.close()
  }

  /**
   * Import a character from a JSON file using the File System Access API.
   *
   * Opens a file picker dialog, reads the selected .json file, saves the parsed
   * character to IndexedDB, and returns it.
   *
   * Requires Chrome, Edge, or Opera. Throws an AbortError if the user cancels
   * the picker, and a plain Error if the API is not supported.
   *
   * @throws Error if the File System Access API is not available.
   * @throws AbortError if the user cancels the file picker.
   */
  async importFromFile(): Promise<Character> {
    if (!('showOpenFilePicker' in window)) {
      throw new Error(
        'File System Access API is not supported in this browser. ' +
        'Please use Chrome, Edge, or Opera.',
      )
    }

    const [fileHandle] = await (window as any).showOpenFilePicker({
      types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    })

    const file = await fileHandle.getFile()
    const text = await file.text()
    const character = JSON.parse(text) as Character
    await this.save(character)
    return character
  }
}

/** Shared singleton — use this throughout the app. */
export const characterStorage = new CharacterStorage()
