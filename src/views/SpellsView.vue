<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RulesLoader } from '../services/RulesLoader'
import { characterStorage } from '../services/CharacterStorage'
import { computeGrad } from '../services/GradUtils'
import { UI } from '../constants/ui'
import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { Spell } from '../types/Spell'

// ── State ─────────────────────────────────────────────────────────────────────

const route = useRoute()
const router = useRouter()

const character = ref<Character | null>(null)
const rules = ref<RulesData | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)

/** The spell the player wants to learn — awaiting confirmation. */
interface PendingSpellAction {
  spell: Spell
  epCost: number
  goldCost: number
}
const pendingAction = ref<PendingSpellAction | null>(null)

// ── Computed ──────────────────────────────────────────────────────────────────

const grad = computed(() =>
  character.value ? computeGrad(character.value.totalEs) : 0,
)

/** The character's type from rules. */
const charType = computed(() => {
  const c = character.value
  const r = rules.value
  if (!c || !r) return null
  return r.types.find(t => t.id === c.typeId) ?? null
})

/** True if the character type can cast spells. */
const isCaster = computed(() => {
  const t = charType.value
  return t?.category === 'KampfZauberer' || t?.category === 'Zauberer'
})

/**
 * Learned spells with full display data, sorted by level then name.
 */
const learnedSpellRows = computed(() => {
  const c = character.value
  const r = rules.value
  if (!c || !r) return []
  const learned = c.spells ?? []
  return learned
    .map(id => {
      const spell = r.spells.find(s => s.id === id)
      return { id, name: spell?.name ?? id, level: spell?.level ?? 0, spellGroup: spell?.spellGroup ?? '—' }
    })
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
})

/**
 * Spells available to learn: in the type's spell groups, not yet learned,
 * sorted by level then name. Each row includes the EP cost.
 */
const learnableSpellRows = computed(() => {
  const c = character.value
  const r = rules.value
  const type = charType.value
  if (!c || !r || !type?.spellCosts) return []

  const groups = new Set(Object.keys(type.spellCosts))
  const learned = new Set(c.spells ?? [])

  return r.spells
    .filter(s => groups.has(s.spellGroup) && !learned.has(s.id))
    .map(s => ({
      spell: s,
      cost: s.level * (type.spellCosts![s.spellGroup] ?? 0),
      canAfford: (c.availableEp) >= s.level * (type.spellCosts![s.spellGroup] ?? 0),
    }))
    .sort((a, b) => a.spell.level - b.spell.level || a.spell.name.localeCompare(b.spell.name))
})

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Stage a spell to learn — shows the confirmation modal.
 * @param spell - The spell the player selected.
 */
function requestLearn(spell: Spell): void {
  const type = charType.value
  if (!type?.spellCosts) return
  const epCost = spell.level * (type.spellCosts[spell.spellGroup] ?? 0)
  const goldCost = spell.level * 100
  pendingAction.value = { spell, epCost, goldCost }
}

/** Discard the staged learn without any changes. */
function cancelLearn(): void {
  pendingAction.value = null
}

/**
 * Confirm the staged learn: deduct EP and gold, add spell ID, save.
 */
async function confirmLearn(): Promise<void> {
  const action = pendingAction.value
  const char = character.value
  if (!action || !char) return

  if (char.availableEp < action.epCost) {
    errorMessage.value = 'Not enough EP.'
    pendingAction.value = null
    return
  }

  const updated: Character = {
    ...char,
    spells: [...(char.spells ?? []), action.spell.id],
    availableEp: char.availableEp - action.epCost,
    gold: (char.gold ?? 0) - action.goldCost,
    updatedAt: new Date().toISOString(),
  }

  try {
    await characterStorage.save(updated)
    character.value = updated
    pendingAction.value = null
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to save.'
    pendingAction.value = null
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

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
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to load data.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="spells-page">

    <div v-if="loading" class="status">{{ UI.loading }}</div>
    <div v-else-if="errorMessage" class="status error">{{ errorMessage }}</div>

    <template v-else-if="character">

      <!-- ── Header ── -->
      <header class="char-header">
        <div class="char-header-top">
          <div class="char-header-title">
            <h1>{{ character.name }}</h1>
            <span class="grad-badge">{{ UI.labelGrad }} {{ grad }}</span>
          </div>
          <nav class="sheet-nav">
            <button type="button" class="btn-nav" @click="router.push({ name: 'character-sheet', params: { id: character.id } })">{{ UI.navSheet }}</button>
            <button type="button" class="btn-nav" @click="router.push({ name: 'advancement', params: { id: character.id } })">{{ UI.navAdvancement }}</button>
            <button type="button" class="btn-nav" @click="router.push({ name: 'character-edit', params: { id: character.id } })">{{ UI.navEdit }}</button>
          </nav>
        </div>
        <p class="ep-balance">
          {{ UI.epAvailable }} <strong>{{ character.availableEp }}</strong>
          / {{ character.totalEs }} {{ UI.esTotal }}
          &nbsp;| {{ UI.labelGold }} <strong>{{ character.gold ?? 0 }}</strong>
        </p>
      </header>

      <!-- ── Not a caster ── -->
      <p v-if="!isCaster" class="not-caster">
        {{ UI.spellsNotCaster }}
      </p>

      <template v-else>

        <!-- ── Confirmation modal ── -->
        <div v-if="pendingAction !== null" class="modal-overlay" @click.self="cancelLearn">
          <div class="modal-box">
            <p>
              {{ UI.confirmLearnPfx }} <strong>{{ pendingAction.spell.name }}</strong>
              ({{ UI.colLevel }} {{ pendingAction.spell.level }}, {{ pendingAction.spell.spellGroup }})
              {{ UI.confirmFor }} <strong>{{ pendingAction.epCost }} {{ UI.unitEp }}</strong>?
            </p>
            <label class="gold-cost-row">
              {{ UI.advGoldLearnCost }}
              <input v-model.number="pendingAction.goldCost" type="number" min="0" class="gs-input" />
            </label>
            <p class="ep-after">
              {{ UI.spellsEpAfter }} {{ character.availableEp - pendingAction.epCost }}
            </p>
            <div class="confirmation-buttons">
              <button
                class="btn-confirm"
                :disabled="(character.gold ?? 0) < pendingAction.goldCost"
                @click="confirmLearn"
              >{{ UI.confirm }}</button>
              <button class="btn-cancel" @click="cancelLearn">{{ UI.cancel }}</button>
            </div>
          </div>
        </div>

        <!-- ── Learned Spells ── -->
        <section>
          <h2>{{ UI.spellsKnown }}</h2>
          <table v-if="learnedSpellRows.length > 0" class="spell-table">
            <thead>
              <tr>
                <th>{{ UI.colLevel }}</th>
                <th>{{ UI.labelName }}</th>
                <th>{{ UI.colGroup }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in learnedSpellRows" :key="row.id">
                <td class="col-level">{{ row.level }}</td>
                <td>{{ row.name }}</td>
                <td>{{ row.spellGroup }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty-hint">{{ UI.emptySpellsLearned }}</p>
        </section>

        <!-- ── Neuen Zauberspruch lernen ── -->
        <section>
          <h2>{{ UI.spellsLearnNew }}</h2>
          <table class="spell-table">
            <thead>
              <tr>
                <th>{{ UI.colLevel }}</th>
                <th>{{ UI.labelName }}</th>
                <th>{{ UI.colGroup }}</th>
                <th>{{ UI.colCost }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in learnableSpellRows" :key="row.spell.id">
                <td class="col-level">{{ row.spell.level }}</td>
                <td>{{ row.spell.name }}</td>
                <td>{{ row.spell.spellGroup }}</td>
                <td>{{ row.cost }} {{ UI.unitEp }}</td>
                <td>
                  <button
                    :disabled="!row.canAfford || pendingAction !== null"
                    @click="requestLearn(row.spell)"
                  >
                    {{ UI.learnBtn }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

      </template>

    </template>
  </main>
</template>

<style scoped>
.spells-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem;
  font-family: sans-serif;
}

.status { color: #555; }
.status.error { color: #c00; }

.char-header {
  margin-bottom: 1.5rem;
}

.char-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.char-header-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.char-header-title h1 { margin: 0; }

.grad-badge {
  background: #2a4a7a;
  color: #fff;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.85em;
  font-weight: 600;
  white-space: nowrap;
}

.sheet-nav {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-nav {
  padding: 0.3rem 0.75rem;
  background: #fff;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.85em;
}

.btn-nav:hover { background: #f0f0f0; }

.ep-balance {
  margin: 0.4rem 0 0;
  color: #444;
}

.not-caster {
  color: #888;
  font-style: italic;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-box {
  background: #fffbe6;
  border: 1px solid #e6c800;
  border-radius: 6px;
  padding: 1.5rem 1.75rem;
  max-width: 480px;
  width: 90%;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
}

.modal-box p {
  margin: 0 0 0.75rem;
}

.gold-cost-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-size: 0.9em;
  color: #555;
}

.gs-input {
  width: 5rem;
  padding: 0.25rem 0.4rem;
  border: 1px solid #aaa;
  border-radius: 3px;
  font-size: 1rem;
  text-align: right;
}

.ep-after { color: #555; font-size: 0.9em; }

.confirmation-buttons {
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

.btn-confirm:disabled {
  background: #aaa;
  cursor: default;
}

.btn-cancel {
  background: #888;
  color: #fff;
  border: none;
  padding: 0.4rem 1rem;
  border-radius: 3px;
  cursor: pointer;
}

section {
  margin-bottom: 2rem;
}

section h2 {
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #555;
  margin: 0 0 0.75rem;
}

.spell-table {
  width: 100%;
  border-collapse: collapse;
}

.spell-table th,
.spell-table td {
  text-align: left;
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid #eee;
  font-size: 0.9em;
}

.spell-table th { background: #f0f0f0; }

.col-level {
  text-align: center;
  width: 3.5rem;
}

.empty-hint {
  color: #888;
  font-size: 0.9em;
  font-style: italic;
}
</style>
