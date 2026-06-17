<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { rulesStorage } from '../services/RulesStorage'
import { UI } from '../constants/ui'
import type { SourceSummary, AssetLink } from '../services/RulesStorage'

// ── State ─────────────────────────────────────────────────────────────────────

const sources        = ref<SourceSummary[]>([])
const loading        = ref(true)
const errorMessage   = ref<string | null>(null)
const assetLinks     = ref<AssetLink[]>([])
const reorderMode    = ref(false)
const savingPriority = ref(false)

/** True if the current browser supports the File System Access API. */
const browserSupported = 'showOpenFilePicker' in window

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Load the list of stored sources from IndexedDB and update the view.
 */
async function loadList(): Promise<void> {
  try {
    sources.value = (await rulesStorage.list()).sort((a, b) => a.priority - b.priority)
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to load rules.'
  } finally {
    loading.value = false
  }
}

/**
 * Open a multi-file picker and import all selected JSON files as rule sources.
 * Each imported file is stored in IndexedDB and enabled by default.
 */
async function importFiles(): Promise<void> {
  errorMessage.value = null
  try {
    await rulesStorage.importFiles()
    await loadList()
  } catch (e) {
    if (e instanceof Error && e.name !== 'AbortError') {
      errorMessage.value = e.message
    }
  }
}

/**
 * Toggle the enabled state of a source.
 *
 * @param source - The source summary to toggle.
 */
async function toggleEnabled(source: SourceSummary): Promise<void> {
  errorMessage.value = null
  try {
    await rulesStorage.setEnabled(source.id, !source.enabled)
    source.enabled = !source.enabled
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to update source.'
  }
}


/**
 * Import a rules file from Google Drive.
 */
async function importRuleFromDrive(): Promise<void> {
  errorMessage.value = null
  try {
    await rulesStorage.importFromDrive()
    await loadList()
  } catch (e) {
    if (e instanceof Error) {
      errorMessage.value = UI.driveErrorPrefix + ' ' + e.message
    }
  }
}

/**
 * Export a rules source to Google Drive.
 *
 * @param sourceId - The source ID to export.
 */
async function exportRuleToDrive(sourceId: string): Promise<void> {
  errorMessage.value = null
  try {
    await rulesStorage.exportToDrive(sourceId)
  } catch (e) {
    if (e instanceof Error) {
      errorMessage.value = UI.driveErrorPrefix + ' ' + e.message
    }
  }
}

/**
 * Permanently delete a source from IndexedDB.
 *
 * @param id - The source ID to remove.
 */
async function removeSource(id: string): Promise<void> {
  errorMessage.value = null
  try {
    await rulesStorage.remove(id)
    sources.value = sources.value.filter(s => s.id !== id)
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to remove source.'
  }
}

/**
 * Swap priorities with the source above, persist both, then reload the list.
 */
async function moveUp(index: number): Promise<void> {
  if (index === 0 || savingPriority.value) return
  savingPriority.value = true
  errorMessage.value = null
  try {
    const current    = sources.value[index]
    const above      = sources.value[index - 1]
    const tempPrio   = current.priority
    await rulesStorage.updatePriority(current.id, above.priority)
    await rulesStorage.updatePriority(above.id, tempPrio)
    await loadList()
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to reorder.'
  } finally {
    savingPriority.value = false
  }
}

/**
 * Swap priorities with the source below, persist both, then reload the list.
 */
async function moveDown(index: number): Promise<void> {
  if (index === sources.value.length - 1 || savingPriority.value) return
  savingPriority.value = true
  errorMessage.value = null
  try {
    const current    = sources.value[index]
    const below      = sources.value[index + 1]
    const tempPrio   = current.priority
    await rulesStorage.updatePriority(current.id, below.priority)
    await rulesStorage.updatePriority(below.id, tempPrio)
    await loadList()
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to reorder.'
  } finally {
    savingPriority.value = false
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(loadList)
</script>

<template>
  <main class="rules-view">
    <h1>{{ UI.rulesTitle }}</h1>

    <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>

    <div v-if="loading" class="status">{{ UI.loading }}</div>

    <template v-else>
      <!-- Source list -->
      <table v-if="sources.length > 0" class="source-table">
        <thead>
          <tr>
            <th>{{ UI.colTitle }}</th>
            <th>{{ UI.colVersion }}</th>
            <th v-if="!reorderMode">{{ UI.colActive }}</th>
            <th v-else>{{ UI.rulesReorderCol }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(source, index) in sources"
            :key="source.id"
            :class="{ 'row-disabled': !source.enabled }"
          >
            <td>{{ source.title }}</td>
            <td class="col-version">{{ source.version }}</td>
            <template v-if="!reorderMode">
              <td class="col-toggle">
                <input
                  type="checkbox"
                  :checked="source.enabled"
                  @change="toggleEnabled(source)"
                />
              </td>
              <td class="col-action">
                <button
                  v-if="source.enabled"
                  class="btn-icon btn-drive-export"
                  @click="exportRuleToDrive(source.id)"
                  :title="UI.driveExportRules"
                >☁</button>
                <button class="btn-remove" @click="removeSource(source.id)">{{ UI.delete }}</button>
              </td>
            </template>
            <template v-else>
              <td class="col-reorder">
                <button
                  class="btn-move"
                  :disabled="index === 0 || savingPriority"
                  @click="moveUp(index)"
                >&#9650;</button>
                <button
                  class="btn-move"
                  :disabled="index === sources.length - 1 || savingPriority"
                  @click="moveDown(index)"
                >&#9660;</button>
              </td>
              <td></td>
            </template>
          </tr>
        </tbody>
      </table>

      <p v-else class="empty-hint">{{ UI.rulesEmptyHint }}</p>

      <div class="btn-row">
        <button
          class="btn-import"
          :disabled="!browserSupported"
          :title="!browserSupported ? UI.browserUnsupportedHint : ''"
          @click="importFiles"
        >
          {{ UI.rulesImportBtn }}
        </button>
        <button
          class="btn-import"
          @click="importRuleFromDrive"
        >
          {{ UI.driveImportRules }}
        </button>
        <button
          class="btn-reorder"
          :class="{ 'btn-reorder--active': reorderMode }"
          @click="reorderMode = !reorderMode"
        >
          {{ reorderMode ? UI.rulesReorderExit : UI.rulesReorderBtn }}
        </button>
      </div>

      <p class="import-hint">
        Regelwerkdateien werden als JSON-Dateien im MagusNG-Format erstellt.
        Anleitungen und
        vorgefertigte Dateien findest du auf der
        <a
          href="https://gitlab.com/silbaer/magusng-pwa"
          target="_blank"
          rel="noopener noreferrer"
        >Projektseite</a>.
      </p>

      <div v-if="assetLinks.length > 0" class="github-assets">
        <p class="github-assets-title">{{ UI.rulesGithubAvailable }}</p>
        <ul class="asset-list">
          <li v-for="asset in assetLinks" :key="asset.name" class="asset-item">
            <span class="asset-name">{{ asset.name }}</span>
            <a :href="asset.downloadUrl" class="btn-download">{{ UI.rulesGithubDownloadBtn }}</a>
          </li>
        </ul>
      </div>
    </template>
  </main>
</template>

<style scoped>
.rules-view {
  max-width: 600px;
  margin: 0 auto;
  padding: 1.5rem;
  font-family: sans-serif;
}

.status {
  color: #555;
  padding: 0.5rem 0;
}

.error-message {
  color: #c00;
  margin-bottom: 1rem;
}

.source-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
}

.source-table th,
.source-table td {
  padding: 0.5rem 0.6rem;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.source-table th {
  font-weight: 600;
  background: #f5f5f5;
}

.row-disabled td {
  color: #aaa;
}

.col-version {
  color: #666;
  font-size: 0.9em;
}

.col-toggle {
  text-align: center;
}

.col-action {
  text-align: right;
}

.empty-hint {
  color: #666;
  margin: 1rem 0;
}

.github-message {
  color: #2d8a4e;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.github-assets {
  margin-top: 1rem;
}

.github-assets-title {
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.asset-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.asset-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.asset-name {
  flex: 1;
  font-family: monospace;
  font-size: 0.9rem;
}

.col-reorder {
  text-align: center;
  white-space: nowrap;
}

.import-hint {
  font-size: 0.88rem;
  color: #555;
  line-height: 1.6;
  margin: 0.25rem 0 0;
  padding: 0.75rem 1rem;
  background: #f5f7fa;
  border-left: 3px solid #2a4a7a;
  border-radius: 0 4px 4px 0;
}

.import-hint a {
  color: #2a4a7a;
}
</style>
