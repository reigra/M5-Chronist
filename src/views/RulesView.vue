<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { rulesStorage } from '../services/RulesStorage'
import { UI } from '../constants/ui'
import type { SourceSummary, AssetLink } from '../services/RulesStorage'

// ── State ─────────────────────────────────────────────────────────────────────

const sources      = ref<SourceSummary[]>([])
const loading      = ref(true)
const errorMessage = ref<string | null>(null)
const assetLinks     = ref<AssetLink[]>([])

/** True if the current browser supports the File System Access API. */
const browserSupported = 'showOpenFilePicker' in window

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Load the list of stored sources from IndexedDB and update the view.
 */
async function loadList(): Promise<void> {
  try {
    sources.value = await rulesStorage.list()
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

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(loadList)
</script>

<template>
  <main class="rules-view">
    <h1>{{ UI.rulesTitle }}</h1>

    <div v-if="!browserSupported" class="browser-warning">
      <strong>{{ UI.browserUnsupportedTitle }}</strong><br>
      {{ UI.browserWarningRules }}
    </div>

    <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>

    <div v-if="loading" class="status">{{ UI.loading }}</div>

    <template v-else>
      <!-- Source list -->
      <table v-if="sources.length > 0" class="source-table">
        <thead>
          <tr>
            <th>{{ UI.colTitle }}</th>
            <th>{{ UI.colVersion }}</th>
            <th>{{ UI.colActive }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="source in sources" :key="source.id" :class="{ 'row-disabled': !source.enabled }">
            <td>{{ source.title }}</td>
            <td class="col-version">{{ source.version }}</td>
            <td class="col-toggle">
              <input
                type="checkbox"
                :checked="source.enabled"
                @change="toggleEnabled(source)"
              />
            </td>
            <td class="col-action">
              <button class="btn-remove" @click="removeSource(source.id)">{{ UI.delete }}</button>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-else class="empty-hint">{{ UI.rulesEmptyHint }}</p>

      <div class="btn-row">
        <button
          class="btn-import"
          :disabled="!browserSupported"
          @click="importFiles"
        >
          {{ UI.rulesImportBtn }}
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

.browser-warning {
  background: #fff3cd;
  border: 1px solid #e6a817;
  border-radius: 4px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  color: #7a4f00;
  line-height: 1.5;
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

.btn-remove {
  padding: 0.25rem 0.6rem;
  border: 1px solid #c00;
  border-radius: 3px;
  background: #fff;
  color: #c00;
  font-size: 0.85em;
  cursor: pointer;
}

.btn-remove:hover {
  background: #fff0f0;
}

.empty-hint {
  color: #666;
  margin: 1rem 0;
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.btn-github {
  padding: 0.5rem 1rem;
  background: #2d8a4e;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.btn-github:hover:not(:disabled) {
  background: #236c3d;
}
.btn-github:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.btn-download {
  padding: 0.3rem 0.75rem;
  background: #2d8a4e;
  color: #fff;
  border-radius: 4px;
  text-decoration: none;
  font-size: 0.85rem;
  white-space: nowrap;
}
.btn-download:hover {
  background: #236c3d;
}

.btn-import {
  padding: 0.5rem 1.25rem;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
  background: #fff;
}

.btn-import:hover:not(:disabled) {
  background: #f0f0f0;
}

.btn-import:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
