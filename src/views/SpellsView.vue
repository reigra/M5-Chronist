<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { characterLoadService } from '../services/CharacterLoadService'
import { characterStorage } from '../services/CharacterStorage'
import { computeGrad } from '../services/GradUtils'
import { isCaster as checkCaster } from '../services/CharacterService'
import { advancementService } from '../services/AdvancementService'
import AdvancementModeToggle from '../components/AdvancementModeToggle.vue'
import { UI } from '../constants/ui'
import { useNotifications } from '../composables/useNotifications'
import { useAdvancementMode } from '../composables/useAdvancementMode'
import { houseRulesService } from '../services/HouseRulesService'
import type { AdvancementMode } from '../types/Advancement'
import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { Spell } from '../types/Spell'

/** Map singular → plural for spell group names that differ between parsers and type definitions. */
const SPELL_GROUP_FIX: Record<string, string> = {
  'Wundertat': 'Wundertaten',
  'Zauberlied': 'Zauberlieder',
}

/** Normalize a spell group name: apply SPELL_GROUP_FIX if known, pass through otherwise. */
function normalizeGroup(g: string | null | undefined): string {
  if (!g) return '—'
  return SPELL_GROUP_FIX[g] ?? g
}

// ── State ─────────────────────────────────────────────────────────────────────

const route = useRoute()
const router = useRouter()

const character = ref<Character | null>(null)
const rules = ref<RulesData | null>(null)
const loading = ref(true)
const loadError = ref(false)
const { error, ok } = useNotifications()
/** Page-level cost mode (Normal / Belohnung), shared with AdvancementView. */
const { advancementMode: pageMode } = useAdvancementMode()

/**
 * The spell the player wants to learn — awaiting confirmation.
 * mode starts with the page mode and can be switched in the modal without affecting the page.
 */
interface PendingSpellAction {
  spell: Spell
  mode: AdvancementMode
  epCost: number
  originalEpCost: number
  goldCost: number
  epToPayWithGold: number
  maxGoldEp: number
  ppUsed: number
}
const pendingAction = ref<PendingSpellAction | null>(null)

/** Spell whose detail popup is currently open. */
const infoSpellRow = ref<{ spell: Spell; description: string } | null>(null)

/** Local short description text being edited in the spell info popup. */
const localShortDesc = ref('')

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

/** True if the character type has spellCosts (can learn spells). */
const isCaster = computed(() => checkCaster(charType.value ?? undefined))

/** Sum of PP per spellGroup across all learned spells. */
const groupPp = computed(() => {
  const c = character.value
  const r = rules.value
  if (!c || !r) return {}
  const result: Record<string, number> = {}
  for (const s of c.spells) {
    const spell = r.spells.find(sp => sp.id === s.spellId)
    if (!spell) continue
    const pp = s.pp ?? 0
    if (pp > 0) result[normalizeGroup(spell.spellGroup)] = (result[normalizeGroup(spell.spellGroup)] ?? 0) + pp
  }
  return result
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
    .map(s => {
      const spellId = typeof s === 'string' ? s : s.spellId
      const spell = r.spells.find(sp => sp.id === spellId)
      return { id: spellId, name: spell?.name ?? spellId, level: spell?.level ?? 0, spellGroup: normalizeGroup(spell?.spellGroup) ?? '—', pp: s.pp ?? 0 }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
})

/**
 * Spells available to learn: in the type's spell groups, not yet learned,
 * sorted by level then name. Each row includes the EP cost.
 */
const learnableSpellRows = computed(() => {
  const c = character.value
  const r = rules.value
  const type = charType.value
  const mode = pageMode.value
  if (!c || !r || !type?.spellCosts) return []

  const groups = new Set(Object.keys(type.spellCosts))
  const learned = new Set((c.spells ?? []).map(s => typeof s === 'string' ? s : s.spellId))

  return r.spells
    .filter(s => groups.has(normalizeGroup(s.spellGroup)) && !learned.has(s.id))
    .map(s => {
      const group = normalizeGroup(s.spellGroup)
      const ppAvailable = groupPp.value[group] ?? 0
      const { epCost, originalEpCost, ppUsed, goldCost } = advancementService.spellLearnCost(s, group, type, ppAvailable, mode)
      return {
        spell: s,
        originalCost: originalEpCost,
        ppUsed,
        cost: epCost,
        // Belohnung: kein EP-Ersatz durch Gold, daher nur EP prüfen
        canAfford: c.availableEp >= epCost || (
          mode === 'normal' &&
          c.availableEp >= Math.ceil(epCost / 2) &&
          (c.gold ?? 0) >= goldCost
        ),
      }
    })
    .sort((a, b) => a.spell.name.localeCompare(b.spell.name, 'de'))
})

// ── Actions ───────────────────────────────────────────────────────────────────

/** Limit the EP-to-gold replacement to the allowed maximum. */
function clampEpGold(action: PendingSpellAction): void {
  if (action.epToPayWithGold > action.maxGoldEp) {
    action.epToPayWithGold = action.maxGoldEp
  }
}

/**
 * Build a "learn spell" action for the given cost mode.
 * @param spell - The spell the player selected.
 * @param mode  - Cost mode (Normal / Belohnung).
 * @returns The pending action, or null if the type cannot learn spells.
 */
function buildLearnAction(spell: Spell, mode: AdvancementMode): PendingSpellAction | null {
  const type = charType.value
  if (!type?.spellCosts) return null
  const group = normalizeGroup(spell.spellGroup)
  const ppAvailable = groupPp.value[group] ?? 0
  const { epCost, originalEpCost, ppUsed, goldCost } = advancementService.spellLearnCost(spell, group, type, ppAvailable, mode)
  const maxGoldEp = advancementService.maxGoldEp(epCost, mode)
  return { spell, mode, epCost, originalEpCost, goldCost, epToPayWithGold: 0, maxGoldEp, ppUsed }
}

/**
 * Stage a spell to learn with the page mode — shows the confirmation modal.
 * @param spell - The spell the player selected.
 */
function requestLearn(spell: Spell): void {
  const action = buildLearnAction(spell, pageMode.value)
  if (action) pendingAction.value = action
}

/**
 * Switch the cost mode of the staged spell (modal toggle) and recalculate it.
 * The page mode stays unchanged; gold inputs reset to the new defaults.
 * @param mode - The new cost mode for this action.
 */
function switchPendingMode(mode: AdvancementMode): void {
  const action = pendingAction.value
  if (!action || action.mode === mode) return
  const rebuilt = buildLearnAction(action.spell, mode)
  if (rebuilt) pendingAction.value = rebuilt
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

  const epToPayWithGold = action.mode === 'reward' ? 0 : action.epToPayWithGold
  const epToDeduct = action.epCost - epToPayWithGold

  if (char.availableEp < epToDeduct) {
    error('Not enough EP.')
    pendingAction.value = null
    return
  }

  const epReplacementGold = epToPayWithGold * 10
  if ((char.gold ?? 0) < action.goldCost + epReplacementGold) {
    error('Not enough gold.')
    pendingAction.value = null
    return
  }

  let remainingPp = action.ppUsed
  const updatedSpells = (char.spells ?? []).map(s => {
    if (remainingPp <= 0) return s
    const spell = rules.value?.spells.find(sp => sp.id === s.spellId)
    if (!spell || normalizeGroup(spell.spellGroup) !== normalizeGroup(action.spell.spellGroup)) return s
    const consume = Math.min(s.pp ?? 0, remainingPp)
    remainingPp -= consume
    return { ...s, pp: (s.pp ?? 0) - consume }
  })

  const updated: Character = {
    ...char,
    spells: [...updatedSpells, { spellId: action.spell.id, pp: 0 }],
    availableEp: char.availableEp - epToDeduct,
    gold: (char.gold ?? 0) - action.goldCost - epReplacementGold,
    updatedAt: new Date().toISOString(),
  }

  try {
    await characterStorage.save(updated)
    character.value = updated
    pendingAction.value = null
  } catch (e) {
    error(e instanceof Error ? e.message : 'Failed to save.')
    pendingAction.value = null
  }
}

/** Show the spell info popup for a given spell ID. */
function showSpellInfo(spellId: string): void {
  const r = rules.value
  if (!r) return
  const spell = r.spells.find(sp => sp.id === spellId) ?? null
  if (!spell) return
  const desc = r.spellDescriptions?.find(d => d.id === spellId)?.description ?? ''
  infoSpellRow.value = { spell, description: desc }
  localShortDesc.value = spell.shortDescription
}

/** Save the current localShortDesc as a house rule for this character. */
async function saveShortDescription(): Promise<void> {
  const row = infoSpellRow.value
  const char = character.value
  if (!row || !char) return
  try {
    await houseRulesService.setSpellShortDescription(
      char.name,
      row.spell.id,
      localShortDesc.value,
    )
    // Update local state so the UI reflects the change immediately
    row.spell.shortDescription = localShortDesc.value
    ok(UI.houseRulesSaved)
  } catch (e) {
    error(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.')
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  try {
    const id = route.params.id as string
    const result = await characterLoadService.load(id)

    if (!result.character) {
      loadError.value = true
      error(`Character "${id}" not found.`, null)
      return
    }

    rules.value = result.rules
    character.value = result.character
  } catch (e) {
    loadError.value = true
    error(e instanceof Error ? e.message : 'Failed to load data.', null)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="spells-page">

    <div v-if="loading" class="status">{{ UI.loading }}</div>
    <div v-else-if="loadError" class="status error">{{ UI.failedToLoad }}</div>

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
        <div class="ep-balance-row">
          <p class="ep-balance">
            {{ UI.epAvailable }} <strong>{{ character.availableEp }}</strong>
            / {{ character.totalEs }} {{ UI.esTotal }}
            &nbsp;| {{ UI.labelGold }} <strong>{{ character.gold ?? 0 }}</strong>
          </p>
          <AdvancementModeToggle v-if="isCaster" v-model="pageMode" />
        </div>
      </header>

      <!-- ── Not a caster ── -->
      <p v-if="!isCaster" class="not-caster">
        {{ UI.spellsNotCaster }}
      </p>

      <template v-else>

        <!-- ── Confirmation modal ── -->
        <div v-if="pendingAction !== null" class="modal-overlay" @click.self="cancelLearn">
          <div class="modal-box">
            <div class="modal-mode-row">
              <AdvancementModeToggle :model-value="pendingAction.mode" @update:model-value="switchPendingMode" />
            </div>
            <p>
              {{ UI.confirmLearnPfx }} <strong>{{ pendingAction.spell.name }}</strong>
              ({{ UI.colLevel }} {{ pendingAction.spell.level }}, {{ normalizeGroup(pendingAction.spell.spellGroup) }})
              {{ UI.confirmFor }} <strong>{{ pendingAction.epCost }} {{ UI.unitEp }}</strong>?
            </p>
            <p v-if="pendingAction.ppUsed > 0" class="pp-used-note">
              PP genutzt: {{ pendingAction.ppUsed }} (spart {{ pendingAction.originalEpCost - pendingAction.epCost }} EP)
            </p>
            <label class="gold-cost-row">
              {{ UI.advGoldLearnCost }}
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
                {{ UI.spellsEpAfter }} {{ character.availableEp - (pendingAction.epCost - pendingAction.epToPayWithGold) }} {{ UI.unitEp }}
              </p>
            </template>
            <p v-else class="ep-breakdown">
              {{ UI.spellsEpAfter }} {{ character.availableEp - pendingAction.epCost }} {{ UI.unitEp }}
            </p>
            <div class="confirmation-buttons">
              <button
                class="btn-confirm"
                :disabled="pendingAction.epToPayWithGold > pendingAction.maxGoldEp || (character.gold ?? 0) < pendingAction.goldCost + pendingAction.epToPayWithGold * 10"
                @click="confirmLearn"
              >{{ UI.confirm }}</button>
              <button class="btn-cancel" @click="cancelLearn">{{ UI.cancel }}</button>
            </div>
          </div>
        </div>

        <!-- ── Spell Info Modal ── -->
        <div v-if="infoSpellRow !== null" class="modal-overlay" @click.self="infoSpellRow = null">
          <div class="modal-box modal-wide">
            <h3>{{ infoSpellRow.spell.name }}</h3>
            <div class="spell-info-layout">
              <div class="spell-info-props">
                <p class="spell-info-type">{{ infoSpellRow.spell.spellType }} der Stufe {{ infoSpellRow.spell.level }}</p>
                <p v-if="infoSpellRow.spell.material" class="spell-info-material">{{ infoSpellRow.spell.material }}</p>
                <p class="spell-info-group">{{ normalizeGroup(infoSpellRow.spell.spellGroup) }} → {{ infoSpellRow.spell.elements[0] }} → {{ infoSpellRow.spell.elements[1] ?? '' }}</p>
                <div class="spell-info-details">
                  <p><span class="detail-label">AP:</span> {{ infoSpellRow.spell.apCost }}</p>
                  <p><span class="detail-label">Zauberdauer:</span> {{ infoSpellRow.spell.castingTime }}</p>
                  <p><span class="detail-label">Reichweite:</span> {{ infoSpellRow.spell.range }}</p>
                  <p><span class="detail-label">Wirkungsziel:</span> {{ infoSpellRow.spell.targetType }}</p>
                  <p><span class="detail-label">Wirkungsbereich:</span> {{ infoSpellRow.spell.effectArea }}</p>
                  <p><span class="detail-label">Wirkungsdauer:</span> {{ infoSpellRow.spell.duration }}</p>
                  <p><span class="detail-label">Ursprung:</span> {{ infoSpellRow.spell.origin }}</p>
                  <p><span class="detail-label">Quelle:</span> {{ infoSpellRow.spell.source ?? '—' }}</p>
                </div>
              </div>
              <div v-if="infoSpellRow.description" class="spell-info-desc">
                {{ infoSpellRow.description }}
              </div>
            </div>
            <div class="houserule-section">
              <label class="houserule-label">{{ UI.houseRulesShortDescription }}</label>
              <textarea
                v-model="localShortDesc"
                class="houserule-textarea"
                rows="3"
              ></textarea>
              <button class="btn-save-hr" @click="saveShortDescription">{{ UI.houseRulesSaveBtn }}</button>
            </div>
            <div class="confirmation-buttons">
              <button class="btn-cancel" @click="infoSpellRow = null">{{ UI.close }}</button>
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
                <th></th>
                <th>{{ UI.colGroup }}</th>
                <th>{{ UI.colPp }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in learnedSpellRows" :key="row.id">
                <td class="col-level">{{ row.level }}</td>
                <td>{{ row.name }}</td>
                <td>
                  <button class="btn-info" @click="showSpellInfo(row.id)">{{ UI.spellDetailView }}</button>
                </td>
                <td>{{ row.spellGroup }}</td>
                <td class="pp-cell">{{ row.pp }}</td>
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
                <th></th>
                <th>{{ UI.colGroup }}</th>
                <th>{{ UI.colPp }}</th>
                <th>{{ UI.colCost }}<span v-if="pageMode === 'reward'" class="reward-marker"> {{ UI.advCostRewardMarker }}</span></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in learnableSpellRows" :key="row.spell.id">
                <td class="col-level">{{ row.spell.level }}</td>
                <td>{{ row.spell.name }}</td>
                <td>
                  <button class="btn-info" @click="showSpellInfo(row.spell.id)">{{ UI.spellDetailView }}</button>
                </td>
                <td>{{ normalizeGroup(row.spell.spellGroup) }}</td>
                <td class="pp-cell">{{ groupPp[normalizeGroup(row.spell.spellGroup)] ?? 0 }}</td>
                <td>
                  <template v-if="row.ppUsed > 0">
                    <span class="cost-strikethrough">{{ row.originalCost }} {{ UI.unitEp }}</span>
                    <span class="cost-pp-reduced">&nbsp;{{ row.cost }} {{ UI.unitEp }}</span>
                  </template>
                  <template v-else>
                    {{ row.cost }} {{ UI.unitEp }}
                  </template>
                </td>
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

.ep-balance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  flex-wrap: wrap;
  margin-top: 0.4rem;
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
  text-transform: none;
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
  max-height: 85vh;
  display: flex;
  flex-direction: column;
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

.modal-wide {
  max-width: 700px;
}

.spell-info-layout {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1rem;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.spell-info-props {
  flex: 0 0 auto;
  min-width: 260px;
}

.spell-info-desc {
  flex: 1;
  font-size: 0.9em;
  line-height: 1.5;
  color: #444;
  white-space: pre-wrap;
  overflow-y: auto;
  min-height: 0;
}

.spell-info-type {
  font-size: 0.95em;
  color: #555;
  margin: 0 0 0.25rem;
}

.spell-info-material {
  font-style: italic;
  color: #666;
  margin: 0 0 0.25rem;
}

.spell-info-group {
  font-size: 0.9em;
  color: #555;
  margin: 0 0 0.75rem;
}

.spell-info-details {
  padding-top: 0.5rem;
}

.spell-info-details p {
  margin: 0.15rem 0;
  font-size: 0.85em;
  line-height: 1.4;
}

.detail-label {
  font-weight: 600;
  color: #555;
  display: inline-block;
  min-width: 7rem;
}

.btn-info {
  padding: 0.2rem 0.5rem;
  background: #f5f5f5;
  border: 1px solid #bbb;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.8em;
}

.btn-info:hover {
  background: #e8e8e8;
}

.houserule-section {
  margin: 1rem 0 0.5rem;
  padding: 0.75rem;
  background: #f5f0d0;
  border: 1px solid #d4c890;
  border-radius: 4px;
}

.houserule-label {
  display: block;
  font-size: 0.85em;
  font-weight: 600;
  color: #6b5a00;
  margin-bottom: 0.4rem;
}

.houserule-textarea {
  width: 100%;
  padding: 0.4rem 0.5rem;
  border: 1px solid #bbb;
  border-radius: 3px;
  font-size: 0.9rem;
  font-family: sans-serif;
  resize: vertical;
  box-sizing: border-box;
}

.btn-save-hr {
  margin-top: 0.5rem;
  padding: 0.3rem 0.8rem;
  background: #d4c080;
  border: 1px solid #b8a460;
  border-radius: 3px;
  color: #3d3500;
  font-size: 0.85em;
  cursor: pointer;
}

.btn-save-hr:hover {
  background: #c8b470;
}
</style>
