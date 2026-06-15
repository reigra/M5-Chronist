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
import type { SkillRulesConfig } from '../types/SkillRules'
// import skillRulesData from '../config/skillRules.json'

// const skillRules = skillRulesData as SkillRulesConfig

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
 * isMultiInstance flags a learn action that requires an instance combobox.
 * instanceId carries the full instance key (e.g. "Sprache:Albisch") for advances.
 * ppUsed records how many PP were consumed to reduce the cost.
 * teCost is the raw TE cost before PP reduction.
 */
interface PendingAction {
  type: 'learn' | 'advance'
  skill: Skill
  cost: number
  originalCost?: number
  goldCost: number
  currentValue?: number
  isMultiInstance?: boolean
  instanceId?: string
  ppUsed?: number
  teCost?: number
}

const pendingAction = ref<PendingAction | null>(null)

/** Gewählte Spezialisierung beim Lernen eines Multi-Instanz-Skills. */
const selectedInstance = ref<string>('')

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
 * Multi-Instanz-Skills (z. B. "Sprache:Albisch") werden über skillRules auf
 * den Basis-Skill aufgelöst; instanceId wird für requestAdvance mitgeführt.
 * Grad-basierte Skills zeigen nur einen Hinweis auf den nächsten FW-Anstieg.
 */
const knownSkillRows = computed(() => {
  const char = character.value
  const r = rules.value
  const type = charType.value
  const currentGrad = grad.value
  if (!char || !r || !type || !r.skillRules) return []
  const sr = r.skillRules as SkillRulesConfig
  return char.skills
    .map(cs => {
      // Reguläre Fertigkeit oder Multi-Instanz-Fertigkeit (z. B. "Sprache:Albisch")
      let skill = r.skills.find(s => s.id === cs.skillId)
      let instanceId: string | null = null
      let displayName: string | null = null

      if (!skill) {
        const multiRule = sr.multiInstanceSkills.find(m => cs.skillId.startsWith(m.idPrefix))
        if (multiRule) {
          skill = r.skills.find(s => s.id === multiRule.baseSkillId)
          instanceId = cs.skillId
          // "Sprache:Albisch" → "Sprache: Albisch"
          displayName = cs.skillId.replace(':', ': ')
        }
      }

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

      const pp = cs.pp ?? 0
      const teCost = (!isGradBased && !isNotAdvanceable && skill.advancementCosts) ? (skill.advancementCosts[cs.value - skill.baseValue] ?? 0) : 0
      const cost = (isGradBased || isNotAdvanceable) ? null : advancementService.advanceCost(skill, cs.value, type, rules.value?.costPatterns, rules.value?.costColumns, pp)
      const costWithoutPp = (isGradBased || isNotAdvanceable || pp === 0 || cost === null) ? null : advancementService.advanceCost(skill, cs.value, type, rules.value?.costPatterns, rules.value?.costColumns, 0)
      const maxValue = skill.maxValue ?? null
      return {
        skillId: cs.skillId,
        name: displayName ?? skill.name,
        value: cs.value,
        maxValue,
        isMaxed: maxValue !== null && cs.value >= maxValue,
        cost,
        pp,
        teCost,
        costWithoutPp,
        canAdvance: cost !== null && char.availableEp >= cost,
        isGradBased,
        isNotAdvanceable,
        nextGradHint,
        skill,
        instanceId,
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
    .filter(s => !knownIds.has(s.id) && s.typ !== 'Waffenfertigkeit' && s.id !== 'Zaubersprüche' && !s.gradValues?.length && (Array.isArray(s.groups) && s.groups.length > 0 || s.costPatternId !== undefined))
    .map(skill => {
      const cost = advancementService.learnCost(skill, type, rules.value?.costPatterns, rules.value?.costColumns)
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

const learnableWeaponRows = computed(() => {
  const char = character.value
  const r = rules.value
  const type = charType.value
  if (!char || !r || !type) return []

  const knownIds = new Set(char.skills.map(s => s.skillId))

  return r.skills
    .filter(s => !knownIds.has(s.id) && s.typ === 'Waffenfertigkeit' && !s.gradValues?.length)
    .map(skill => {
      const cost = advancementService.learnCost(skill, type, rules.value?.costPatterns, rules.value?.costColumns)
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

/**
 * Verfügbare Spezialisierungen für den Instanz-Dialog beim Lernen.
 * Liefert alle möglichen Instanzen des gewählten Multi-Instanz-Skills,
 * abzüglich der bereits gelernten.
 */
const pendingInstanceOptions = computed(() => {
  const action = pendingAction.value
  const r = rules.value
  const char = character.value
  if (!action?.isMultiInstance || !r || !char || !r.skillRules) return []
  const skillRules = r.skillRules as SkillRulesConfig
  const multiRule = skillRules.multiInstanceSkills.find(m => m.baseSkillId === action.skill.id)
  if (!multiRule) return []

  // Bereits gelernte Spezialisierungen dieser Fertigkeit (nur der Teil nach dem Doppelpunkt)
  const learnedInstances = new Set(
    char.skills
      .filter(s => s.skillId.startsWith(multiRule.idPrefix))
      .map(s => s.skillId.slice(multiRule.idPrefix.length))
  )

  let allOptions: string[]
  const src = multiRule.instanceSource
  if (src.type === 'fixed') {
    allOptions = src.values
  } else {
    // Aus rules-Tabelle laden: z. B. rules.languages oder rules.scripts
    const table = (r as Record<string, unknown>)[src.rulesKey] as Array<Record<string, unknown>>
    allOptions = (table ?? []).map(item => String(item[src.nameField]))
  }

  return allOptions.filter(opt => !learnedInstances.has(opt))
})

/**
 * Stage a "learn skill" action for confirmation.
 * Bei Multi-Instanz-Skills wird zusätzlich die Instanz-Combobox eingeblendet.
 * @param skill - The skill the player wants to learn.
 */
function requestLearn(skill: Skill): void {
  const type = charType.value
  if (!type || !rules.value || !rules.value.skillRules) return
  const cost = advancementService.learnCost(skill, type, rules.value?.costPatterns, rules.value?.costColumns)
  const goldCost = skill.learnCost * 200
  const isMultiInstance = rules.value.skillRules.multiInstanceSkills.some(m => m.baseSkillId === skill.id)
  selectedInstance.value = ''
  pendingAction.value = { type: 'learn', skill, cost, goldCost, isMultiInstance }
}

/**
 * Stage an "advance skill" action for confirmation.
 * @param skill        - The skill to advance.
 * @param currentValue - The character's current FW for this skill.
 * @param instanceId   - Optional: die vollständige Instanz-ID bei Multi-Instanz-Skills.
 */
function requestAdvance(skill: Skill, currentValue: number, instanceId?: string): void {
  const type = charType.value
  if (!type) return
  const charSkill = character.value?.skills.find(s => s.skillId === (instanceId ?? skill.id))
  const pp = charSkill?.pp ?? 0
  const stepIndex = currentValue - skill.baseValue
  const teCost = skill.advancementCosts[stepIndex] ?? 0
  const ppUsed = Math.min(teCost, pp)
  const cost = advancementService.advanceCost(skill, currentValue, type, rules.value?.costPatterns, rules.value?.costColumns, pp)
  if (cost === null) return
  const originalCost = advancementService.advanceCost(skill, currentValue, type, rules.value?.costPatterns, rules.value?.costColumns, 0)
  const goldCost = (teCost - ppUsed) * 20
  pendingAction.value = { type: 'advance', skill, cost, originalCost: originalCost ?? cost, goldCost, currentValue, instanceId, ppUsed, teCost }
}

/** Discard the staged action without making any changes. */
function cancelAction(): void {
  pendingAction.value = null
  selectedInstance.value = ''
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
  if (!action || !char || !type || !rules.value || !rules.value.skillRules) return

  try {
    let updated: Character
      if (action.type === 'learn') {
        if (action.isMultiInstance) {
          const multiRule = rules.value.skillRules.multiInstanceSkills.find(m => m.baseSkillId === action.skill.id)
          if (!multiRule || !selectedInstance.value) return
          const fullId = multiRule.idPrefix + selectedInstance.value
          updated = advancementService.learnSkillInstance(char, action.skill, fullId, type, rules.value?.costPatterns, rules.value?.costColumns)
        } else {
          updated = advancementService.learnSkill(char, action.skill, type, rules.value?.costPatterns, rules.value?.costColumns)
        }
      } else {
        if (action.instanceId) {
          updated = advancementService.advanceSkillInstance(char, action.skill, action.instanceId, type, rules.value?.costPatterns, rules.value?.costColumns)
        } else {
          updated = advancementService.advanceSkill(char, action.skill, type, rules.value?.costPatterns, rules.value?.costColumns)
        }
      }

    updated = { ...updated, gold: (updated.gold ?? 0) - action.goldCost }

    await characterStorage.save(updated)
    character.value = updated
    pendingAction.value = null
    selectedInstance.value = ''
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'An error occurred.'
    pendingAction.value = null
    selectedInstance.value = ''
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
            <button v-if="charType?.spellCosts && Object.keys(charType.spellCosts).length > 0" type="button" class="btn-nav" @click="router.push({ name: 'spells', params: { id: character.id } })">{{ UI.spells }}</button>
            <button type="button" class="btn-nav" @click="router.push({ name: 'character-edit', params: { id: character.id } })">{{ UI.navEdit }}</button>
          </nav>
        </div>
        <p class="ep-balance">
          {{ UI.epAvailable }} <strong>{{ character.availableEp }}</strong>
          / {{ character.totalEs }} {{ UI.esTotal }}
          &nbsp;| {{ UI.labelGold }} <strong>{{ character.gold ?? 0 }}</strong>
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

      <!-- ── Confirmation modal ── -->
      <div v-if="pendingAction !== null" class="modal-overlay" @click.self="cancelAction">
        <div class="modal-box">
          <template v-if="pendingAction.type === 'learn'">
            <p>
              {{ UI.confirmLearnPfx }}
              <strong>
                {{ pendingAction.skill.name }}<template v-if="pendingAction.isMultiInstance && selectedInstance"> ({{ selectedInstance }})</template>
              </strong>
              <template v-if="!pendingAction.isMultiInstance">
                ({{ UI.colBaseFw }} {{ pendingAction.skill.baseValue }})
              </template>
              {{ UI.confirmFor }} <strong>{{ pendingAction.cost }} {{ UI.unitEp }}</strong>?
            </p>
            <div v-if="pendingAction.isMultiInstance" class="instance-select-row">
              <label class="instance-label">{{ UI.advChooseInstance }}</label>
              <select v-model="selectedInstance" class="instance-select">
                <option value="">{{ UI.advChoosePlaceholder }}</option>
                <option v-for="opt in pendingInstanceOptions" :key="opt" :value="opt">{{ opt }}</option>
              </select>
            </div>
            <label class="gold-cost-row">
              {{ UI.advGoldLearnCost }}
              <input v-model.number="pendingAction.goldCost" type="number" min="0" class="gs-input" />
            </label>
          </template>
          <template v-else>
            <p>
              {{ UI.confirmAdvancePfx }}
              <strong>
                <template v-if="pendingAction.instanceId">{{ pendingAction.instanceId.replace(':', ': ') }}</template>
                <template v-else>{{ pendingAction.skill.name }}</template>
              </strong>
              {{ UI.advFromFw }} {{ pendingAction.currentValue }}
              {{ UI.advToFw }} {{ (pendingAction.currentValue ?? 0) + 1 }}
              {{ UI.confirmFor }} <strong>{{ pendingAction.cost }} {{ UI.unitEp }}</strong>.
            </p>
            <p v-if="(pendingAction.ppUsed ?? 0) > 0" class="pp-used-note">
              PP genutzt: {{ pendingAction.ppUsed }} (spart {{ (pendingAction.originalCost ?? pendingAction.cost) - pendingAction.cost }} EP)
            </p>
            <label class="gold-cost-row">
              {{ UI.advGoldAdvanceCost }}
              <input v-model.number="pendingAction.goldCost" type="number" min="0" class="gs-input" />
            </label>
          </template>
          <div class="confirmation-buttons">
            <button
              class="btn-confirm"
              :disabled="(pendingAction.isMultiInstance && !selectedInstance) || (character.gold ?? 0) < pendingAction.goldCost"
              @click="confirmAction"
            >{{ UI.confirm }}</button>
            <button class="btn-cancel" @click="cancelAction">{{ UI.cancel }}</button>
          </div>
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
              <th>{{ UI.colPp }}</th>
              <th>{{ UI.colNextCost }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in knownSkillRows" :key="row.skillId">
              <td>{{ row.name }}</td>
              <td>{{ row.value }}</td>
              <td class="pp-cell">
                <template v-if="!row.isGradBased && !row.isNotAdvanceable">{{ row.pp }}</template>
              </td>
              <td>
                <template v-if="row.isGradBased">
                  <span class="tag-grad-based">{{ UI.advGradBased }}</span>
                </template>
                <template v-else-if="row.isNotAdvanceable">
                  <span class="tag-not-advanceable">{{ UI.advNotAdvanceable }}</span>
                </template>
                <template v-else>
                  <template v-if="row.isMaxed">{{ UI.notApplicable }}</template>
                  <template v-else>
                    <template v-if="row.pp > 0 && row.costWithoutPp !== null">
                      <span class="cost-strikethrough">{{ row.costWithoutPp }} {{ UI.unitEp }}</span>
                      <span class="cost-pp-reduced">&nbsp;{{ row.cost }} {{ UI.unitEp }}</span>
                    </template>
                    <template v-else>
                      {{ row.cost }} {{ UI.unitEp }}
                    </template>
                  </template>
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
                    @click="requestAdvance(row.skill, row.value, row.instanceId ?? undefined)"
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

      <!-- ── Learn New Weapon Skill ── -->
      <section v-if="learnableWeaponRows.length > 0">
        <h2>{{ UI.advLearnWeaponSkill }}</h2>
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
            <tr v-for="row in learnableWeaponRows" :key="row.skillId">
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

      <!-- ── Learn New Skill ── -->
      <section v-if="learnableSkillRows.length > 0">
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

.instance-select-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.instance-label {
  font-weight: 600;
  white-space: nowrap;
}

.instance-select {
  flex: 1;
  max-width: 20rem;
  padding: 0.3rem 0.5rem;
  border: 1px solid #aaa;
  border-radius: 3px;
  font-size: 1rem;
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

.pp-cell {
  text-align: center;
}

.cost-strikethrough {
  text-decoration: line-through;
  color: #999;
  font-size: 0.85em;
}

.cost-pp-reduced {
  color: #2a7a2a;
  font-weight: 600;
}

.pp-used-note {
  font-size: 0.9em;
  color: #2a7a2a;
  font-style: italic;
}
</style>

