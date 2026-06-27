<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { characterStorage } from '../services/CharacterStorage'
import { rulesStorage } from '../services/RulesStorage'
import { RulesLoader } from '../services/RulesLoader'
import { computeDiff } from '../services/CharacterService'
import type { DiffEntry } from '../services/CharacterService'
import { UI } from '../constants/ui'
import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { SourceSummary } from '../services/RulesStorage'

// ── Google Drive Sichtbarkeit ─────────────────────────────────────────────────
const isDriveVisible = import.meta.env.DEV || import.meta.env.VITE_GOOGLE_DRIVE_VISIBLE === 'true'

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
const pendingImport = ref<PendingImport | null>(null)
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
    if (e instanceof Error) {
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
          <button class="btn-import" :disabled="!browserSupported" :title="!browserSupported ? UI.browserUnsupportedHint : ''" @click="importCharacter">
            {{ UI.homeImportBtn }}
          </button>

          <button v-if="isDriveVisible" class="btn-import" @click="importCharacterFromDrive">
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
              </tr>
            </thead>
            <tbody>
              <tr v-for="src in activeSources" :key="src.id">
                <td>{{ src.title }}</td>
                <td class="rules-table-version">{{ src.version }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="rules-table-empty">{{ UI.homeNoRules }}</p>
          <router-link :to="{ name: 'rules' }" class="btn-rules">{{ UI.homeManageRules }}</router-link>
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

</style>

