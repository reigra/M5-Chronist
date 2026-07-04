/**
 * BackupService — exports all characters, rulebook sources and metadata
 * as a ZIP archive for download.
 *
 * ZIP structure:
 *   metadata.json                         ← BackupMetadata (exportedAt, appVersion, files[])
 *   rules/<id>.json                       ← one RulebookData per source
 *   characters/<name>_<id>.json           ← one Character per entry (id prevents name collisions)
 *
 * All files use the same JSON format as the respective single-file export.
 */
import JSZip from 'jszip'
import type { Character } from '../types/Character'
import { characterStorage } from './CharacterStorage'
import { rulesStorage } from './RulesStorage'
import { saveFileAs, sanitizeFileName, formatDate } from './FileProvider'

/**
 * Metadata saved alongside the actual data files.
 * Enables unambiguous restore: every file in the archive is listed here
 * with its type, original id and display name.
 */
export interface BackupFileEntry {
  fileName: string
  type: 'character' | 'rules'
  id: string
  name: string
}

export interface BackupMetadata {
  exportedAt: string
  appVersion: string
  files: BackupFileEntry[]
}

/**
 * Create a full backup ZIP and trigger a download.
 *
 * Collects all characters and all rule sources from IndexedDB,
 * serialises them as JSON, bundles everything into a ZIP archive
 * and starts a download via saveFileAs().
 *
 * @returns true if the file was saved, false if the user cancelled.
 * @throws Error if IndexedDB access fails.
 */
export async function createBackup(): Promise<boolean> {
  const [sources, charSummaries] = await Promise.all([
    rulesStorage.getAllSources(),
    characterStorage.list(),
  ])

  const characters: Character[] = []
  for (const s of charSummaries) {
    const char = await characterStorage.load(s.id)
    if (char) characters.push(char)
  }

  const files: BackupFileEntry[] = []
  const zip = new JSZip()

  // ── Characters ────────────────────────────────────────────────────────────────
  for (const char of characters) {
    const fileName = `${sanitizeFileName(char.name)}_${char.id}.json`
    zip.file(`characters/${fileName}`, JSON.stringify(char, null, 2))
    files.push({ fileName, type: 'character', id: char.id, name: char.name })
  }

  // ── Rule sources ──────────────────────────────────────────────────────────────
  for (const source of sources) {
    const fileName = `${source.id}.json`
    zip.file(`rules/${fileName}`, JSON.stringify(source.data, null, 2))
    files.push({ fileName, type: 'rules', id: source.id, name: source.title })
  }

  // ── Metadata ──────────────────────────────────────────────────────────────────
  const metadata: BackupMetadata = {
    exportedAt: new Date().toISOString(),
    appVersion: __APP_VERSION__,
    files,
  }
  zip.file('metadata.json', JSON.stringify(metadata, null, 2))

  // ── Generate and download ─────────────────────────────────────────────────────
  const blob = await zip.generateAsync({ type: 'blob' })
  const backupName = `MagusNG-Backup_${formatDate()}.zip`
  try {
    await saveFileAs(blob, backupName, 'application/zip')
    return true
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return false
    throw e
  }
}
