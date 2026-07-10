<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RulesLoader } from '../services/RulesLoader'
import { characterStorage } from '../services/CharacterStorage'
import { computeGrad } from '../services/GradUtils'
import { UI } from '../constants/ui'
import { useNotifications } from '../composables/useNotifications'
import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { EquipmentItem } from '../types/Equipment'
import type { Skill } from '../types/Skill'

const route = useRoute()
const router = useRouter()

const character = ref<Character | null>(null)
const rules = ref<RulesData | null>(null)
const loading = ref(true)
const saving = ref(false)
const loadError = ref(false)
const { error } = useNotifications()

const grad = computed(() =>
  character.value ? computeGrad(character.value.totalEs) : 0,
)

const inventory = ref<EquipmentItem[]>([])

const availableEquipment = computed(() => {
  const r = rules.value
  if (!r) return []
  return r.equipment
})

const weaponSkills = computed<Skill[]>(() => {
  return rules.value?.skills.filter(s => s.typ === 'Waffenfertigkeit') ?? []
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

const formWaffe     = ref(false)
const formDamage    = ref('')
const formWaffentyp = ref('')
const formSaveAP    = ref(0)
const formAnb       = ref(0)
const formSchb      = ref(0)
const formAbb       = ref(0)
const formMagisch      = ref(false)
const formSpezialwaffe = ref(false)
const formSkillId = ref('')

const editingIndex = ref<number | null>(null)
const isEditing = computed(() => editingIndex.value !== null)

function resetForm(): void {
  searchQuery.value = ''
  showDropdown.value = false
  formGroup.value = ''
  formLocation.value = ''
  formDescription.value = ''
  formPrice.value = 0
  formWeight.value = 0
  formWaffe.value     = false
  formDamage.value    = ''
  formWaffentyp.value = ''
  formSaveAP.value    = 0
  formAnb.value       = 0
  formSchb.value      = 0
  formAbb.value       = 0
  formMagisch.value   = false
  formSpezialwaffe.value = false
  formSkillId.value = ''
}

watch(searchQuery, (val) => {
  if (!val) {
    resetForm()
    editingIndex.value = null
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
  formWaffe.value     = !!(item.waffe ?? item.waffentyp)
  formDamage.value    = item.damage ?? ''
  formWaffentyp.value = item.waffentyp ?? ''
  formSaveAP.value    = item.saveAP ?? 0
  formAnb.value       = item.anb ?? 0
  formSchb.value      = item.schb ?? 0
  formAbb.value       = item.abb ?? 0
  formMagisch.value   = !!item.magisch
  formSpezialwaffe.value = !!(item.spezialwaffe ?? character.value?.weaponSpecializations?.includes(item.name))
  formSkillId.value = item.skillId ?? ''
}

function buildItem(): EquipmentItem {
  return {
    id: searchQuery.value.trim(),
    name: searchQuery.value.trim(),
    group: formGroup.value,
    description: formDescription.value,
    location: formLocation.value,
    price: formPrice.value,
    weight: formWeight.value,
    waffe:     formWaffe.value || undefined,
    damage:    formDamage.value || undefined,
    waffentyp: formWaffentyp.value || undefined,
    saveAP:    formSaveAP.value || undefined,
    anb:       formAnb.value || undefined,
    schb:      formSchb.value || undefined,
    abb:       formAbb.value || undefined,
    magisch:      formMagisch.value || undefined,
    spezialwaffe: formSpezialwaffe.value || undefined,
    skillId: formSkillId.value || undefined,
  }
}

function addItem(): void {
  if (!searchQuery.value.trim()) return
  const item = buildItem()
  if (editingIndex.value !== null) {
    inventory.value = inventory.value.map((it, i) => i === editingIndex.value ? item : it)
  } else {
    inventory.value = [...inventory.value, item]
  }
  editingIndex.value = null
  resetForm()
}

function editItem(idx: number): void {
  const item = inventory.value[idx]
  searchQuery.value = item.name
  formGroup.value = item.group
  formLocation.value = item.location
  formDescription.value = item.description
  formPrice.value = item.price
  formWeight.value = item.weight
  formWaffe.value     = !!(item.waffe ?? item.waffentyp)
  formDamage.value    = item.damage ?? ''
  formWaffentyp.value = item.waffentyp ?? ''
  formSaveAP.value    = item.saveAP ?? 0
  formAnb.value       = item.anb ?? 0
  formSchb.value      = item.schb ?? 0
  formAbb.value       = item.abb ?? 0
  formMagisch.value   = !!item.magisch
  formSpezialwaffe.value = !!(item.spezialwaffe ?? character.value?.weaponSpecializations?.includes(item.name))
  formSkillId.value = item.skillId ?? ''
  editingIndex.value = idx
}

function cancelEdit(): void {
  editingIndex.value = null
  resetForm()
}

function itemNameDisplay(item: EquipmentItem): string {
  let name = item.name
  if (item.magisch) name += '*'
  const schb = item.schb
  const anb = item.anb
  if ((schb ?? 0) !== 0 || (anb ?? 0) !== 0) {
    const fmt = (v: number | undefined) => v !== undefined && v < 0 ? `${v}` : `+${v ?? 0}`
    name += ` (${fmt(schb)}/${fmt(anb)})`
  }
  return name
}

function removeItem(idx: number): void {
  inventory.value = inventory.value.filter((_, i) => i !== idx)
}

async function save(): Promise<void> {
  const char = character.value
  if (!char) return
  saving.value = true
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
    error(e instanceof Error ? e.message : 'Failed to save.')
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
      loadError.value = true
      error(`Character "${id}" not found.`, null)
      return
    }
    rules.value = loadedRules
    character.value = loadedChar
    inventory.value = [...(loadedChar.inventory ?? [])]
  } catch (e) {
    loadError.value = true
    error(e instanceof Error ? e.message : 'Failed to load data.', null)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="equipment-page">
    <div v-if="loading" class="status">{{ UI.loading }}</div>
    <div v-else-if="loadError" class="status error">{{ UI.failedToLoad }}</div>

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
              <th>{{ UI.equipLabelDesc }}</th>
              <th>{{ UI.equipColLocation }}</th>
              <th>{{ UI.equipColWeight }}</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in inventory" :key="idx">
              <td>{{ itemNameDisplay(item) }}</td>
              <td>{{ item.description || '—' }}</td>
              <td>{{ item.location }}</td>
              <td>{{ item.weight }}</td>
              <td><button type="button" class="btn-edit" @click="editItem(idx)">✎</button></td>
              <td><button type="button" class="btn-remove-inline" @click="removeItem(idx)">✕</button></td>
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

        <label class="waffe-toggle">{{ UI.equipLabelWaffe }}
          <input v-model="formWaffe" type="checkbox" />
        </label>

        <div v-if="formWaffe" class="weapon-grid">
          <label>{{ UI.equipLabelSkill }}
            <select v-model="formSkillId">
              <option value="" disabled>{{ UI.selectPlaceholder }}</option>
              <option v-for="s in weaponSkills" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </label>
          <label>{{ UI.equipLabelWaffentyp }}
            <input v-model="formWaffentyp" type="text" />
          </label>
          <label>{{ UI.equipLabelDamage }}
            <input v-model="formDamage" type="text" />
          </label>
          <label class="checkbox-label">{{ UI.equipLabelMagisch }}
            <input v-model="formMagisch" type="checkbox" />
          </label>
          <label class="checkbox-label">{{ UI.equipLabelSpezialwaffe }}
            <input v-model="formSpezialwaffe" type="checkbox" />
          </label>
          <label>{{ UI.equipLabelSaveAP }}
            <input v-model.number="formSaveAP" type="number" min="0" class="num-input" />
          </label>
          <label>{{ UI.equipLabelSchb }}
            <input v-model.number="formSchb" type="number" class="num-input" />
          </label>
          <label>{{ UI.equipLabelAbb }}
            <input v-model.number="formAbb" type="number" class="num-input" />
          </label>
          <label>{{ UI.equipLabelAnb }}
            <input v-model.number="formAnb" type="number" class="num-input" />
          </label>
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

        <div class="action-row">
          <button class="btn-add" :disabled="!searchQuery.trim()" @click="addItem">
            {{ isEditing ? UI.equipUpdateBtn : UI.equipAddBtn }}
          </button>
          <button v-if="isEditing" class="btn-cancel" @click="cancelEdit">{{ UI.cancel }}</button>
        </div>
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

.btn-edit {
  background: none;
  border: none;
  color: #2a4a7a;
  cursor: pointer;
  font-size: 0.9em;
  padding: 0.1rem 0.3rem;
}

.btn-remove-inline {
  background: none;
  border: none;
  color: #a00;
  cursor: pointer;
  font-size: 0.9em;
  padding: 0.1rem 0.3rem;
}

.empty-hint { color: #888; font-style: italic; margin: 0; }

.add-section { display: flex; flex-direction: column; gap: 0.75rem; }

.waffe-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  font-size: 0.95em;
  user-select: none;
}

.waffe-toggle input { width: 1.1rem; height: 1.1rem; cursor: pointer; }

.weapon-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 3px;
  background: #f5f5f5;
}

.weapon-grid label {
  display: flex;
  flex-direction: column;
  font-size: 0.85em;
  color: #555;
  gap: 0.2rem;
}

.weapon-grid input,
.weapon-grid select {
  padding: 0.35rem 0.5rem;
  border: 1px solid #bbb;
  border-radius: 3px;
  font-size: 1rem;
}

.checkbox-label {
  flex-direction: row !important;
  align-items: center;
  gap: 0.4rem !important;
}

.checkbox-label input { width: 1.1rem; height: 1.1rem; cursor: pointer; }

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

.action-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.form-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}
</style>
