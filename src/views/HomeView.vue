<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { characterStorage } from '../services/CharacterStorage'
import { rulesStorage } from '../services/RulesStorage'
import { RulesLoader } from '../services/RulesLoader'
import {
  createBackup,
  uploadBackupToDrive,
  restoreFromBackup,
  restoreFromDrive,
  executeRestore,
} from '../services/BackupService'
import type { RestoreInfo } from '../services/BackupService'
import { computeDiff } from '../services/CharacterService'
import type { DiffEntry } from '../services/CharacterService'
import { UI } from '../constants/ui'
import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { SourceSummary } from '../services/RulesStorage'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Holds the parsed incoming character and the computed diff while awaiting confirmation. */
interface PendingImport {
  incoming: Character
  diff: DiffEntry[]
}

// ── State ─────────────────────────────────────────────────────────────────────

const router = useRouter()
const characters = ref<Array<{ id: string; name: string; typeId: string }>>([])
const loading = ref(true)
const errorMessage = ref<string | null>(null)
const backupError = ref<string | null>(null)
const backupDriveError = ref<string | null>(null)
const backupSuccess = ref(false)
const backingUp = ref(false)
const backingUpDrive = ref(false)
const pendingImport = ref<PendingImport | null>(null)

// ── Restore state ──
const restoreInfo = ref<RestoreInfo | null>(null)
const restorePhase = ref<'idle' | 'busy' | 'conflict' | 'ask'>('idle')
const restoreError = ref<string | null>(null)
const restoreSuccess = ref(false)
const askIndex = ref(0)
const askResolutions = ref<Map<string, boolean>>(new Map()) // charId → overwrite = true
const askCurrentDiff = ref<DiffEntry[] | null>(null)
const activeSources = ref<SourceSummary[]>([])
const rules = ref<RulesData | null>(null)

/**
 * True if a character's type is not fully supported by the loaded rules.
 * A type is unsupported when it is missing from the rules or has isMeta: true.
 */
function isUnsupported(char: { typeId: string }): boolean {
  const r = rules.value
  if (!r) return false
  const t = r.types.find(x => x.id === char.typeId)
  return !t || t.isMeta === true
}

/** True if the current browser supports the File System Access API. */
const browserSupported = 'showOpenFilePicker' in window

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Load the list of saved characters from IndexedDB and update the view.
 */
async function loadList(): Promise<void> {
  try {
    const [chars, allSources, loadedRules] = await Promise.all([
      characterStorage.list(),
      rulesStorage.list(),
      new RulesLoader().load(),
    ])
    characters.value = chars
    activeSources.value = allSources.filter(s => s.enabled).sort((a, b) => a.priority - b.priority)
    rules.value = loadedRules
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to load characters.'
  } finally {
    loading.value = false
  }
}

/**
 * Start the import flow:
 * 1. Open the file picker and parse the JSON.
 * 2. If the ID does not exist in IndexedDB, save directly and navigate.
 * 3. If the ID exists, compute the diff and show the confirmation panel.
 */
async function importCharacter(): Promise<void> {
  try {
    const incoming = await characterStorage.readFromFile()
    const existing = await characterStorage.load(incoming.id)

    if (!existing) {
      // New character — save and navigate immediately.
      await characterStorage.save(incoming)
      await loadList()
      await router.push({ name: 'character-sheet', params: { id: incoming.id } })
      return
    }

    // Existing character — compute diff and ask for confirmation.
    const diff = computeDiff(existing, incoming)
    pendingImport.value = { incoming, diff }
  } catch (e) {
    if (e instanceof Error && e.name !== 'AbortError') {
      errorMessage.value = e.message
    }
  }
}

/**
 * Import a character from Google Drive (with diff/overwrite flow).
 * Same as importCharacter() but reads via GoogleDriveProvider.
 */
async function importCharacterFromDrive(): Promise<void> {
  try {
    const incoming = await characterStorage.readFromDrive()
    const existing = await characterStorage.load(incoming.id)

    if (!existing) {
      await characterStorage.save(incoming)
      await loadList()
      await router.push({ name: 'character-sheet', params: { id: incoming.id } })
      return
    }

    const diff = computeDiff(existing, incoming)
    pendingImport.value = { incoming, diff }
  } catch (e) {
    if (e instanceof Error && e.name !== 'AbortError') {
      errorMessage.value = UI.driveErrorPrefix + ' ' + e.message
    }
  }
}

/** Confirm the overwrite: save and navigate. */
async function confirmImport(): Promise<void> {
  const p = pendingImport.value
  if (!p) return
  try {
    await characterStorage.save(p.incoming)
    pendingImport.value = null
    await loadList()
    await router.push({ name: 'character-sheet', params: { id: p.incoming.id } })
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to save.'
    pendingImport.value = null
  }
}

/**
 * Permanently delete a character from IndexedDB.
 */
async function deleteCharacter(id: string): Promise<void> {
  try {
    await characterStorage.remove(id)
    await loadList()
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to delete character.'
  }
}

/** Cancel the import — discard the parsed character. */
function cancelImport(): void {
  pendingImport.value = null
}

/** Start a full backup download (ZIP with all characters, rules and metadata). */
async function doBackup(): Promise<void> {
  backupError.value = null
  backupSuccess.value = false
  backingUp.value = true
  try {
    const saved = await createBackup()
    if (saved) {
      backupSuccess.value = true
      setTimeout(() => { backupSuccess.value = false }, 3000)
    }
  } catch (e) {
    backupError.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    backingUp.value = false
  }
}

/** Upload a backup ZIP to Google Drive. */
async function doBackupDrive(): Promise<void> {
  backupDriveError.value = null
  backingUpDrive.value = true
  try {
    await uploadBackupToDrive()
    backupSuccess.value = true
    setTimeout(() => { backupSuccess.value = false }, 3000)
  } catch (e) {
    backupDriveError.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    backingUpDrive.value = false
  }
}

// ── Restore ─────────────────────────────────────────────────────────────────

/** Open a local ZIP file and parse the backup. */
async function doRestore(): Promise<void> {
  restoreError.value = null
  restoreSuccess.value = false
  restoreInfo.value = null
  restorePhase.value = 'busy'
  try {
    const info = await restoreFromBackup()
    showRestoreConflicts(info)
  } catch (e) {
    if (e instanceof Error && e.name !== 'AbortError') {
      restoreError.value = e instanceof Error ? e.message : 'Unknown error'
    }
    restorePhase.value = 'idle'
  }
}

/** Open a Drive picker and parse the backup. */
async function doRestoreDrive(): Promise<void> {
  restoreError.value = null
  restoreSuccess.value = false
  restoreInfo.value = null
  restorePhase.value = 'busy'
  try {
    const info = await restoreFromDrive()
    showRestoreConflicts(info)
  } catch (e) {
    if (e instanceof Error && e.name !== 'AbortError') {
      restoreError.value = e instanceof Error ? e.message : 'Unknown error'
    }
    restorePhase.value = 'idle'
  }
}

/** After parsing: show conflict dialog or execute immediately. */
function showRestoreConflicts(info: RestoreInfo): void {
  if (info.conflicts.length === 0) {
    // No conflicts — import everything immediately
    restorePhase.value = 'busy'
    executeRestore(info, 'all')
      .then(() => {
        restoreSuccess.value = true
        restorePhase.value = 'idle'
        setTimeout(() => { restoreSuccess.value = false }, 4000)
        loadList()
      })
      .catch(e => {
        restoreError.value = e instanceof Error ? e.message : 'Unknown error'
        restorePhase.value = 'idle'
      })
  } else {
    restoreInfo.value = info
    restorePhase.value = 'conflict'
  }
}

/** User chose "Alle überschreiben" — import everything. */
async function confirmRestoreAll(): Promise<void> {
  const info = restoreInfo.value
  if (!info) return
  restorePhase.value = 'busy'
  restoreInfo.value = null
  try {
    await executeRestore(info, 'all')
    restoreSuccess.value = true
    setTimeout(() => { restoreSuccess.value = false }, 4000)
    loadList()
  } catch (e) {
    restoreError.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    restorePhase.value = 'idle'
  }
}

/** User chose "Einzeln fragen" — start sequential diff dialogs. */
function startAskMode(): void {
  askIndex.value = 0
  askResolutions.value = new Map()
  showNextAskConflict()
  restorePhase.value = 'ask'
}

/** Show the diff for the current conflict in ask mode. */
function showNextAskConflict(): void {
  const info = restoreInfo.value
  if (!info || askIndex.value >= info.conflicts.length) {
    // All resolved — execute
    finishAskMode()
    return
  }
  const conflict = info.conflicts[askIndex.value]
  askCurrentDiff.value = computeDiff(conflict.existing, conflict.incoming)
}

/** User chose "Überschreiben" for the current conflict. */
function resolveAskOverwrite(): void {
  const info = restoreInfo.value
  if (!info) return
  askResolutions.value.set(info.conflicts[askIndex.value].incoming.id, true)
  askIndex.value++
  showNextAskConflict()
}

/** User chose "Überspringen" for the current conflict. */
function resolveAskSkip(): void {
  const info = restoreInfo.value
  if (!info) return
  askResolutions.value.set(info.conflicts[askIndex.value].incoming.id, false)
  askIndex.value++
  showNextAskConflict()
}

/** All ask conflicts resolved — execute the restore. */
async function finishAskMode(): Promise<void> {
  const info = restoreInfo.value
  if (!info) return
  restorePhase.value = 'busy'
  restoreInfo.value = null
  try {
    await executeRestore(info, askResolutions.value)
    restoreSuccess.value = true
    setTimeout(() => { restoreSuccess.value = false }, 4000)
    loadList()
  } catch (e) {
    restoreError.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    restorePhase.value = 'idle'
  }
}

/** Cancel the entire restore. */
function cancelRestore(): void {
  restoreInfo.value = null
  restorePhase.value = 'idle'
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(loadList)
</script>

<template>
  <main class="home">
    <h1>{{ UI.homeTitle }}</h1>

    <div v-if="loading" class="status">{{ UI.loading }}</div>
    <div v-else-if="errorMessage" class="status error">{{ errorMessage }}</div>

    <template v-else>

      <!-- ── Import confirmation / diff panel ── -->
      <div v-if="pendingImport !== null" class="diff-panel">
        <h2>{{ UI.homeOverwriteTitle }}</h2>
        <p>
          <strong>{{ pendingImport.incoming.name }}</strong> {{ UI.homeIsAlreadySaved }}
        </p>

        <template v-if="pendingImport.diff.length > 0">
          <p class="diff-subtitle">{{ UI.homeDiffSubtitle }}</p>
          <table class="diff-table">
            <thead>
              <tr>
                <th>{{ UI.colField }}</th>
                <th>{{ UI.colSaved }}</th>
                <th>{{ UI.colIncoming }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in pendingImport.diff" :key="entry.label">
                <td>{{ entry.label }}</td>
                <td class="diff-old">{{ entry.oldValue }}</td>
                <td class="diff-new">{{ entry.newValue }}</td>
              </tr>
            </tbody>
          </table>
        </template>
        <p v-else class="no-diff">{{ UI.homeNoDiff }}</p>

        <div class="diff-buttons">
          <button class="btn-confirm" @click="confirmImport">{{ UI.homeOverwriteBtn }}</button>
          <button class="btn-cancel" @click="cancelImport">{{ UI.cancel }}</button>
        </div>
      </div>

      <!-- ── Restore conflict dialog ── -->
      <div v-else-if="restorePhase === 'conflict' && restoreInfo" class="diff-panel">
        <h2>{{ UI.restoreTitle }}</h2>
        <p>{{ UI.restoreSummary.replace('{rules}', String(restoreInfo.rules.length)).replace('{chars}', String(restoreInfo.newCharacters.length + restoreInfo.conflicts.length)) }}</p>
        <p class="diff-subtitle">{{ UI.restoreConflicts }}</p>
        <ul class="conflict-list">
          <li v-for="c in restoreInfo.conflicts" :key="c.incoming.id">
            <strong>{{ c.incoming.name }}</strong>
          </li>
        </ul>
        <div class="diff-buttons">
          <button class="btn-confirm" @click="confirmRestoreAll">{{ UI.restoreOverwriteAll }}</button>
          <button class="btn-ask" @click="startAskMode">{{ UI.restoreAskEach }}</button>
          <button class="btn-cancel" @click="cancelRestore">{{ UI.cancel }}</button>
        </div>
      </div>

      <!-- ── Sequential ask diff ── -->
      <div v-else-if="restorePhase === 'ask' && askCurrentDiff !== null" class="diff-panel">
        <h2>{{ UI.restoreTitle }}</h2>
        <p>{{ UI.restoreDiffPfx.replace('{n}', String(askIndex + 1)).replace('{total}', String(restoreInfo?.conflicts.length ?? 0)) }}
          <strong>{{ restoreInfo?.conflicts[askIndex]?.incoming.name }}</strong>
        </p>
        <template v-if="askCurrentDiff.length > 0">
          <p class="diff-subtitle">{{ UI.homeDiffSubtitle }}</p>
          <table class="diff-table">
            <thead>
              <tr>
                <th>{{ UI.colField }}</th>
                <th>{{ UI.colSaved }}</th>
                <th>{{ UI.colIncoming }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in askCurrentDiff" :key="entry.label">
                <td>{{ entry.label }}</td>
                <td class="diff-old">{{ entry.oldValue }}</td>
                <td class="diff-new">{{ entry.newValue }}</td>
              </tr>
            </tbody>
          </table>
        </template>
        <p v-else class="no-diff">{{ UI.homeNoDiff }}</p>
        <div class="diff-buttons">
          <button class="btn-confirm" @click="resolveAskOverwrite">{{ UI.homeOverwriteBtn }}</button>
          <button class="btn-cancel" @click="resolveAskSkip">{{ UI.restoreSkip }}</button>
        </div>
      </div>

      <!-- ── Busy / loading ── -->
      <div v-else-if="restorePhase === 'busy'" class="status">{{ UI.restoreBusy }}</div>

      <!-- Character list -->
      <template v-else>
        <ul v-if="characters.length > 0" class="character-list">
          <li v-for="char in characters" :key="char.id" class="character-item">
            <span class="char-name">{{ char.name }}</span>
            <div class="char-links">
              <router-link :to="{ name: 'character-sheet', params: { id: char.id } }" class="btn-link">{{ UI.navSheet }}</router-link>
              <router-link
                :to="isUnsupported(char) ? '' : { name: 'advancement', params: { id: char.id } }"
                class="btn-link"
                :class="{ 'btn-link--disabled': isUnsupported(char) }"
                :aria-disabled="isUnsupported(char)"
              >{{ UI.navAdvancement }}</router-link>
              <router-link :to="{ name: 'character-edit', params: { id: char.id } }" class="btn-link btn-link--edit">{{ UI.navEdit }}</router-link>
              <button class="btn-remove" @click="deleteCharacter(char.id)">{{ UI.delete }}</button>
            </div>
          </li>
        </ul>

        <p v-else class="empty-hint">{{ UI.emptyChars }}</p>

        <div class="btn-row">
          <router-link to="/character/new" class="btn-create">{{ UI.appNewChar }}</router-link>

          <button class="btn-import" :disabled="!browserSupported" :title="!browserSupported ? UI.browserUnsupportedHint : ''" @click="importCharacter">
            {{ UI.homeImportBtn }}
          </button>

          <button class="btn-import" @click="importCharacterFromDrive">
            {{ UI.importGoogleDrive }}
          </button>
        </div>

        <div class="rules-nav">
          <h2 class="rules-nav-title">{{ UI.homeActiveRules }}</h2>
          <table v-if="activeSources.length > 0" class="rules-table">
            <thead>
              <tr>
                <th>{{ UI.colTitle }}</th>
                <th>{{ UI.colVersion }}</th>
                <th>{{ UI.colScriptVersion }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="src in activeSources" :key="src.id">
                <td>{{ src.title }}</td>
                <td class="rules-table-version">{{ src.version }}</td>
                <td class="rules-table-version">{{ src.scriptVersion ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="rules-table-empty">{{ UI.homeNoRules }}</p>
          <router-link :to="{ name: 'rules' }" class="btn-rules">{{ UI.homeManageRules }}</router-link>
        </div>

        <div class="backup-section">
          <h2 class="backup-title">{{ UI.backupTitle }}</h2>
          <p class="backup-hint">{{ UI.backupHint }}</p>
          <div class="backup-buttons">
            <button class="btn-backup" :disabled="backingUp" @click="doBackup">{{ backingUp ? UI.backupRunning : UI.backupBtn }}</button>
            <button class="btn-backup" :disabled="backingUpDrive" @click="doBackupDrive">{{ backingUpDrive ? UI.backupRunning : UI.backupDriveBtn }}</button>
          </div>
          <p v-if="backupSuccess" class="backup-success">{{ UI.backupSuccess }}</p>
          <p v-if="backupError" class="backup-error">{{ UI.backupError }} {{ backupError }}</p>
          <p v-if="backupDriveError" class="backup-error">{{ UI.backupError }} {{ backupDriveError }}</p>
          <p v-if="restoreSuccess" class="restore-success">{{ UI.restoreSuccess }}</p>
          <p v-if="restoreError" class="restore-error">{{ UI.restoreError }} {{ restoreError }}</p>
          <div class="backup-buttons">
            <button class="btn-backup" :disabled="!browserSupported" :title="!browserSupported ? UI.browserUnsupportedHint : ''" @click="doRestore">{{ UI.restoreBtn }}</button>
            <button class="btn-backup" @click="doRestoreDrive">{{ UI.restoreDriveBtn }}</button>
          </div>
        </div>
      </template>

    </template>
  </main>
</template>

<style scoped>
.home {
  max-width: 600px;
  margin: 0 auto;
  padding: 1.5rem;
  font-family: sans-serif;
}

.status {
  color: #555;
  padding: 0.5rem 0;
}

.status.error {
  color: #c00;
}

.character-list {
  list-style: none;
  padding: 0;
  margin: 1rem 0;
}

.character-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid #ddd;
}

.char-name {
  font-weight: 600;
}

.char-links {
  display: flex;
  gap: 0.4rem;
}

.empty-hint {
  color: #666;
  margin: 1rem 0;
}

/* ── Diff panel ── */

.diff-panel {
  background: #f9f9f9;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 1.25rem;
}

.diff-panel h2 {
  margin: 0 0 0.5rem;
}

.diff-subtitle {
  margin: 0.75rem 0 0.5rem;
  font-weight: 600;
}

.no-diff {
  color: #555;
  font-style: italic;
}

.diff-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
}

.diff-table th,
.diff-table td {
  text-align: left;
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid #ddd;
  font-size: 0.9em;
}

.diff-table th {
  background: #f0f0f0;
  font-weight: 600;
}

.diff-old {
  color: #a00;
}

.diff-new {
  color: #1a6e1a;
}

.diff-buttons {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.rules-nav {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #ddd;
}

.rules-nav-title {
  font-size: 1em;
  font-weight: 600;
  margin: 0 0 0.5rem;
}

.rules-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0.75rem;
}

.rules-table th,
.rules-table td {
  text-align: left;
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid #ddd;
  font-size: 0.9em;
}

.rules-table th {
  font-weight: 600;
  background: #f5f5f5;
}

.rules-table-version {
  color: #888;
}

.rules-table-empty {
  color: #999;
  font-size: 0.9em;
  margin: 0 0 0.75rem;
}

.rules-link {
  color: #333;
}

.btn-create {
  display: inline-block;
  padding: 0.4rem 1rem;
  border: none;
  border-radius: 3px;
  background: #2a4a7a;
  color: #fff;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.btn-create:hover {
  background: #1e3559;
}

/* ── Backup section ── */

.backup-section {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #ddd;
}

.backup-title {
  font-size: 1em;
  font-weight: 600;
  margin: 0 0 0.25rem;
}

.backup-hint {
  color: #777;
  font-size: 0.85em;
  margin: 0 0 0.75rem;
}

.backup-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.backup-section .backup-buttons + .backup-buttons {
  margin-top: 0.75rem;
}

.btn-backup {
  padding: 0.4rem 1rem;
  border: 1px solid #2a4a7a;
  border-radius: 3px;
  background: transparent;
  color: #2a4a7a;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-backup:hover {
  background: #2a4a7a;
  color: #fff;
}

.btn-backup:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-backup:disabled:hover {
  background: transparent;
  color: #2a4a7a;
}

.backup-success {
  color: #1a6e1a;
  font-size: 0.85em;
  margin: 0.5rem 0 0;
}

.backup-error {
  color: #c00;
  font-size: 0.85em;
  margin: 0.5rem 0 0;
}

.restore-success {
  color: #1a6e1a;
  font-size: 0.85em;
  margin: 0.5rem 0 0;
}

.restore-error {
  color: #c00;
  font-size: 0.85em;
  margin: 0.5rem 0 0;
}

.conflict-list {
  list-style: disc;
  padding-left: 1.25rem;
  margin: 0.5rem 0 1rem;
  color: #333;
  font-size: 0.9em;
}

.btn-ask {
  padding: 0.4rem 1rem;
  border: 1px solid #e67e22;
  border-radius: 3px;
  background: transparent;
  color: #e67e22;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-ask:hover {
  background: #e67e22;
  color: #fff;
}


</style>

