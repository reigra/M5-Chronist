<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RulesLoader } from '../services/RulesLoader'
import { characterStorage } from '../services/CharacterStorage'
import { advancementService } from '../services/AdvancementService'
import { computeGrad } from '../services/GradUtils'
import { UI } from '../constants/ui'
import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { Skill } from '../types/Skill'

// ── State ────────────────────────────────────────────────────────────────────

const route = useRoute()
const router = useRouter()

const character = ref<Character | null>(null)
const rules = ref<RulesData | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)

/**
 * A pending action holds everything needed to show the cost preview and
 * execute the action on confirmation. currentValue is only set for 'advance'.
 */
interface PendingAction {
  type: 'learn' | 'advance'
  skill: Skill
  cost: number
  currentValue?: number
}

const pendingAction = ref<PendingAction | null>(null)

/** Amount to add in the "Add EP" form. */
const epToAdd = ref(1)

/** Whether the current browser supports the File System Access API. */
// ── Computed ─────────────────────────────────────────────────────────────────

/** Current Grad derived from totalEs. */
const grad = computed(() =>
  character.value ? computeGrad(character.value.totalEs) : 0,
)

/**
 * The character's type from the loaded rules.
 * Used to calculate EP costs via groupCosts.
 */
const charType = computed(() => {
  const char = character.value
  const r = rules.value
  if (!char || !r) return null
  return r.types.find(t => t.id === char.typeId) ?? null
})

/**
 * Known skills — each rule Skill paired with the character's current FW
 * and the EP cost for the next advancement step.
 * For grad-based skills (gradValues present), no EP advancement is possible —
 * instead a hint is shown about when the FW can next increase.
 */
const knownSkillRows = computed(() => {
  const char = character.value
  const r = rules.value
  const type = charType.value
  const currentGrad = grad.value
  if (!char || !r || !type) return []

  return char.skills
    .map(cs => {
      const skill = r.skills.find(s => s.id === cs.skillId)
      if (!skill) return null

      // Grad-basierte Fertigkeit (Abwehr, Resistenz, Zaubern): kein EP-Steigern
      const isGradBased = Array.isArray(skill.gradValues) && skill.gradValues.length > 0

      // Fertigkeit ohne Steigerungstabelle (z.B. angeborene Fertigkeiten): nicht steigerbar
      const isNotAdvanceable = !isGradBased && (!skill.advancementCosts || skill.advancementCosts.length === 0)

      // Nächste erreichbare Steigerung anzeigen (informativer Hinweis)
      let nextGradHint: string | null = null
      if (isGradBased && skill.gradValues) {
        const next = skill.gradValues.find(gv => gv.grad > currentGrad)
        if (next) {
          nextGradHint = `FW ${next.fw} bei Grad ${next.grad}`
        }
      }

      const cost = (isGradBased || isNotAdvanceable) ? null : advancementService.advanceCost(skill, cs.value, type)
      const maxValue = skill.maxValue ?? null
      return {
        skillId: cs.skillId,
        name: skill.name,
        value: cs.value,
        maxValue,
        isMaxed: maxValue !== null && cs.value >= maxValue,
        cost,
        canAdvance: cost !== null && char.availableEp >= cost,
        isGradBased,
        isNotAdvanceable,
        nextGradHint,
        skill,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
})

/**
 * Skills from the rules that the character has NOT yet learned,
 * sorted alphabetically, each with its EP learn cost.
 */
const learnableSkillRows = computed(() => {
  const char = character.value
  const r = rules.value
  const type = charType.value
  if (!char || !r || !type) return []

  const knownIds = new Set(char.skills.map(s => s.skillId))

  return r.skills
    .filter(s => !knownIds.has(s.id) && s.id !== 'Zaubersprüche' && Array.isArray(s.groups) && s.groups.length > 0 && !s.gradValues?.length)
    .map(skill => {
      const cost = advancementService.learnCost(skill, type)
      return {
        skillId: skill.id,
        name: skill.name,
        baseValue: skill.baseValue,
        cost,
        canAfford: char.availableEp >= cost,
        skill,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
})

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Stage a "learn skill" action for confirmation.
 * @param skill - The skill the player wants to learn.
 */
function requestLearn(skill: Skill): void {
  const type = charType.value
  if (!type) return
  pendingAction.value = {
    type: 'learn',
    skill,
    cost: advancementService.learnCost(skill, type),
  }
}

/**
 * Stage an "advance skill" action for confirmation.
 * @param skill        - The skill to advance.
 * @param currentValue - The character's current FW for this skill.
 */
function requestAdvance(skill: Skill, currentValue: number): void {
  const type = charType.value
  if (!type) return
  const cost = advancementService.advanceCost(skill, currentValue, type)
  if (cost === null) return
  pendingAction.value = { type: 'advance', skill, cost, currentValue }
}

/** Discard the staged action without making any changes. */
function cancelAction(): void {
  pendingAction.value = null
}

/**
 * Add earned EP to the character.
 * Both availableEp and totalEs increase by the same amount.
 */
async function addEp(): Promise<void> {
  const char = character.value
  if (!char) return
  const amount = epToAdd.value
  if (!Number.isInteger(amount) || amount < 1) return

  const updated: Character = {
    ...char,
    availableEp: char.availableEp + amount,
    totalEs: char.totalEs + amount,
    updatedAt: new Date().toISOString(),
  }

  try {
    await characterStorage.save(updated)
    character.value = updated
    epToAdd.value = 1
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to save.'
  }
}

/**
 * Execute the staged action: apply the change, save to IndexedDB, update the view.
 */
async function confirmAction(): Promise<void> {
  const action = pendingAction.value
  const char = character.value
  const type = charType.value
  if (!action || !char || !type) return

  try {
    const updated =
      action.type === 'learn'
        ? advancementService.learnSkill(char, action.skill, type)
        : advancementService.advanceSkill(char, action.skill, type)

    await characterStorage.save(updated)
    character.value = updated
    pendingAction.value = null
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'An error occurred.'
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
      errorMessage.value = `Character "${id}" not found in storage.`
      return
    }

    rules.value = loadedRules
    character.value = loadedChar

    if (!charType.value) {
      errorMessage.value =
        `Type "${loadedChar.typeId}" was not found in the rules. ` +
        `Check that the character's typeId matches a type in the data files.`
    }
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to load data.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="advancement">

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
            <button v-if="charType?.category === 'KampfZauberer' || charType?.category === 'Zauberer'" type="button" class="btn-nav" @click="router.push({ name: 'spells', params: { id: character.id } })">{{ UI.spells }}</button>
            <button type="button" class="btn-nav" @click="router.push({ name: 'character-edit', params: { id: character.id } })">{{ UI.navEdit }}</button>
          </nav>
        </div>
        <p class="ep-balance">
          {{ UI.epAvailable }} <strong>{{ character.availableEp }}</strong>
          / {{ character.totalEs }} {{ UI.esTotal }}
        </p>
      </header>

      <!-- ── Add EP ── -->
      <section class="add-ep-section">
        <h2>{{ UI.advAddEp }}</h2>
        <div class="add-ep-form">
          <input
            v-model.number="epToAdd"
            type="number"
            min="1"
            class="ep-input"
          />
          <button
            class="btn-confirm"
            :disabled="epToAdd < 1 || pendingAction !== null"
            @click="addEp"
          >
            {{ UI.advAddEp }}
          </button>
        </div>
      </section>

      <!-- ── Confirmation panel ── -->
      <div v-if="pendingAction !== null" class="confirmation">
        <template v-if="pendingAction.type === 'learn'">
          <p>
            {{ UI.confirmLearnPfx }} <strong>{{ pendingAction.skill.name }}</strong>
            ({{ UI.colBaseFw }} {{ pendingAction.skill.baseValue }})
            {{ UI.confirmFor }} <strong>{{ pendingAction.cost }} {{ UI.unitEp }}</strong>?
          </p>
        </template>
        <template v-else>
          <p>
            {{ UI.confirmAdvancePfx }} <strong>{{ pendingAction.skill.name }}</strong>
            {{ UI.advFromFw }} {{ pendingAction.currentValue }}
            {{ UI.advToFw }} {{ (pendingAction.currentValue ?? 0) + 1 }}
            {{ UI.confirmFor }} <strong>{{ pendingAction.cost }} {{ UI.unitEp }}</strong>?
          </p>
        </template>
        <div class="confirmation-buttons">
          <button class="btn-confirm" @click="confirmAction">{{ UI.confirm }}</button>
          <button class="btn-cancel" @click="cancelAction">{{ UI.cancel }}</button>
        </div>
      </div>

      <!-- ── Known Skills ── -->
      <section>
        <h2>{{ UI.advKnownSkills }}</h2>
        <table>
          <thead>
            <tr>
              <th>{{ UI.colSkill }}</th>
              <th>{{ UI.colFw }}</th>
              <th>{{ UI.colNextCost }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in knownSkillRows" :key="row.skillId">
              <td>{{ row.name }}</td>
              <td>{{ row.value }}</td>
              <td>
                <template v-if="row.isGradBased">
                  <span class="tag-grad-based">{{ UI.advGradBased }}</span>
                </template>
                <template v-else-if="row.isNotAdvanceable">
                  <span class="tag-not-advanceable">{{ UI.advNotAdvanceable }}</span>
                </template>
                <template v-else>
                  {{ row.isMaxed ? UI.notApplicable : row.cost + ' ' + UI.unitEp }}
                </template>
              </td>
              <td>
                <template v-if="row.isGradBased">
                  <span v-if="row.nextGradHint" class="hint-grad">{{ row.nextGradHint }}</span>
                  <span v-else class="tag-max">{{ UI.advMaxTag }}</span>
                </template>
                <template v-else-if="row.isNotAdvanceable">
                </template>
                <template v-else>
                  <button
                    v-if="!row.isMaxed"
                    :disabled="!row.canAdvance || pendingAction !== null"
                    @click="requestAdvance(row.skill, row.value)"
                  >
                    {{ UI.advAdvanceBtn }}
                  </button>
                  <span v-else class="tag-max">{{ UI.advMaxTag }}</span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- ── Learn New Skill ── -->
      <section>
        <h2>{{ UI.advLearnNewSkill }}</h2>
        <table>
          <thead>
            <tr>
              <th>{{ UI.colSkill }}</th>
              <th>{{ UI.colBaseFw }}</th>
              <th>{{ UI.colCost }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in learnableSkillRows" :key="row.skillId">
              <td>{{ row.name }}</td>
              <td>{{ row.baseValue }}</td>
              <td>{{ row.cost }} {{ UI.unitEp }}</td>
              <td>
                <button
                  :disabled="!row.canAfford || pendingAction !== null"
                  @click="requestLearn(row.skill)"
                >
                  {{ UI.learnBtn }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

    </template>
  </main>
</template>

<style scoped>
.advancement {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem;
  font-family: sans-serif;
}

.status {
  padding: 1rem;
  color: #555;
}

.status.error {
  color: #c00;
}

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

.char-header-top h1 {
  margin: 0;
}

.btn-export {
  padding: 0.35rem 0.9rem;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
  background: #fff;
  white-space: nowrap;
}

.btn-export:hover:not(:disabled) {
  background: #f0f0f0;
}

.add-ep-section {
  margin-bottom: 2rem;
}

.add-ep-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ep-input {
  width: 5rem;
  padding: 0.3rem 0.5rem;
  border: 1px solid #aaa;
  border-radius: 3px;
  font-size: 1rem;
}

.ep-balance {
  margin: 0;
  color: #444;
}

.confirmation {
  background: #fffbe6;
  border: 1px solid #e6c800;
  border-radius: 4px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
}

.confirmation p {
  margin: 0 0 0.75rem;
}

.confirmation-buttons {
  display: flex;
  gap: 0.5rem;
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

section {
  margin-bottom: 2rem;
}

section h2 {
  margin-bottom: 0.75rem;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  text-align: left;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid #ddd;
}

th {
  background: #f5f5f5;
  font-weight: 600;
}

button {
  padding: 0.3rem 0.75rem;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
  background: #fff;
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tag-max {
  color: #888;
  font-size: 0.85em;
}

/* Hinweis für grad-basierte Fertigkeiten (Abwehr, Resistenz, Zaubern) */
.tag-grad-based {
  color: #8888bb;
  font-size: 0.8em;
  font-style: italic;
}

/* Hinweis für nicht steigerbare Fertigkeiten (keine advancementCosts) */
.tag-not-advanceable {
  color: #888888;
  font-size: 0.8em;
  font-style: italic;
}

.hint-grad {
  color: #7ab87a;
  font-size: 0.85em;
}
</style>

