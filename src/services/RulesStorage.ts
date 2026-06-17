import type { RulebookData, RulesData } from '../types/Rules'
import type { CharacterType } from '../types/CharacterType'
import { GoogleDriveProvider, formatDate, sanitizeFileName } from './FileProvider'

const DB_NAME = 'MagusNG-Rules'
const DB_VERSION = 1
const STORE = 'sources'

const SPELL_GROUPS = [
  'Beherrschen', 'Bewegen', 'Dweomer', 'Erkennen', 'Erschaffen',
  'Formen', 'Verändern', 'Wundertaten', 'Zauberlieder', 'Zerstören',
] as const

/**
 * One source entry as stored in IndexedDB.
 * Contains the full rulebook data plus display metadata and an enabled flag.
 */
export interface StoredSource {
  id: string
  title: string
  version: string
  /** Numerische Priorität (aus metadata.priority übernommen). */
  priority: number
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
  /** Numerische Priorität dieser Quelle. */
  priority: number
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

      // Sprachen und Schriften normalisieren: id = name, falls nicht vorhanden
      this.normalizeIds(data)

      const entry: StoredSource = {
        id:        data.metadata.id,
        title:     data.metadata.title,
        version:   data.metadata.version ?? '?',
        priority:  await this.nextFreePriority(data.metadata.priority ?? 999),
        enabled:   true,
        data,
      }

      const db = await this.open()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(entry)
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror    = () => { db.close(); reject(tx.error) }
      })

      imported.push({ id: entry.id, title: entry.title, version: entry.version, priority: entry.priority, enabled: true })
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
            id:        s.id,
            title:     s.title,
            version:   s.version,
            priority:  s.priority ?? 999,
            enabled:   s.enabled,
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
   * Update the priority of a stored source.
   * Also cleans up the legacy `houseRule` field if present.
   *
   * @param id       - The source ID to update.
   * @param priority - The new priority value.
   */
  async updatePriority(id: string, priority: number): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx      = db.transaction(STORE, 'readwrite')
      const store   = tx.objectStore(STORE)
      const getReq  = store.get(id)

      getReq.onsuccess = () => {
        const entry = getReq.result as StoredSource | undefined
        if (!entry) { db.close(); resolve(); return }
        entry.priority = priority
        delete (entry as any).houseRule
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
   * Merge CharacterType entries from all enabled sources.
   *
   * Priority: Hausregeln → Core-Quellen → Rest (via priorityOf()).
   * Meta-types (isMeta: true) are applied last with the lowest priority,
   * then removed from the result.
   *
   * Record fields (groupCosts, spellCosts, fightCosts) and propertyBonuses
   * are merged key-by-key — new keys are added, existing values are never
   * overwritten. Conflicts are logged via console.warn.
   */
  private mergeTypes(entries: StoredSource[]): CharacterType[] {
    const sorted = [...entries].sort((a, b) => this.priorityOf(a) - this.priorityOf(b))

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

    // Post-merge pass: mark types without groupCosts as non-playable (isMeta) —
    // but only if no rule source provides costPatterns (Mogadil system).
    // In the Mogadil system, costPatterns[costPatternId][typeColumn] replaces groupCosts.
    const hasCostPatterns = entries.some(e => e.data.costPatterns?.length)
    for (const type of merged.values()) {
      if (!type.isMeta && !hasCostPatterns &&
          (!type.groupCosts || Object.keys(type.groupCosts).length === 0)) {
        type.isMeta = true
        console.warn(
          `[RulesLoader] Typ "${type.id}" hat kein groupCosts — wird als nicht spielbar markiert (isMeta).`
        )
      }
    }

    // Derive spellCosts from groupCosts for types that have spell groups but
    // no explicit spellCosts field. This keeps the JSON type definitions clean
    // while still providing the SpellsView with the cost data it needs.
    for (const type of merged.values()) {
      if (type.spellCosts || !type.groupCosts) continue
      const sc: Record<string, number> = {}
      for (const [group, cost] of Object.entries(type.groupCosts)) {
        if ((SPELL_GROUPS as readonly string[]).includes(group) && cost > 0) {
          sc[group] = cost
        }
      }
      if (Object.keys(sc).length > 0) {
        type.spellCosts = sc
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
    // Scalar fields — fill undefined/null from source, warn on real conflict
    for (const key of ['name', 'category'] as const) {
      if (source[key] === undefined) continue
      if (target[key] === undefined || target[key] === null) {
        if (key === 'name') target.name = source.name!
        else target.category = source.category!
      } else if (target[key] !== source[key] && !metaOnly) {
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
   * Ordnungszahl für die Lade-Reihenfolge.
   * Niedriger Wert = höhere Priorität (zuerst geladen = gewinnt bei Konflikten).
   * Fallback für alte Einträge ohne priority-Feld.
   */
  private priorityOf(entry: StoredSource): number {
    if (entry.priority !== undefined) return entry.priority
    // Rückwärtskompatibilität für vor priority importierte Einträge
    if ((entry as any).houseRule)                return 0
    if ((entry.data.metadata as any).isCore)     return 1
    return 999
  }

  /**
   * Find the next unused priority value >= the requested value.
   * Ensures all stored sources have distinct priorities so that swapping works.
   */
  private async nextFreePriority(wanted: number): Promise<number> {
    const all = await this.list()
    const used = new Set(all.map(s => s.priority))
    while (used.has(wanted)) wanted++
    return wanted
  }

  /**
   * Ergänzt fehlende id-Felder für Language- und Script-Einträge.
   * Verwendet den Namen als id-Fallback (Rückwärtskompatibilität).
   */
  private normalizeIds(data: RulebookData): void {
    data.languages?.forEach(l => { if (!l.id) l.id = l.name })
    data.scripts?.forEach(s =>   { if (!s.id) s.id = s.name })
  }

  /**
   * Fügt Elemente aus sources in target ein (ID-basiertes First-Wins-Merge).
   *
   * - Unbekannte ID → vollständig übernehmen.
   * - Bekannte ID → nur fehlende Felder (undefined) aus source auffüllen.
   *
   * Da target bereits nach Priorität sortiert befüllt wird, gewinnt immer
   * die höchstpriore Quelle (z.B. Hausregel) auf Feldebene.
   *
   * @param target  - Ziel-Array (wird in-place befüllt).
   * @param sources - Quell-Einträge dieser Quelle.
   */
  private mergeById<T extends { id?: string }>(target: T[], sources: T[]): void {
    const seen = new Map<string, T>()
    for (const e of target) { if (e.id) seen.set(e.id, e) }
    for (const item of sources) {
      if (!item.id) continue
      if (!seen.has(item.id)) {
        const copy = { ...item }
        target.push(copy)
        seen.set(item.id, copy)
      } else {
        const existing = seen.get(item.id)!
        for (const key of Object.keys(item) as (keyof T)[]) {
          if (existing[key] === undefined) {
            existing[key] = item[key]
          }
        }
      }
    }
  }

  /**
   * Load and merge all enabled sources into a single RulesData object.
   * Returns empty arrays for all fields if no sources are enabled.
   *
   * Sortierung: Hausregeln zuerst, dann Core, dann Rest.
   * Merge-Strategie: ID-basiertes First-Wins (via mergeById) —
   * höchstpriore Quelle gewinnt auf Feldebene.
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

    // Sortierung: Hausregeln → Core → Rest (stabile Reihenfolge innerhalb jeder Stufe)
    const active = entries
      .filter(e => e.enabled)
      .sort((a, b) => this.priorityOf(a) - this.priorityOf(b))

    // Rückwärtskompatibilität: id-Felder für Language/Script ergänzen
    for (const entry of active) this.normalizeIds(entry.data)

    const rules: RulesData = {
      skills:            [],
      types:             this.mergeTypes(active),
      races:             [],
      origins:           [],
      socialStatuses:    [],
      languages:         [],
      scripts:           [],
      spells:            [],
      spellDescriptions: [],
      equipment:         [],
    }

    for (const entry of active) {
      const src = entry.data
      if (src.skills)            this.mergeById(rules.skills,            src.skills)
      if (src.races)             this.mergeById(rules.races,             src.races)
      if (src.origins)           this.mergeById(rules.origins,           src.origins)
      if (src.socialStatuses)    this.mergeById(rules.socialStatuses,    src.socialStatuses)
      if (src.languages)         this.mergeById(rules.languages,         src.languages)
      if (src.scripts)           this.mergeById(rules.scripts,           src.scripts)
      if (src.spells)            this.mergeById(rules.spells,            src.spells)
      if (src.spellDescriptions) this.mergeById(rules.spellDescriptions, src.spellDescriptions)
      if (src.equipment)         this.mergeById(rules.equipment,         src.equipment)
    }

    // Merge skillRules: take the first (highest priority) skillRules found
    for (const entry of active) {
      if (entry.data.skillRules && !rules.skillRules) {
        rules.skillRules = entry.data.skillRules
      }
    }

    // Merge costColumns and costPatterns: first (highest priority) source wins
    for (const entry of active) {
      if (entry.data.costColumns && !rules.costColumns) {
        rules.costColumns = entry.data.costColumns
      }
      if (entry.data.costPatterns && !rules.costPatterns) {
        rules.costPatterns = entry.data.costPatterns
      }
    }

    return rules
  }
  /**
   * Import a rules file from Google Drive.
   *
   * Opens the Google Picker dialog, lets the user select a .json rules file,
   * validates it (must have metadata.id and metadata.title), and stores it
   * in IndexedDB.
   *
   * @returns Summary of the imported source.
   * @throws Error if the file is not a valid rules file.
   */
  async importFromDrive(): Promise<SourceSummary> {
    const provider = new GoogleDriveProvider('rules')
    const { data, fileName } = await provider.readFile()
    const rulebook = data as RulebookData

    if (!rulebook.metadata?.id || !rulebook.metadata?.title) {
      throw new Error(
        `"${fileName}" is not a valid rules file — missing metadata.id or metadata.title.`
      )
    }

    this.normalizeIds(rulebook)

    const entry: StoredSource = {
      id:        rulebook.metadata.id,
      title:     rulebook.metadata.title,
      version:   rulebook.metadata.version ?? '?',
      priority:  await this.nextFreePriority(rulebook.metadata.priority ?? 999),
      enabled:   true,
      data:      rulebook,
    }

    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(entry)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror    = () => { db.close(); reject(tx.error) }
    })

    return { id: entry.id, title: entry.title, version: entry.version, priority: entry.priority, enabled: true }
  }

  /**
   * Export a rules source to Google Drive.
   *
   * Loads the source from IndexedDB and uploads it as JSON to the user's Drive.
   *
   * @param sourceId - The ID of the source to export.
   * @throws Error if the source is not found.
   */
  async exportToDrive(sourceId: string): Promise<void> {
    const db = await this.open()
    const entry = await new Promise<StoredSource | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(sourceId)
      req.onsuccess = () => { db.close(); resolve(req.result) }
      req.onerror   = () => { db.close(); reject(req.error) }
    })

    if (!entry) throw new Error(`Source "${sourceId}" not found.`)

    const provider = new GoogleDriveProvider('rules')
    const version = sanitizeFileName(entry.version)
    const name = `${entry.id}_${version}_${formatDate()}.json`
    await provider.writeFile(entry.data, name)
  }
}

export const rulesStorage = new RulesStorage()
