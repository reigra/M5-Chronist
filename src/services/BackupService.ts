/**
 * BackupService — exports all characters, rulebook sources and metadata
 * as a ZIP archive for download, and restores from such archives.
 *
 * ZIP structure:
 *   metadata.json                         ← BackupMetadata (exportedAt, appVersion, sources[])
 *   rules/<id>.json                       ← one RulebookData per source
 *   characters/<name>_<id>.json           ← one Character per entry (id prevents name collisions)
 *
 * All files use the same JSON format as the respective single-file export.
 */
import JSZip from 'jszip'
import type { Character } from '../types/Character'
import type { RulebookData } from '../types/Rules'
import { characterStorage } from './CharacterStorage'
import { rulesStorage } from './RulesStorage'
import { GoogleDriveProvider, saveFileAs, sanitizeFileName, formatDate } from './FileProvider'

export interface BackupMetadata {
  exportedAt: string
  appVersion: string
  /** Snapshot of all rule sources at backup time — includes priority and enabled state. */
  sources: Array<{
    id: string
    title: string
    version: string
    /** User-defined priority that determines sort order (lower = higher priority). */
    priority: number
    enabled: boolean
  }>
}

/**
 * One character conflict found during restore.
 */
export interface RestoreConflict {
  incoming: Character
  existing: Character
}

/**
 * Result of parsing a backup ZIP — everything needed before
 * presenting the conflict dialog and executing the restore.
 */
export interface RestoreInfo {
  rules: RulebookData[]
  metadata: BackupMetadata | null
  newCharacters: Character[]
  conflicts: RestoreConflict[]
}

/**
 * Build the backup ZIP in memory: loads all characters and rules from
 * IndexedDB, serialises them as JSON, adds metadata.json, and returns
 * the generated Blob together with the suggested file name.
 */
async function buildBackupZip(): Promise<{ blob: Blob; backupName: string }> {
  const [sources, charSummaries] = await Promise.all([
    rulesStorage.getAllSources(),
    characterStorage.list(),
  ])

  const characters: Character[] = []
  for (const s of charSummaries) {
    const char = await characterStorage.load(s.id)
    if (char) characters.push(char)
  }

  const zip = new JSZip()

  // ── Characters ────────────────────────────────────────────────────────────────
  for (const char of characters) {
    const fileName = `${sanitizeFileName(char.name)}_${char.id}.json`
    zip.file(`characters/${fileName}`, JSON.stringify(char, null, 2))
  }

  // ── Rule sources ──────────────────────────────────────────────────────────────
  for (const source of sources) {
    const fileName = `${source.id}.json`
    zip.file(`rules/${fileName}`, JSON.stringify(source.data, null, 2))
  }

  // ── Metadata ──────────────────────────────────────────────────────────────────
  const metadata: BackupMetadata = {
    exportedAt: new Date().toISOString(),
    appVersion: __APP_VERSION__,
    sources: sources.map(s => ({
      id: s.id,
      title: s.title,
      version: s.version,
      priority: s.priority,
      enabled: s.enabled,
    })),
  }
  zip.file('metadata.json', JSON.stringify(metadata, null, 2))

  // ── Generate ──────────────────────────────────────────────────────────────────
  const blob = await zip.generateAsync({ type: 'blob' })
  const backupName = `M5-Chronist_V${__APP_VERSION__}_backup_${formatDate()}.zip`
  return { blob, backupName }
}

/**
 * Create a full backup ZIP and trigger a local download.
 *
 * Collects all characters and all rule sources from IndexedDB,
 * serialises them as JSON, bundles everything into a ZIP archive
 * and starts a download via saveFileAs().
 *
 * @returns true if the file was saved, false if the user cancelled.
 * @throws Error if IndexedDB access fails.
 */
export async function createBackup(): Promise<boolean> {
  const { blob, backupName } = await buildBackupZip()
  try {
    await saveFileAs(blob, backupName, 'application/zip')
    return true
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return false
    throw e
  }
}

/**
 * Upload a backup ZIP to Google Drive.
 *
 * Builds the same ZIP archive as createBackup() and uploads it directly
 * to the M5-Chronist/ folder in the user's Google Drive.
 *
 * @throws Error if Google Drive access fails or credentials are missing.
 */
export async function uploadBackupToDrive(): Promise<void> {
  const { blob, backupName } = await buildBackupZip()
  const provider = new GoogleDriveProvider('backup')
  await provider.writeBlob(blob, backupName)
}

// ── Restore ─────────────────────────────────────────────────────────────────────

/**
 * Parse a backup ZIP blob and return the extracted data.
 * Does NOT write anything to IndexedDB — the caller decides
 * how to handle conflicts.
 */
async function parseBackupZip(data: Blob): Promise<RestoreInfo> {
  const zip   = await JSZip.loadAsync(data)
  const rules: RulebookData[] = []
  const chars: Character[]    = []
  let metadata: BackupMetadata | null = null

  const tasks: Promise<void>[] = []

  zip.forEach((path, file) => {
    if (file.dir) return

    if (path.startsWith('rules/') && path.endsWith('.json')) {
      tasks.push(
        file.async('string').then(text => { rules.push(JSON.parse(text)) }),
      )
    } else if (path.startsWith('characters/') && path.endsWith('.json')) {
      tasks.push(
        file.async('string').then(text => { chars.push(JSON.parse(text)) }),
      )
    } else if (path === 'metadata.json') {
      tasks.push(
        file.async('string').then(text => { metadata = JSON.parse(text) }),
      )
    }
  })

  await Promise.all(tasks)

  // Sort rules by filename so repeated restores are deterministic
  rules.sort((a, b) => (a.metadata.id ?? '').localeCompare(b.metadata.id ?? ''))

  // Check which characters already exist
  const newCharacters: Character[] = []
  const conflicts: RestoreConflict[] = []

  for (const char of chars) {
    const existing = await characterStorage.load(char.id)
    if (existing) {
      conflicts.push({ incoming: char, existing })
    } else {
      newCharacters.push(char)
    }
  }

  return { rules, metadata, newCharacters, conflicts }
}

/**
 * Open a local file picker for .zip, parse the backup archive and return
 * the parsed data. Does NOT write to IndexedDB.
 */
export async function restoreFromBackup(): Promise<RestoreInfo> {
  if (!('showOpenFilePicker' in window)) {
    throw new Error('File System Access API is not supported in this browser.')
  }

  const [handle] = await (window as any).showOpenFilePicker({
    types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
    multiple: false,
  })
  const file   = await handle.getFile()
  return parseBackupZip(file)
}

/**
 * Open a Google Drive picker for the M5-Chronist/ folder, read the selected
 * file as a Blob, parse the backup archive and return the parsed data.
 * Does NOT write to IndexedDB.
 */
export async function restoreFromDrive(): Promise<RestoreInfo> {
  const provider = new GoogleDriveProvider('backup')
  const { blob } = await provider.readBlob()
  return parseBackupZip(blob)
}

/**
 * Execute a restore: write all rules, apply metadata, then save characters
 * according to the chosen resolution strategy.
 *
 * @param info       - Parsed backup data from restoreFromBackup() / restoreFromDrive().
 * @param resolution - 'all' = overwrite all conflicting characters;
 *                     Map<charId, boolean> = per-character resolution (true = overwrite).
 */
export async function executeRestore(
  info: RestoreInfo,
  resolution: 'all' | Map<string, boolean>,
): Promise<void> {
  // Deep-clone everything — Vue reactive proxies wrapped by ref() cannot
  // be serialized by IndexedDB's structured clone algorithm.
  const plainRules   = info.rules.map(r => JSON.parse(JSON.stringify(r)))
  const plainNew     = info.newCharacters.map(c => JSON.parse(JSON.stringify(c)))
  const plainConflicts = info.conflicts.map(c => ({
    incoming: JSON.parse(JSON.stringify(c.incoming)),
    existing: JSON.parse(JSON.stringify(c.existing)),
  }))

  // 1. Import all rules (overwrites existing sources with the same id)
  for (const rule of plainRules) {
    await rulesStorage.importFromData(rule)
  }

  // 2. Apply metadata — restore priorities and enabled state
  if (info.metadata) {
    for (const src of info.metadata.sources) {
      await rulesStorage.updatePriority(src.id, src.priority)
      await rulesStorage.setEnabled(src.id, src.enabled)
    }
  }

  // 3. Save new characters (always imported)
  for (const char of plainNew) {
    await characterStorage.save(char)
  }

  // 4. Save conflicting characters according to resolution
  if (resolution === 'all') {
    for (const conflict of plainConflicts) {
      await characterStorage.save(conflict.incoming)
    }
  } else {
    for (const conflict of plainConflicts) {
      if (resolution.get(conflict.incoming.id)) {
        await characterStorage.save(conflict.incoming)
      }
    }
  }
}
