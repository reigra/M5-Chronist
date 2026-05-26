<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { characterStorage } from '../services/CharacterStorage'
import { rulesStorage } from '../services/RulesStorage'
import { UI } from '../constants/ui'
import type { Character } from '../types/Character'
import type { SourceSummary } from '../services/RulesStorage'

// ── Types ─────────────────────────────────────────────────────────────────────

/** One changed field shown in the diff view. */
interface DiffEntry {
  label: string
  oldValue: string | number
  newValue: string | number
}

/** Holds the parsed incoming character and the computed diff while awaiting confirmation. */
interface PendingImport {
  incoming: Character
  diff: DiffEntry[]
}

// ── State ─────────────────────────────────────────────────────────────────────

const router = useRouter()
const characters = ref<Array<{ id: string; name: string }>>([])
const loading = ref(true)
const errorMessage = ref<string | null>(null)
const pendingImport = ref<PendingImport | null>(null)
const activeSources = ref<SourceSummary[]>([])

/** True if the current browser supports the File System Access API. */
const browserSupported = 'showOpenFilePicker' in window

// ── Diff helper ───────────────────────────────────────────────────────────────

/**
 * Compute a flat list of differences between two characters.
 * Compares scalar fields, all base and derived properties, and skills.
 * Skips id, createdAt, updatedAt — those are not relevant to the user.
 *
 * @param existing - The character currently saved in IndexedDB.
 * @param incoming - The character parsed from the imported file.
 * @returns Array of changed fields. Empty if the characters are identical.
 */
function computeDiff(existing: Character, incoming: Character): DiffEntry[] {
  const entries: DiffEntry[] = []

  // Scalar identity fields
  const scalarFields: Array<{ key: keyof Character; label: string }> = [
    { key: 'name',           label: 'Name' },
    { key: 'player',         label: 'Player' },
    { key: 'raceId',         label: 'Race' },
    { key: 'typeId',         label: 'Type' },
    { key: 'originId',       label: 'Origin' },
    { key: 'socialStatusId', label: 'Social Status' },
    { key: 'totalEs',        label: 'ES (total)' },
    { key: 'availableEp',    label: 'EP (available)' },
  ]

  for (const { key, label } of scalarFields) {
    const oldVal = existing[key]
    const newVal = incoming[key]
    if (oldVal !== newVal) {
      entries.push({ label, oldValue: String(oldVal), newValue: String(newVal) })
    }
  }

  // Properties
  for (const key of Object.keys(existing.properties) as Array<keyof typeof existing.properties>) {
    const oldVal = existing.properties[key]
    const newVal = incoming.properties[key]
    if (oldVal !== newVal) {
      entries.push({ label: `Eigenschaft: ${key}`, oldValue: oldVal, newValue: newVal })
    }
  }

  // Boni
  for (const key of Object.keys(existing.boni) as Array<keyof typeof existing.boni>) {
    const oldVal = existing.boni[key]
    const newVal = incoming.boni[key]
    if (oldVal !== newVal) {
      entries.push({ label: `Bonus: ${key}`, oldValue: oldVal, newValue: newVal })
    }
  }

  // Skills — compare by skillId
  const existingSkillMap = new Map(existing.skills.map(s => [s.skillId, s.value]))
  const incomingSkillMap = new Map(incoming.skills.map(s => [s.skillId, s.value]))

  for (const [id, oldFw] of existingSkillMap) {
    const newFw = incomingSkillMap.get(id)
    if (newFw === undefined) {
      entries.push({ label: `Skill: ${id}`, oldValue: `FW ${oldFw}`, newValue: '(removed)' })
    } else if (newFw !== oldFw) {
      entries.push({ label: `Skill: ${id}`, oldValue: `FW ${oldFw}`, newValue: `FW ${newFw}` })
    }
  }

  for (const [id, newFw] of incomingSkillMap) {
    if (!existingSkillMap.has(id)) {
      entries.push({ label: `Skill: ${id}`, oldValue: '(new)', newValue: `FW ${newFw}` })
    }
  }

  return entries
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Load the list of saved characters from IndexedDB and update the view.
 */
async function loadList(): Promise<void> {
  try {
    characters.value = await characterStorage.list()
    const allSources = await rulesStorage.list()
    activeSources.value = allSources.filter(s => s.enabled)
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

      <!-- Browser compatibility warning -->
      <div v-if="!browserSupported" class="browser-warning">
        <strong>{{ UI.browserUnsupportedTitle }}</strong><br>
        {{ UI.browserWarningApp }}
      </div>

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
              <router-link :to="{ name: 'advancement', params: { id: char.id } }" class="btn-link">{{ UI.navAdvancement }}</router-link>
              <router-link :to="{ name: 'character-edit', params: { id: char.id } }" class="btn-link btn-link--edit">{{ UI.navEdit }}</router-link>
            </div>
          </li>
        </ul>

        <p v-else class="empty-hint">{{ UI.emptyChars }}</p>

        <button class="btn-import" :disabled="!browserSupported" @click="importCharacter">
          {{ UI.homeImportBtn }}
        </button>

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

.btn-link {
  display: inline-block;
  padding: 0.3rem 0.75rem;
  border: 1px solid #aaa;
  border-radius: 3px;
  background: #fff;
  color: #333;
  font-size: 0.85em;
  text-decoration: none;
  cursor: pointer;
}

.btn-link:hover {
  background: #f0f0f0;
  text-decoration: none;
}

.btn-link--edit {
  color: #555;
}

.empty-hint {
  color: #666;
  margin: 1rem 0;
}

.btn-import {
  margin-top: 0.5rem;
  padding: 0.5rem 1.25rem;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
  background: #fff;
}

.btn-import:hover:not(:disabled) {
  background: #f0f0f0;
}

.browser-warning {
  background: #fff3cd;
  border: 1px solid #e6a817;
  border-radius: 4px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  color: #7a4f00;
  line-height: 1.5;
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

.btn-confirm {
  background: #2a7a2a;
  color: #fff;
  border: none;
  padding: 0.4rem 1rem;
  border-radius: 3px;
  cursor: pointer;
}

.btn-cancel {
  background: #888;
  color: #fff;
  border: none;
  padding: 0.4rem 1rem;
  border-radius: 3px;
  cursor: pointer;
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

.btn-rules {
  display: inline-block;
  padding: 0.4rem 1rem;
  border: 1px solid #aaa;
  border-radius: 3px;
  background: #fff;
  color: #333;
  font-size: 0.9em;
  text-decoration: none;
}

.btn-rules:hover {
  background: #f0f0f0;
}
</style>

