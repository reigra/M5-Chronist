<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RulesLoader } from '../services/RulesLoader'
import { characterStorage } from '../services/CharacterStorage'
import { computeGrad } from '../services/GradUtils'
import { UI } from '../constants/ui'
import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { EquipmentItem } from '../types/Equipment'

const route = useRoute()
const router = useRouter()

const character = ref<Character | null>(null)
const rules = ref<RulesData | null>(null)
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref<string | null>(null)

const grad = computed(() =>
  character.value ? computeGrad(character.value.totalEs) : 0,
)

const inventory = ref<EquipmentItem[]>([])

const availableEquipment = computed(() => {
  const r = rules.value
  if (!r) return []
  return r.equipment
})

const searchQuery = ref('')
const showDropdown = ref(false)

const filteredEquipment = computed(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return []
  return availableEquipment.value.filter(e =>
    e.name.toLowerCase().includes(q),
  )
})

const formGroup = ref('')
const formLocation = ref('')
const formDescription = ref('')
const formPrice = ref(0)
const formWeight = ref(0)

watch(searchQuery, (val) => {
  if (!val) {
    formGroup.value = ''
    formLocation.value = ''
    formDescription.value = ''
    formPrice.value = 0
    formWeight.value = 0
  }
})

function closeDropdownAfter(delay: number): void {
  setTimeout(() => { showDropdown.value = false }, delay)
}

function selectItem(item: EquipmentItem): void {
  searchQuery.value = item.name
  showDropdown.value = false
  formGroup.value = item.group
  formLocation.value = item.location
  formDescription.value = item.description
  formPrice.value = item.price
  formWeight.value = item.weight
}

function addItem(): void {
  if (!searchQuery.value.trim()) return
  inventory.value = [
    ...inventory.value,
    {
      id: searchQuery.value.trim(),
      name: searchQuery.value.trim(),
      group: formGroup.value,
      description: formDescription.value,
      location: formLocation.value,
      price: formPrice.value,
      weight: formWeight.value,
    },
  ]
  searchQuery.value = ''
  formGroup.value = ''
  formLocation.value = ''
  formDescription.value = ''
  formPrice.value = 0
  formWeight.value = 0
}

function removeItem(idx: number): void {
  inventory.value = inventory.value.filter((_, i) => i !== idx)
}

async function save(): Promise<void> {
  const char = character.value
  if (!char) return
  saving.value = true
  errorMessage.value = null
  try {
    const updated: Character = {
      ...char,
      inventory: inventory.value,
      updatedAt: new Date().toISOString(),
    }
    await characterStorage.save(updated)
    character.value = updated
    await router.push({ name: 'character-sheet', params: { id: char.id } })
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to save.'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const id = route.params.id as string
    const [loadedRules, loadedChar] = await Promise.all([
      new RulesLoader().load(),
      characterStorage.load(id),
    ])
    if (!loadedChar) {
      errorMessage.value = `Character "${id}" not found.`
      return
    }
    rules.value = loadedRules
    character.value = loadedChar
    inventory.value = [...(loadedChar.inventory ?? [])]
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to load data.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="equipment-page">
    <div v-if="loading" class="status">{{ UI.loading }}</div>
    <div v-else-if="errorMessage" class="status error">{{ errorMessage }}</div>

    <template v-else-if="character">
      <header class="equip-header">
        <h1>{{ character.name }}</h1>
        <span class="grad-badge">{{ UI.labelGrad }} {{ grad }}</span>
        <span class="gold-badge">{{ UI.labelGold }} {{ character.gold ?? 0 }}</span>
      </header>

      <section class="card">
        <h2>{{ UI.equipHeader }}</h2>

        <table v-if="inventory.length > 0" class="equip-table">
          <thead>
            <tr>
              <th>{{ UI.equipColName }}</th>
              <th>{{ UI.equipColGroup }}</th>
              <th>{{ UI.equipColLocation }}</th>
              <th>{{ UI.equipColPrice }}</th>
              <th>{{ UI.equipColWeight }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in inventory" :key="idx">
              <td>{{ item.name }}</td>
              <td>{{ item.group }}</td>
              <td>{{ item.location }}</td>
              <td>{{ item.price }}</td>
              <td>{{ item.weight }}</td>
              <td><button type="button" class="btn-remove" @click="removeItem(idx)">✕</button></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-hint">{{ UI.equipEmpty }}</p>
      </section>

      <section class="card add-section">
        <h2>{{ UI.add }}</h2>

        <div class="search-wrapper">
          <input v-model="searchQuery" type="text" :placeholder="UI.equipSearchPlaceholder"
            class="search-input"
            @focus="showDropdown = true"
            @input="showDropdown = true"
            @blur="closeDropdownAfter(200)" />
          <ul v-if="showDropdown && filteredEquipment.length > 0" class="search-dropdown">
            <li v-for="item in filteredEquipment" :key="item.id"
              @mousedown.prevent="selectItem(item)" class="search-dropdown-item">
              {{ item.name }} <span class="search-dropdown-group">({{ item.group }})</span>
            </li>
          </ul>
        </div>

        <div class="form-grid">
          <label>{{ UI.equipLabelGroup }}
            <input v-model="formGroup" type="text" />
          </label>
          <label>{{ UI.equipLabelLocation }}
            <input v-model="formLocation" type="text" />
          </label>
          <label>{{ UI.equipLabelDesc }}
            <input v-model="formDescription" type="text" />
          </label>
          <label>{{ UI.equipLabelPrice }}
            <input v-model.number="formPrice" type="number" min="0" step="0.01" class="num-input" />
          </label>
          <label>{{ UI.equipLabelWeight }}
            <input v-model.number="formWeight" type="number" min="0" step="0.001" class="num-input" />
          </label>
        </div>

        <button class="btn-add" :disabled="!searchQuery.trim()" @click="addItem">
          {{ UI.equipAddBtn }}
        </button>
      </section>

      <div class="form-actions">
        <button class="btn-save" :disabled="saving" @click="save">
          {{ saving ? UI.formSaving : UI.equipSaveBtn }}
        </button>
        <button class="btn-cancel" @click="router.back()">{{ UI.equipCancelBtn }}</button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.equipment-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem;
  font-family: sans-serif;
}

.status { color: #555; margin-bottom: 1rem; }
.status.error { color: #c00; }

.equip-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.equip-header h1 { margin: 0; }

.grad-badge {
  background: #2a4a7a;
  color: #fff;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.85em;
  font-weight: 600;
  white-space: nowrap;
}

.gold-badge {
  background: #b8860b;
  color: #fff;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.85em;
  font-weight: 600;
  white-space: nowrap;
}

.card {
  background: #fafafa;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
}

.card h2 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #555;
}

.equip-table {
  width: 100%;
  border-collapse: collapse;
}

.equip-table th,
.equip-table td {
  text-align: left;
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid #eee;
  font-size: 0.9em;
}

.equip-table th { background: #f0f0f0; font-weight: 600; }

.btn-remove {
  background: none;
  border: none;
  color: #a00;
  cursor: pointer;
  font-size: 0.9em;
  padding: 0.1rem 0.3rem;
}

.empty-hint { color: #888; font-style: italic; margin: 0; }

.add-section { display: flex; flex-direction: column; gap: 0.75rem; }

.search-wrapper { position: relative; width: 100%; }

.search-input { width: 100%; padding: 0.5rem; border: 1px solid #bbb; border-radius: 3px; font-size: 1rem; box-sizing: border-box; }

.search-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #bbb;
  border-top: none;
  border-radius: 0 0 3px 3px;
  max-height: 220px;
  overflow-y: auto;
  z-index: 10;
  list-style: none;
  margin: 0;
  padding: 0;
}

.search-dropdown-item {
  padding: 0.3rem 0.5rem;
  cursor: pointer;
}

.search-dropdown-item:hover { background: #e8f0ff; }

.search-dropdown-group { color: #888; font-size: 0.85em; }

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

.form-grid label {
  display: flex;
  flex-direction: column;
  font-size: 0.85em;
  color: #555;
  gap: 0.2rem;
}

.form-grid input {
  padding: 0.35rem 0.5rem;
  border: 1px solid #bbb;
  border-radius: 3px;
  font-size: 1rem;
}

.num-input { width: 8rem; text-align: right; }

.btn-add {
  align-self: flex-start;
  padding: 0.35rem 0.85rem;
  background: #fff;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
}

.btn-add:disabled { opacity: 0.4; cursor: not-allowed; }

.form-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}

.btn-save {
  padding: 0.5rem 1.5rem;
  background: #2a7a2a;
  color: #fff;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 1rem;
}

.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-cancel {
  padding: 0.5rem 1rem;
  background: #fff;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
}
</style>
