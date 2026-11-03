<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { characterLoadService } from '../services/CharacterLoadService'
import { characterStorage } from '../services/CharacterStorage'
import { characterValidator } from '../services/CharacterValidator'
import { advancementService } from '../services/AdvancementService'
import { computeGrad } from '../services/GradUtils'
import { gradUpService } from '../services/GradUpService'
import { canLearnTechniques } from '../services/CharacterService'
import type { GradStepInput } from '../services/GradUpService'
import GradUpPopup from '../components/GradUpPopup.vue'
import AdvancementModeToggle from '../components/AdvancementModeToggle.vue'
import { UI } from '../constants/ui'
import { useNotifications } from '../composables/useNotifications'
import { useAdvancementMode } from '../composables/useAdvancementMode'
import type { AdvancementMode } from '../types/Advancement'
import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { Skill } from '../types/Skill'
import type { ValidationResult } from '../types/CharacterValidation'
import type { SkillRulesConfig } from '../types/SkillRules'
// import skillRulesData from '../config/skillRules.json'

// const skillRules = skillRulesData as SkillRulesConfig

// ── State ────────────────────────────────────────────────────────────────────

const route = useRoute()
const router = useRouter()

const character = ref<Character | null>(null)
const rules = ref<RulesData | null>(null)
const loading = ref(true)
const loadError = ref(false)
const { error, ok } = useNotifications()
/** Page-level cost mode (Normal / Belohnung), shared with SpellsView. */
const { advancementMode: pageMode } = useAdvancementMode()
const validationResult = ref<ValidationResult | null>(null)
const validationExpanded = ref(false)
const autoFixing = ref(false)

const hasAutoFixableIssues = computed(() => {
  return (validationResult.value?.hasErrors || validationResult.value?.hasWarnings) ?? false
})

/**
 * A pending action holds everything needed to show the cost preview and
 * execute the action on confirmation. currentValue is only set for 'advance'.
 * isMultiInstance flags a learn action that requires an instance combobox.
 * instanceId carries the full instance key (e.g. "Sprache:Albisch") for advances.
 * ppUsed records how many PP were consumed to reduce the cost.
 * teCost is the raw TE cost before PP reduction.
 * mode is the cost mode of this action; it starts with the page mode and can be
 * switched in the modal without affecting the page.
 */
interface PendingAction {
  type: 'learn' | 'advance'
  mode: AdvancementMode
  skill: Skill
  cost: number
  originalCost?: number
  goldCost: number
  epToPayWithGold: number
  maxGoldEp: number
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

// ── GradUp Popup State ──────────────────────────────────────────────────────────

/** Zeigt das Gradaufstiegs-Popup an. */
const showGradUp = ref(false)
/** Anzahl der Gradschritte für das Popup. */
const gradUpSteps = ref(0)
/** Character-Zwischenstand nach EP-Hinzufügen, aber vor Gradschritten. */
const gradUpChar = ref<Character | null>(null)

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

/** True if the type has fightCosts and matching techniques are loaded. */
const canLearnTech = computed(() => canLearnTechniques(charType.value ?? undefined, rules.value?.techniques))

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
  const mode = pageMode.value
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
      const cost = (isGradBased || isNotAdvanceable) ? null : advancementService.advanceCost(skill, cs.value, type, rules.value?.costPatterns, rules.value?.costColumns, pp, mode)
      const costWithoutPp = (isGradBased || isNotAdvanceable || pp === 0 || cost === null) ? null : advancementService.advanceCost(skill, cs.value, type, rules.value?.costPatterns, rules.value?.costColumns, 0, mode)
      const maxValue = skill.maxValue ?? null
      const ppUsed = Math.min(teCost, pp)
      const fixedGoldCost = advancementService.advanceGoldCost(teCost - ppUsed, mode)
      return {
        skillId: cs.skillId,
        name: displayName ?? skill.name,
        value: cs.value,
        maxValue,
        isMaxed: maxValue !== null && cs.value >= maxValue,
        cost,
        pp,
        teCost,
        fixedGoldCost,
        costWithoutPp,
        // Belohnung: kein EP-Ersatz durch Gold, daher nur EP prüfen
        canAdvance: cost !== null && (
          char.availableEp >= cost ||
          (mode === 'normal' && char.availableEp >= Math.ceil(cost / 2) && (char.gold ?? 0) >= fixedGoldCost)
        ),
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
 * Build a "learn skill" action for the given cost mode.
 * @param skill - The skill the player wants to learn.
 * @param mode  - Cost mode (Normal / Belohnung).
 * @returns The pending action, or null if type or rules are missing.
 */
function buildLearnAction(skill: Skill, mode: AdvancementMode): PendingAction | null {
  const type = charType.value
  if (!type || !rules.value || !rules.value.skillRules) return null
  const cost = advancementService.learnCost(skill, type, rules.value?.costPatterns, rules.value?.costColumns)
  const goldCost = advancementService.learnGoldCost(skill, mode)
  const isMultiInstance = rules.value.skillRules.multiInstanceSkills.some(m => m.baseSkillId === skill.id)
  return { type: 'learn', mode, skill, cost, goldCost, epToPayWithGold: 0, maxGoldEp: 0, isMultiInstance }
}

/**
 * Build an "advance skill" action for the given cost mode.
 * @param skill        - The skill to advance.
 * @param currentValue - The character's current FW for this skill.
 * @param instanceId   - Optional: die vollständige Instanz-ID bei Multi-Instanz-Skills.
 * @param mode         - Cost mode (Normal / Belohnung).
 * @returns The pending action, or null if the skill cannot be advanced.
 */
function buildAdvanceAction(skill: Skill, currentValue: number, instanceId: string | undefined, mode: AdvancementMode): PendingAction | null {
  const type = charType.value
  if (!type) return null
  const charSkill = character.value?.skills.find(s => s.skillId === (instanceId ?? skill.id))
  const pp = charSkill?.pp ?? 0
  const stepIndex = currentValue - skill.baseValue
  const teCost = skill.advancementCosts[stepIndex] ?? 0
  const ppUsed = Math.min(teCost, pp)
  const cost = advancementService.advanceCost(skill, currentValue, type, rules.value?.costPatterns, rules.value?.costColumns, pp, mode)
  if (cost === null) return null
  const originalCost = advancementService.advanceCost(skill, currentValue, type, rules.value?.costPatterns, rules.value?.costColumns, 0, mode)
  const goldCost = advancementService.advanceGoldCost(teCost - ppUsed, mode)
  const maxGoldEp = advancementService.maxGoldEp(cost, mode)
  return { type: 'advance', mode, skill, cost, originalCost: originalCost ?? cost, goldCost, epToPayWithGold: 0, maxGoldEp, currentValue, instanceId, ppUsed, teCost }
}

/**
 * Stage a "learn skill" action for confirmation, using the page mode.
 * Bei Multi-Instanz-Skills wird zusätzlich die Instanz-Combobox eingeblendet.
 * @param skill - The skill the player wants to learn.
 */
function requestLearn(skill: Skill): void {
  const action = buildLearnAction(skill, pageMode.value)
  if (!action) return
  selectedInstance.value = ''
  pendingAction.value = action
}

/**
 * Stage an "advance skill" action for confirmation, using the page mode.
 * @param skill        - The skill to advance.
 * @param currentValue - The character's current FW for this skill.
 * @param instanceId   - Optional: die vollständige Instanz-ID bei Multi-Instanz-Skills.
 */
function requestAdvance(skill: Skill, currentValue: number, instanceId?: string): void {
  const action = buildAdvanceAction(skill, currentValue, instanceId, pageMode.value)
  if (action) pendingAction.value = action
}

/**
 * Switch the cost mode of the staged action (modal toggle) and recalculate it.
 * The page mode and the selected instance stay unchanged; gold inputs reset to the new defaults.
 * @param mode - The new cost mode for this action.
 */
function switchPendingMode(mode: AdvancementMode): void {
  const action = pendingAction.value
  if (!action || action.mode === mode) return
  const rebuilt = action.type === 'learn'
    ? buildLearnAction(action.skill, mode)
    : buildAdvanceAction(action.skill, action.currentValue ?? 0, action.instanceId, mode)
  if (rebuilt) pendingAction.value = rebuilt
}

/** Limit the EP-to-gold replacement to the allowed maximum. */
function clampEpGold(action: PendingAction): void {
  if (action.epToPayWithGold > action.maxGoldEp) {
    action.epToPayWithGold = action.maxGoldEp
  }
}

/** Discard the staged action without making any changes. */
function cancelAction(): void {
  pendingAction.value = null
  selectedInstance.value = ''
}

/**
 * Add earned EP to the character.
 * Both availableEp and totalEs increase by the same amount.
 * If a Grad threshold is crossed, show the GradUp popup.
 */
async function addEp(): Promise<void> {
  const char = character.value
  if (!char || !rules.value) return
  const amount = epToAdd.value
  if (!Number.isInteger(amount) || amount < 1) return

  const oldGrad = computeGrad(char.totalEs)
  const newTotalEs = char.totalEs + amount
  const newGrad = computeGrad(newTotalEs)

  const updated: Character = {
    ...char,
    availableEp: char.availableEp + amount,
    totalEs: newTotalEs,
    updatedAt: new Date().toISOString(),
  }

  const steps = newGrad - oldGrad
  if (steps > 0) {
    // Grad-Sprung erkannt → Popup öffnen
    gradUpChar.value = updated
    gradUpSteps.value = steps
    showGradUp.value = true
  } else {
    // Kein Grad-Sprung → normal speichern
    try {
      await characterStorage.save(updated)
      character.value = updated
      epToAdd.value = 1
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to save.')
    }
  }
}

/**
 * Wird aufgerufen, wenn der Spieler das GradUp-Popup bestätigt.
 * Wendet die Gradschritte auf den Character an und speichert.
 */
async function onGradUpConfirm(inputs: GradStepInput[]): Promise<void> {
  const char = gradUpChar.value
  const r = rules.value
  if (!char || !r) return
  showGradUp.value = false

  try {
    const graded = gradUpService.applyGradSteps(char, r, inputs)
    await characterStorage.save(graded)
    character.value = graded
    epToAdd.value = 1
  } catch (e) {
    error(e instanceof Error ? e.message : 'Gradaufstieg fehlgeschlagen.')
  }
}

/**
 * Wird aufgerufen, wenn der Spieler das GradUp-Popup abbricht.
 * Speichert den Character mit den EP-Änderungen, aber ohne Gradschritte.
 */
async function onGradUpCancel(): Promise<void> {
  const char = gradUpChar.value
  if (!char) return
  showGradUp.value = false

  try {
    await characterStorage.save(char)
    character.value = char
    epToAdd.value = 1
  } catch (e) {
    error(e instanceof Error ? e.message : 'Failed to save.')
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
          updated = advancementService.advanceSkillInstance(char, action.skill, action.instanceId, type, rules.value?.costPatterns, rules.value?.costColumns, action.epToPayWithGold, action.mode)
        } else {
          updated = advancementService.advanceSkill(char, action.skill, type, rules.value?.costPatterns, rules.value?.costColumns, action.epToPayWithGold, action.mode)
        }
      }

    const epReplacementGold = action.mode === 'reward' ? 0 : action.epToPayWithGold * 10
    updated = { ...updated, gold: (updated.gold ?? 0) - action.goldCost - epReplacementGold }

    await characterStorage.save(updated)
    character.value = updated
    pendingAction.value = null
    selectedInstance.value = ''
  } catch (e) {
    error(e instanceof Error ? e.message : 'An error occurred.')
    pendingAction.value = null
    selectedInstance.value = ''
  }
}

const severityLabel = (severity: 'error' | 'warning' | 'info'): string => {
  if (severity === 'error') return UI.validationSeverityError
  if (severity === 'warning') return UI.validationSeverityWarning
  return UI.validationSeverityInfo
}

/** Korrigiert formel-basierte Werte (Boni, Skill-FWs, Grad-Werte). */
const runCorrection = async (): Promise<void> => {
  const c = character.value; const r = rules.value
  if (!c || !r) return
  autoFixing.value = true
  try {
    const result = characterValidator.correctIssues(c, r)
    await characterStorage.save(result.fixed)
    character.value = result.fixed
    const issues = characterValidator.validate(result.fixed, r)
    validationResult.value = issues
    ok(UI.validationAutoFixDone)
  } catch (e) {
    error(e instanceof Error ? e.message : 'Correction failed')
  } finally {
    autoFixing.value = false
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  try {
    const id = route.params.id as string
    const result = await characterLoadService.load(id)

    if (!result.character) {
      loadError.value = true
      error(`Character "${id}" not found in storage.`, null)
      return
    }

    rules.value = result.rules
    character.value = result.character
    validationResult.value = result.issues

    if (!charType.value) {
      error(
        `Type "${result.character.typeId}" was not found in the rules. ` +
        `Check that the character's typeId matches a type in the data files.`
      )
    }
  } catch (e) {
    loadError.value = true
    error(e instanceof Error ? e.message : 'Failed to load data.', null)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="advancement">

    <div v-if="loading" class="status">{{ UI.loading }}</div>
    <div v-else-if="loadError" class="status error">{{ UI.failedToLoad }}</div>

    <template v-else-if="character">

      <!-- ── Validation Banner ── -->
      <div v-if="validationResult && (validationResult.hasErrors || validationResult.hasWarnings)" class="validation-banner" :class="{ 'validation-banner--expanded': validationExpanded }">
        <button type="button" class="validation-banner-summary" @click="validationExpanded = !validationExpanded" :title="UI.validationClickForDetails">
          <span v-if="validationResult.hasErrors" class="validation-banner--error">
            {{ validationResult.issues.filter(i => i.severity === 'error').length }} {{ UI.validationErrors }}
          </span>
          <span v-if="validationResult.hasWarnings" class="validation-banner--warning">
            {{ validationResult.issues.filter(i => i.severity === 'warning').length }} {{ UI.validationWarnings }}
          </span>
          <span v-if="validationResult.issues.filter(i => i.severity === 'info').length" class="validation-banner--info">
            {{ validationResult.issues.filter(i => i.severity === 'info').length }} {{ UI.validationInfos }}
          </span>
          <span class="validation-banner-chevron">{{ validationExpanded ? '▲' : '▼' }}</span>
        </button>
        <div v-if="validationExpanded" class="validation-issue-list">
          <div v-for="(issue, idx) in validationResult.issues" :key="idx" class="validation-issue-item" :class="'validation-issue-item--' + issue.severity">
            <span class="validation-issue-severity">{{ severityLabel(issue.severity) }}:</span>
            <span class="validation-issue-message">{{ issue.message }}</span>
            <span v-if="issue.expected !== undefined || issue.actual !== undefined" class="validation-issue-detail">
              (erwartet: {{ issue.expected ?? '—' }}, Ist: {{ issue.actual ?? '—' }})
            </span>
          </div>
          <button v-if="hasAutoFixableIssues" type="button" class="btn-auto-fix" :disabled="autoFixing" @click="runCorrection">
            {{ autoFixing ? UI.loading : UI.validationAutoFix }}
          </button>
        </div>
      </div>

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
            <button v-if="canLearnTech" type="button" class="btn-nav" @click="router.push({ name: 'techniques', params: { id: character.id } })">{{ UI.techniques }}</button>
            <button type="button" class="btn-nav" @click="router.push({ name: 'character-edit', params: { id: character.id } })">{{ UI.navEdit }}</button>
          </nav>
        </div>
        <div class="ep-balance-row">
          <p class="ep-balance">
            {{ UI.epAvailable }} <strong>{{ character.availableEp }}</strong>
            / {{ character.totalEs }} {{ UI.esTotal }}
            &nbsp;| {{ UI.labelGold }} <strong>{{ character.gold ?? 0 }}</strong>
          </p>
          <AdvancementModeToggle v-model="pageMode" />
        </div>
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

      <!-- ── GradUp Popup ── -->
      <GradUpPopup
        v-if="showGradUp && gradUpChar && rules"
        :character="gradUpChar"
        :rules="rules"
        :steps="gradUpSteps"
        @confirm="onGradUpConfirm"
        @cancel="onGradUpCancel"
      />

      <!-- ── Confirmation modal ── -->
      <div v-if="pendingAction !== null" class="modal-overlay" @click.self="cancelAction">
        <div class="modal-box">
          <div class="modal-mode-row">
            <AdvancementModeToggle :model-value="pendingAction.mode" @update:model-value="switchPendingMode" />
          </div>
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
            <template v-if="pendingAction.mode === 'normal'">
              <label class="gold-cost-row">
                {{ UI.advGoldEpReplacement }}
                 <input v-model.number="pendingAction.epToPayWithGold" type="number" min="0" :max="pendingAction.maxGoldEp" class="gs-input" @input="clampEpGold(pendingAction)" />
                <span class="gold-hint">(max. {{ pendingAction.maxGoldEp * 10 }} GS = {{ pendingAction.maxGoldEp }} EP)</span>
              </label>
              <p class="ep-breakdown">
                {{ UI.advGoldEpReplaced }} {{ pendingAction.epToPayWithGold }} {{ UI.unitEp }}
                &nbsp;({{ pendingAction.epToPayWithGold * 10 }} GS) &nbsp;|&nbsp;
                {{ UI.advEpAfterDeduction }} {{ pendingAction.cost - pendingAction.epToPayWithGold }} {{ UI.unitEp }}
              </p>
            </template>
          </template>
          <div class="confirmation-buttons">
            <button
              class="btn-confirm"
              :disabled="(pendingAction.isMultiInstance && !selectedInstance) || pendingAction.epToPayWithGold < 0 || pendingAction.epToPayWithGold > pendingAction.maxGoldEp || (character.gold ?? 0) < pendingAction.goldCost + pendingAction.epToPayWithGold * 10 || character.availableEp < pendingAction.cost - pendingAction.epToPayWithGold"
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
              <th>{{ UI.colNextCost }}<span v-if="pageMode === 'reward'" class="reward-marker"> {{ UI.advCostRewardMarker }}</span></th>
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
              <th>{{ UI.colCost }}<span v-if="pageMode === 'reward'" class="reward-marker"> {{ UI.advCostRewardMarker }}</span></th>
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
              <th>{{ UI.colCost }}<span v-if="pageMode === 'reward'" class="reward-marker"> {{ UI.advCostRewardMarker }}</span></th>
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

.char-header-top h1 {
  margin: 0;
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

.ep-balance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  flex-wrap: wrap;
}

.ep-balance {
  margin: 0;
  color: #444;
}

.modal-mode-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.75rem;
}

.reward-marker {
  color: #8a7400;
  font-size: 0.85em;
  font-weight: 400;
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

.gold-hint {
  font-size: 0.8em;
  color: #888;
  white-space: nowrap;
}

.ep-breakdown {
  font-size: 0.9em;
  color: #444;
  margin-top: 0.25rem;
}

/* ── Validation Banner ── */

.validation-banner {
  border: 1px solid #f0c040;
  border-radius: 4px;
  padding: 0.4rem 0.75rem;
  margin-bottom: 1rem;
  background: #fffbe6;
  font-size: 0.9em;
}

.validation-banner--expanded {
  background: #fff8d6;
}

.validation-banner-summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font: inherit;
  text-align: left;
}

.validation-banner-summary:hover {
  opacity: 0.85;
}

.validation-banner-chevron {
  margin-left: auto;
  font-size: 0.75em;
  color: #888;
}

.validation-banner--error { color: #c00; }
.validation-banner--warning { color: #b8860b; }
.validation-banner--info { color: #555; }

.validation-issue-list {
  border-top: 1px solid #f0c040;
  margin-top: 0.25rem;
  padding-top: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.validation-issue-item {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
  padding: 0.2rem 0;
  font-weight: 400;
  font-size: 0.9em;
  border-bottom: 1px solid #eee;
}

.validation-issue-item:last-child {
  border-bottom: none;
}

.validation-issue-severity {
  font-weight: 600;
  min-width: 4.5em;
}

.validation-issue-item--error .validation-issue-severity { color: #c00; }
.validation-issue-item--warning .validation-issue-severity { color: #b8860b; }
.validation-issue-item--info .validation-issue-severity { color: #555; }

.validation-issue-message {
  flex: 1 1 auto;
}

.validation-issue-detail {
  color: #888;
  font-size: 0.9em;
  width: 100%;
}

.btn-auto-fix {
  padding: 0.35rem 0.75rem;
  border: 1px solid #2a7a2a;
  border-radius: 3px;
  background: #2a7a2a;
  color: #fff;
  font-size: 0.85em;
  font-weight: 600;
  cursor: pointer;
  align-self: flex-start;
  margin-top: 0.25rem;
}

.btn-auto-fix:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

