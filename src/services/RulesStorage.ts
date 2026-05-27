import type { RulebookData, RulesData } from '../types/Rules'
import type { CharacterType } from '../types/CharacterType'

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
 * A single downloadable asset from a GitHub release.
 */
export interface AssetLink {
  name: string
  downloadUrl: string
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
   * Fetch the list of JSON assets from a GitHub release without downloading them.
   * Returns name + direct download URL for each .json asset.
   *
   * @param repo - GitHub repo in "owner/name" format.
   * @param ref  - 'latest' or a specific release tag.
   */
  async fetchReleaseAssetLinks(repo: string, ref: string): Promise<AssetLink[]> {
    const apiUrl = ref === 'latest'
      ? `https://api.github.com/repos/${repo}/releases/latest`
      : `https://api.github.com/repos/${repo}/releases/tags/${ref}`

    const res = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github+json' },
    })

    if (!res.ok) {
      throw new Error(`GitHub API-Fehler ${res.status}: ${res.statusText}`)
    }

    const release = await res.json() as {
      assets: Array<{ name: string; browser_download_url: string }>
    }

    return release.assets
      .filter(a => a.name.endsWith('.json'))
      .map(a => ({ name: a.name, downloadUrl: a.browser_download_url }))
  }

  /**
   * Fetch all JSON rule assets from a GitHub release and save them to IndexedDB.
   *
   * Uses the GitHub Releases API to discover available assets automatically —
   * no hardcoded file list needed.
   *
   * @param repo - GitHub repo in "owner/name" format.
   * @param ref  - 'latest' or a specific release tag (e.g. 'release-2026-05-26').
   * @returns Summaries of all successfully imported sources.
   * @throws If the release cannot be fetched or contains no JSON assets.
   */
  async fetchFromGithubRelease(repo: string, ref: string): Promise<SourceSummary[]> {
    const apiUrl = ref === 'latest'
      ? `https://api.github.com/repos/${repo}/releases/latest`
      : `https://api.github.com/repos/${repo}/releases/tags/${ref}`

    const releaseRes = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github+json' },
    })

    if (!releaseRes.ok) {
      throw new Error(
        `GitHub API-Fehler ${releaseRes.status}: ${releaseRes.statusText}`
      )
    }

    const release = await releaseRes.json() as { assets: Array<{ name: string; url: string }> }
    const jsonAssets = release.assets.filter(a => a.name.endsWith('.json'))

    if (jsonAssets.length === 0) {
      throw new Error('Dieses Release enthält keine JSON-Assets.')
    }

    const imported: SourceSummary[] = []

    for (const asset of jsonAssets) {
      // Über die API-URL herunterladen (CORS-kompatibel, im Gegensatz zu browser_download_url).
      const dataRes = await fetch(asset.url, {
        headers: {
          Accept: 'application/octet-stream',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })

      if (!dataRes.ok) {
        throw new Error(`Fehler beim Laden von "${asset.name}": ${dataRes.statusText}`)
      }

      const data = await dataRes.json() as RulebookData

      if (!data.metadata?.id || !data.metadata?.title) {
        throw new Error(
          `"${asset.name}" ist keine gültige Regelwerk-Datei — metadata.id oder metadata.title fehlt.`
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
   * Merge CharacterType entries from all enabled sources.
   *
   * Priority:
   *   1. Core sources (metadata.isCore === true) win on scalar conflicts.
   *   2. Non-core: first loaded value wins.
   *   3. Meta-types (isMeta: true) are applied last with the lowest priority,
   *      then removed from the result.
   *
   * Record fields (groupCosts, spellCosts, fightCosts) and propertyBonuses
   * are merged key-by-key — new keys are added, existing values are never
   * overwritten. Conflicts are logged via console.warn.
   */
  private mergeTypes(entries: StoredSource[]): CharacterType[] {
    // Core sources first — stable sort preserves original order within each tier
    const sorted = [...entries].sort((a, b) =>
      (a.data.metadata.isCore ? 0 : 1) - (b.data.metadata.isCore ? 0 : 1)
    )

    const merged    = new Map<string, CharacterType>()
    const metaTypes: CharacterType[] = []

    for (const entry of sorted) {
      for (const type of (entry.data.types ?? [])) {
        if (type.isMeta) { metaTypes.push(type); continue }

        if (!merged.has(type.id)) {
          merged.set(type.id, {
            ...type,
            groupCosts:      type.groupCosts      ? { ...type.groupCosts }      : undefined,
            spellCosts:      type.spellCosts      ? { ...type.spellCosts }      : undefined,
            fightCosts:      type.fightCosts      ? { ...type.fightCosts }      : undefined,
            propertyBonuses: type.propertyBonuses ? [...type.propertyBonuses]   : undefined,
          })
        } else {
          this.mergeTypeInto(merged.get(type.id)!, type, entry.data.metadata.id)
        }
      }
    }

    // Apply meta-types to all types sharing the same category (lowest priority)
    for (const meta of metaTypes) {
      for (const target of merged.values()) {
        if (target.category === meta.category) {
          this.mergeTypeInto(target, meta, `meta:${meta.id}`, true)
        }
      }
    }

    // Post-merge pass: mark types without groupCosts as non-playable (isMeta).
    // A type needs at least one groupCosts entry to be usable for character advancement.
    for (const type of merged.values()) {
      if (!type.isMeta && (!type.groupCosts || Object.keys(type.groupCosts).length === 0)) {
        type.isMeta = true
        console.warn(
          `[RulesLoader] Typ "${type.id}" hat kein groupCosts — wird als nicht spielbar markiert (isMeta).`
        )
      }
    }

    return Array.from(merged.values())
  }

  /**
   * Merge fields from `source` into `target` in-place.
   *
   * @param target     - The type being accumulated.
   * @param source     - Incoming type data.
   * @param sourceName - Used in conflict warnings.
   * @param metaOnly   - When true, skip conflict warnings (meta-types have lowest priority).
   */
  private mergeTypeInto(
    target:     CharacterType,
    source:     CharacterType,
    sourceName: string,
    metaOnly = false,
  ): void {
    // Scalar fields — warn on conflict, keep existing value
    for (const key of ['name', 'category'] as const) {
      if (source[key] && target[key] !== source[key] && !metaOnly) {
        console.warn(
          `[RulesLoader] Typ "${target.id}".${key}: Kollision ` +
          `("${target[key]}" vs. "${source[key]}" aus "${sourceName}") — ` +
          `vorhandener Wert wird beibehalten.`
        )
      }
    }

    // Record fields — add new keys, keep existing values, warn on value conflict
    for (const key of ['groupCosts', 'spellCosts', 'fightCosts'] as const) {
      if (!source[key]) continue
      if (!target[key]) {
        (target as unknown as Record<string, unknown>)[key] = { ...source[key] }
      } else {
        for (const [k, v] of Object.entries(source[key]!) as [string, number][]) {
          if (!(k in target[key]!)) {
            (target[key] as Record<string, number>)[k] = v
          } else if ((target[key] as Record<string, number>)[k] !== v && !metaOnly) {
            console.warn(
              `[RulesLoader] Typ "${target.id}".${key}["${k}"]: Kollision ` +
              `(${(target[key] as Record<string, number>)[k]} vs. ${v} aus "${sourceName}") — ` +
              `vorhandener Wert wird beibehalten.`
            )
          }
        }
      }
    }

    // propertyBonuses — merge by id
    if (source.propertyBonuses) {
      if (!target.propertyBonuses) {
        target.propertyBonuses = [...source.propertyBonuses]
      } else {
        const known = new Set(target.propertyBonuses.map((b: { id: string; value: number }) => b.id))
        for (const bonus of source.propertyBonuses) {
          if (!known.has(bonus.id)) {
            target.propertyBonuses.push({ ...bonus })
          } else if (!metaOnly) {
            const existing = target.propertyBonuses.find((b: { id: string; value: number }) => b.id === bonus.id)!
            if (existing.value !== bonus.value) {
              console.warn(
                `[RulesLoader] Typ "${target.id}".propertyBonuses["${bonus.id}"]: Kollision ` +
                `(${existing.value} vs. ${bonus.value} aus "${sourceName}") — ` +
                `vorhandener Wert wird beibehalten.`
              )
            }
          }
        }
      }
    }
  }

  /**
   * Load and merge all enabled sources into a single RulesData object.
   * Returns empty arrays for all fields if no sources are enabled.
   *
   * Types are merged by ID across sources — see mergeTypes() for details.
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

    const active = entries.filter(e => e.enabled)

    const rules: RulesData = {
      skills:            [],
      types:             this.mergeTypes(active),
      races:             [],
      origins:           [],
      socialStatuses:    [],
      spells:            [],
      spellDescriptions: [],
    }

    for (const entry of active) {
      const src = entry.data
      if (src.skills)            rules.skills.push(...src.skills)
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
