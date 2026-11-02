import type { Character } from '../types/Character'
import { migrate } from './CharacterService'
import { GoogleDriveProvider, formatDate, sanitizeFileName, saveFileAs } from './FileProvider'

const DB_NAME = 'M5-Chronist'
const DB_VERSION = 1
const STORE = 'characters'

/**
 * CharacterStorage — saves and loads characters using IndexedDB.
 *
 * All public methods open the database on demand and close it when done.
 * Characters are identified by their `id` field (used as the object store key).
 */
// TODO: not imported by name — only `characterStorage` singleton is used externally
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
        resolve(migrate(raw) as Character)
      }
      request.onerror = () => { db.close(); reject(request.error) }
    })
  }

  /**
   * List all characters saved in IndexedDB.
   * Returns ID, name and typeId of each character — enough for list views.
   */
  async list(): Promise<Array<{ id: string; name: string; typeId: string }>> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).getAll()
      request.onsuccess = () => {
        db.close()
        resolve((request.result as Character[]).map(c => ({ id: c.id, name: c.name, typeId: c.typeId })))
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
    return migrate(JSON.parse(text)) as Character
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
    const content = JSON.stringify(character, null, 2)
    const fileName = `${sanitizeFileName(character.name)}.json`
    await saveFileAs(content, fileName, 'application/json')
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
    const character = migrate(JSON.parse(text)) as Character
    await this.save(character)
    return character
  }
  /**
   * Read a character from Google Drive without saving to IndexedDB.
   *
   * Opens the Google Picker dialog, reads and parses the selected .json file,
   * and runs migration. Does NOT save — the caller decides what to do next.
   *
   * @throws Error if Google Drive access fails or the file is invalid.
   */
  async readFromDrive(): Promise<Character> {
    const provider = new GoogleDriveProvider('characters')
    const { data } = await provider.readFile()
    return migrate(data) as Character
  }

  /**
   * Import a character from Google Drive.
   *
   * Opens the Google Picker dialog, lets the user select a .json file,
   * parses and migrates it, saves to IndexedDB, and returns the Character.
   *
   * @throws Error if Google Drive access fails or the file is invalid.
   */
  async importFromDrive(): Promise<Character> {
    const char = await this.readFromDrive()
    await this.save(char)
    return char
  }

  /**
   * Export a character to Google Drive.
   *
   * Opens the OAuth flow, then uploads the character JSON to the user's Drive.
   *
   * @param character - The character to export.
   */
  async exportToDrive(character: Character): Promise<void> {
    const provider = new GoogleDriveProvider('characters')
    const name = `${sanitizeFileName(character.name)}_${formatDate()}.json`
    await provider.writeFile(character, name)
  }

  /**
   * Permanently remove a character from IndexedDB.
   *
   * @param id - The character's unique ID.
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
}

/** Shared singleton — use this throughout the app. */
export const characterStorage = new CharacterStorage()
