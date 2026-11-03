<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { characterLoadService } from '../services/CharacterLoadService'
import { characterStorage } from '../services/CharacterStorage'
import { computeGrad } from '../services/GradUtils'
import { canLearnTechniques, isCaster } from '../services/CharacterService'
import { advancementService } from '../services/AdvancementService'
import { techniqueService } from '../services/TechniqueService'
import AdvancementModeToggle from '../components/AdvancementModeToggle.vue'
import { UI } from '../constants/ui'
import { useNotifications } from '../composables/useNotifications'
import { useAdvancementMode } from '../composables/useAdvancementMode'
import type { AdvancementMode } from '../types/Advancement'
import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { Technique } from '../types/Technique'

// ── State ─────────────────────────────────────────────────────────────────────

const route = useRoute()
const router = useRouter()

const character = ref<Character | null>(null)
const rules = ref<RulesData | null>(null)
const loading = ref(true)
const loadError = ref(false)
const { error } = useNotifications()
/** Page-level cost mode (Normal / Belohnung), shared with AdvancementView and SpellsView. */
const { advancementMode: pageMode } = useAdvancementMode()

/** The technique the player wants to learn — awaiting confirmation. */
interface PendingTechniqueAction {
  technique: Technique
  mode: AdvancementMode
  epCost: number
  goldCost: number
  epToPayWithGold: number
  maxGoldEp: number
}
const pendingAction = ref<PendingTechniqueAction | null>(null)

/** Technique whose detail popup is open. */
const infoTechnique = ref<{ technique: Technique; description: string } | null>(null)

/** Discipline id shown in the "learn" table. */
const activeDiscipline = ref('')

// ── Computed ──────────────────────────────────────────────────────────────────

const grad = computed(() => (character.value ? computeGrad(character.value.totalEs) : 0))

const charType = computed(() => {
  const c = character.value
  const r = rules.value
  if (!c || !r) return null
  return r.types.find(t => t.id === c.typeId) ?? null
})

const techniqueRules = computed(() => rules.value?.techniqueRules)

/** True if the type has fightCosts and matching techniques are loaded. */
const canLearn = computed(() => canLearnTechniques(charType.value ?? undefined, rules.value?.techniques))

/** True if the character type is a caster (shows the Zaubersprüche nav button). */
const isCasterType = computed(() => isCaster(charType.value ?? undefined))

/** Disciplines with a cost for the type: rule order first, then remaining fightCosts keys. */
const disciplines = computed<string[]>(() => {
  const fc = charType.value?.fightCosts ?? {}
  const ordered = (techniqueRules.value?.disciplines ?? []).map(d => d.id).filter(id => fc[id] !== undefined)
  return [...ordered, ...Object.keys(fc).filter(id => !ordered.includes(id))]
})

/** Rule entry of the active discipline (may be missing). */
const disciplineRule = computed(() => techniqueRules.value?.disciplines.find(d => d.id === activeDiscipline.value))

/** Rank id → display name for a discipline. */
function rankName(discipline: string, rank: string | undefined): string {
  if (!rank) return ''
  const rule = techniqueRules.value?.disciplines.find(d => d.id === discipline)
  return rule?.ranks?.find(r => r.id === rank)?.name ?? rank
}

const learnedIds = computed(() => new Set((character.value?.techniques ?? []).map(t => t.techniqueId)))

/** Learned techniques, sorted by discipline, level, name. */
const learnedRows = computed(() => {
  const c = character.value
  const r = rules.value
  if (!c || !r) return []
  return (c.techniques ?? [])
    .map(ct => {
      const t = r.techniques.find(x => x.id === ct.techniqueId)
      return {
        id: ct.techniqueId,
        name: t?.name ?? ct.techniqueId,
        level: t?.level ?? 0,
        discipline: t?.discipline ?? '—',
        form: t?.form ?? '—',
        apCost: t?.apCost ?? '',
      }
    })
    .sort((a, b) =>
      a.discipline.localeCompare(b.discipline, 'de') || a.level - b.level || a.name.localeCompare(b.name, 'de'))
})

/** Unmet skill prerequisite of the active discipline, or null. */
const blocker = computed(() =>
  character.value && disciplineRule.value ? techniqueService.disciplineBlocker(character.value, disciplineRule.value) : null,
)

/** Reached rank in the active discipline (null if the discipline has no ranks). */
const reachedRank = computed(() => {
  const c = character.value
  const r = rules.value
  const rule = disciplineRule.value
  return c && r && rule ? techniqueService.currentRank(c, rule, r.techniques, r.skills) : null
})

/** EP per LE of the active discipline. */
const epPerLe = computed(() => charType.value?.fightCosts?.[activeDiscipline.value])

/** Techniques of the active discipline that are not learned yet, with cost and learnability. */
const learnableRows = computed(() => {
  const c = character.value
  const r = rules.value
  const type = charType.value
  const mode = pageMode.value
  if (!c || !r || !type) return []
  return r.techniques
    .filter(t => t.discipline === activeDiscipline.value && !learnedIds.value.has(t.id))
    .map(t => {
      const cost = advancementService.techniqueLearnCost(t, type, techniqueRules.value, mode)
      const rankOk = techniqueService.rankAllowed(t, disciplineRule.value, reachedRank.value)
      const epCost = cost?.epCost ?? 0
      const goldCost = cost?.goldCost ?? 0
      // Belohnung: kein EP-Ersatz durch Gold, daher nur EP prüfen
      const canAfford = c.availableEp >= epCost || (
        mode === 'normal' && c.availableEp >= Math.ceil(epCost / 2) && (c.gold ?? 0) >= goldCost
      )
      return { technique: t, epCost, rankOk, canLearn: !!cost && rankOk && !blocker.value && canAfford }
    })
    .sort((a, b) => a.technique.level - b.technique.level || a.technique.name.localeCompare(b.technique.name, 'de'))
})

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Build a "learn technique" action for the given cost mode.
 * @param technique - The technique the player selected.
 * @param mode      - Cost mode (Normal / Belohnung).
 * @returns The pending action, or null if the type has no cost for it.
 */
function buildLearnAction(technique: Technique, mode: AdvancementMode): PendingTechniqueAction | null {
  const type = charType.value
  if (!type) return null
  const cost = advancementService.techniqueLearnCost(technique, type, techniqueRules.value, mode)
  if (!cost) return null
  return {
    technique,
    mode,
    epCost: cost.epCost,
    goldCost: cost.goldCost,
    epToPayWithGold: 0,
    maxGoldEp: advancementService.maxGoldEp(cost.epCost, mode),
  }
}

/** Stage a technique to learn with the page mode — shows the confirmation modal. */
function requestLearn(technique: Technique): void {
  const action = buildLearnAction(technique, pageMode.value)
  if (action) pendingAction.value = action
}

/** Switch the cost mode of the staged action (modal toggle only). */
function switchPendingMode(mode: AdvancementMode): void {
  const action = pendingAction.value
  if (!action || action.mode === mode) return
  const rebuilt = buildLearnAction(action.technique, mode)
  if (rebuilt) pendingAction.value = rebuilt
}

/** Limit the EP-to-gold replacement to the allowed maximum. */
function clampEpGold(action: PendingTechniqueAction): void {
  if (action.epToPayWithGold > action.maxGoldEp) action.epToPayWithGold = action.maxGoldEp
}

/** Save a new character state and show errors as notifications. */
async function persist(updated: Character): Promise<void> {
  try {
    await characterStorage.save(updated)
    character.value = updated
  } catch (e) {
    error(e instanceof Error ? e.message : UI.techErrSave)
  }
}

/** Confirm the staged learn: deduct EP and gold, add the technique, save. */
async function confirmLearn(): Promise<void> {
  const action = pendingAction.value
  const char = character.value
  pendingAction.value = null
  if (!action || !char) return

  const goldCost = Math.max(0, Number(action.goldCost) || 0)
  const epToPayWithGold = action.mode === 'reward'
    ? 0
    : Math.min(action.maxGoldEp, Math.max(0, Number(action.epToPayWithGold) || 0))
  const epToDeduct = action.epCost - epToPayWithGold
  if (char.availableEp < epToDeduct) { error(UI.techErrEp); return }
  const epReplacementGold = epToPayWithGold * 10
  if ((char.gold ?? 0) < goldCost + epReplacementGold) { error(UI.techErrGold); return }

  await persist({
    ...char,
    techniques: [...(char.techniques ?? []), { techniqueId: action.technique.id }],
    availableEp: char.availableEp - epToDeduct,
    gold: (char.gold ?? 0) - goldCost - epReplacementGold,
    updatedAt: new Date().toISOString(),
  })
}

/** Remove a learned technique (no refund) after confirmation. */
async function removeTechnique(techniqueId: string): Promise<void> {
  const char = character.value
  if (!char || !window.confirm(UI.techRemoveConfirm)) return
  await persist({
    ...char,
    techniques: (char.techniques ?? []).filter(t => t.techniqueId !== techniqueId),
    updatedAt: new Date().toISOString(),
  })
}

/** Show the detail popup for a technique id. */
function showInfo(techniqueId: string): void {
  const r = rules.value
  const technique = r?.techniques.find(t => t.id === techniqueId)
  if (!r || !technique) return
  const description = r.techniqueDescriptions.find(d => d.id === techniqueId)?.description ?? ''
  infoTechnique.value = { technique, description }
}

/** Restriction codes → labels from the rule data (code itself as fallback). */
function restrictionLabels(codes: string[]): string {
  const names = techniqueRules.value?.restrictionNames ?? {}
  return codes.map(c => names[c] ?? c).join(', ')
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
    if (disciplines.value.length > 0) activeDiscipline.value = disciplines.value[0]
  } catch (e) {
    loadError.value = true
    error(e instanceof Error ? e.message : 'Failed to load data.', null)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="techniques-page">
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
            <button v-if="isCasterType" type="button" class="btn-nav" @click="router.push({ name: 'spells', params: { id: character.id } })">{{ UI.spells }}</button>
            <button type="button" class="btn-nav" @click="router.push({ name: 'character-edit', params: { id: character.id } })">{{ UI.navEdit }}</button>
          </nav>
        </div>
        <div class="ep-balance-row">
          <p class="ep-balance">
            {{ UI.epAvailable }} <strong>{{ character.availableEp }}</strong>
            / {{ character.totalEs }} {{ UI.esTotal }}
            &nbsp;| {{ UI.labelGold }} <strong>{{ character.gold ?? 0 }}</strong>
          </p>
          <AdvancementModeToggle v-if="canLearn" v-model="pageMode" />
        </div>
      </header>

      <p v-if="!canLearn" class="empty-hint">{{ UI.techNoCosts }}</p>

      <template v-else>
        <!-- ── Confirmation modal ── -->
        <div v-if="pendingAction !== null" class="modal-overlay" @click.self="pendingAction = null">
          <div class="modal-box">
            <div class="modal-mode-row">
              <AdvancementModeToggle :model-value="pendingAction.mode" @update:model-value="switchPendingMode" />
            </div>
            <p>
              {{ UI.confirmLearnPfx }} <strong>{{ pendingAction.technique.name }}</strong>
              ({{ UI.colLevel }} {{ pendingAction.technique.level }}, {{ pendingAction.technique.discipline }})
              {{ UI.confirmFor }} <strong>{{ pendingAction.epCost }} {{ UI.unitEp }}</strong>?
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
                :disabled="(character.gold ?? 0) < pendingAction.goldCost + pendingAction.epToPayWithGold * 10 || pendingAction.epToPayWithGold > pendingAction.maxGoldEp"
                @click="confirmLearn"
              >{{ UI.confirm }}</button>
              <button class="btn-cancel" @click="pendingAction = null">{{ UI.cancel }}</button>
            </div>
          </div>
        </div>

        <!-- ── Info modal ── -->
        <div v-if="infoTechnique !== null" class="modal-overlay" @click.self="infoTechnique = null">
          <div class="modal-box modal-wide">
            <h3>
              {{ infoTechnique.technique.name }}
              <span v-if="infoTechnique.technique.translation" class="translation">({{ infoTechnique.technique.translation }})</span>
            </h3>
            <div class="info-layout">
              <div class="info-props">
                <p>{{ infoTechnique.technique.discipline }} · {{ infoTechnique.technique.form }}</p>
                <p>
                  <span class="detail-label">{{ UI.colLevel }}</span> {{ infoTechnique.technique.level }}
                  <template v-if="infoTechnique.technique.rank"> / {{ rankName(infoTechnique.technique.discipline, infoTechnique.technique.rank) }}</template>
                </p>
                <p><span class="detail-label">{{ UI.techColAp }}</span> {{ infoTechnique.technique.apCost }}</p>
                <p v-if="infoTechnique.technique.variant"><span class="detail-label">{{ UI.techVariant }}</span> {{ infoTechnique.technique.variant }}</p>
                <p v-if="infoTechnique.technique.weapons"><span class="detail-label">{{ UI.techWeapons }}</span> {{ infoTechnique.technique.weapons }}</p>
                <p v-if="infoTechnique.technique.restrictions.length > 0">
                  <span class="detail-label">{{ UI.techRestrictions }}</span> {{ restrictionLabels(infoTechnique.technique.restrictions) }}
                </p>
                <p v-if="infoTechnique.technique.colors && infoTechnique.technique.colors.length > 0">
                  <span class="detail-label">{{ UI.techColors }}</span> {{ infoTechnique.technique.colors.join(', ') }}
                </p>
                <p v-if="infoTechnique.technique.kind"><span class="detail-label">{{ UI.techKind }}</span> {{ infoTechnique.technique.kind }}</p>
                <p v-if="infoTechnique.technique.ep0" class="hint">{{ UI.techEp0 }}</p>
                <p v-if="infoTechnique.technique.parseWarning" class="warning">{{ UI.techParseWarning }}</p>
                <p><span class="detail-label">{{ UI.sourceLabel }}</span> {{ infoTechnique.technique.source }}</p>
              </div>
              <div v-if="infoTechnique.description" class="info-desc">{{ infoTechnique.description }}</div>
            </div>
            <div class="confirmation-buttons">
              <button class="btn-cancel" @click="infoTechnique = null">{{ UI.close }}</button>
            </div>
          </div>
        </div>

        <!-- ── Learned techniques ── -->
        <section>
          <h2>{{ UI.techKnown }}</h2>
          <table v-if="learnedRows.length > 0" class="tech-table">
            <thead>
              <tr>
                <th>{{ UI.colLevel }}</th>
                <th>{{ UI.labelName }}</th>
                <th></th>
                <th>{{ UI.techColDiscipline }}</th>
                <th>{{ UI.techColForm }}</th>
                <th>{{ UI.techColAp }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in learnedRows" :key="row.id">
                <td class="col-level">{{ row.level }}</td>
                <td>{{ row.name }}</td>
                <td><button class="btn-info" @click="showInfo(row.id)">{{ UI.spellDetailView }}</button></td>
                <td>{{ row.discipline }}</td>
                <td>{{ row.form }}</td>
                <td>{{ row.apCost }}</td>
                <td><button class="btn-info" @click="removeTechnique(row.id)">{{ UI.techRemove }}</button></td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty-hint">{{ UI.techEmptyLearned }}</p>
        </section>

        <!-- ── Learn new technique ── -->
        <section>
          <h2>{{ UI.techLearnNew }}</h2>
          <div class="discipline-tabs">
            <button
              v-for="d in disciplines"
              :key="d"
              type="button"
              class="tab"
              :class="{ 'tab--active': d === activeDiscipline }"
              @click="activeDiscipline = d"
            >{{ d }}</button>
          </div>
          <p class="discipline-info">
            {{ UI.techEpPerLe }} <strong>{{ epPerLe ?? '—' }}</strong>
            <template v-if="reachedRank">
              &nbsp;| {{ UI.techCurrentRank }} <strong>{{ reachedRank.name }}</strong>
            </template>
          </p>
          <ul v-if="disciplineRule?.ranks && disciplineRule.ranks.length > 1" class="rank-list">
            <template v-for="rank in disciplineRule.ranks" :key="rank.id">
              <li v-if="rank.minSkillValue !== undefined || rank.requiredTechniques">
                {{ rank.name }} {{ UI.techRankNeeds }}
                <template v-if="rank.minSkillValue !== undefined">{{ disciplineRule.skillId }}+{{ rank.minSkillValue }}</template>
                <template v-if="rank.requiredTechniques">
                  , {{ rank.requiredTechniques.count }} {{ UI.techRankTechniques }} {{ rankName(disciplineRule.id, rank.requiredTechniques.rank) }}
                </template>
              </li>
            </template>
          </ul>
          <p v-if="blocker" class="warning">
            {{ UI.techReqMissing }} {{ blocker.skillId }}<template v-if="blocker.minValue > 0">+{{ blocker.minValue }}</template>
          </p>
          <table v-if="learnableRows.length > 0" class="tech-table">
            <thead>
              <tr>
                <th>{{ UI.colLevel }}</th>
                <th v-if="reachedRank">{{ UI.techColRank }}</th>
                <th>{{ UI.labelName }}</th>
                <th></th>
                <th>{{ UI.techColForm }}</th>
                <th>{{ UI.techColAp }}</th>
                <th>{{ UI.colCost }}<span v-if="pageMode === 'reward'" class="reward-marker"> {{ UI.advCostRewardMarker }}</span></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in learnableRows" :key="row.technique.id" :class="{ 'row-locked': !row.rankOk }">
                <td class="col-level">{{ row.technique.level }}</td>
                <td v-if="reachedRank">{{ rankName(row.technique.discipline, row.technique.rank) }}</td>
                <td>{{ row.technique.name }}</td>
                <td><button class="btn-info" @click="showInfo(row.technique.id)">{{ UI.spellDetailView }}</button></td>
                <td>{{ row.technique.form }}<template v-if="row.technique.variant"> ({{ row.technique.variant }})</template></td>
                <td>{{ row.technique.apCost }}</td>
                <td>{{ row.epCost }} {{ UI.unitEp }}</td>
                <td>
                  <button :disabled="!row.canLearn || pendingAction !== null" @click="requestLearn(row.technique)">
                    {{ UI.learnBtn }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty-hint">{{ UI.techEmptyLearnable }}</p>
        </section>
      </template>
    </template>
  </main>
</template>

<style scoped>
.techniques-page { max-width: 900px; margin: 0 auto; padding: 1.5rem; font-family: sans-serif; }
.status { color: #555; }
.status.error { color: #c00; }
.char-header { margin-bottom: 1.5rem; }
.char-header-top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.char-header-title { display: flex; align-items: center; gap: 0.75rem; }
.char-header-title h1 { margin: 0; }
.grad-badge { background: #2a4a7a; color: #fff; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.85em; font-weight: 600; white-space: nowrap; }
.sheet-nav { display: flex; align-items: center; gap: 0.5rem; }
.ep-balance-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; flex-wrap: wrap; margin-top: 0.4rem; }
.ep-balance { margin: 0; color: #444; }
section { margin-bottom: 2rem; }
section h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin: 0 0 0.75rem; }
.tech-table { width: 100%; border-collapse: collapse; }
.tech-table th, .tech-table td { text-align: left; padding: 0.35rem 0.6rem; border-bottom: 1px solid #eee; font-size: 0.9em; }
.tech-table th { background: #f0f0f0; }
.col-level { text-align: center; width: 3.5rem; }
.row-locked td { color: #999; }
.empty-hint { color: #888; font-size: 0.9em; font-style: italic; }
.warning { color: #a05a00; font-size: 0.9em; }
.hint { color: #666; font-size: 0.85em; font-style: italic; }
.discipline-tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.tab { padding: 0.3rem 0.8rem; border: 1px solid #bbb; border-radius: 3px; background: #f5f5f5; cursor: pointer; }
.tab--active { background: #2a4a7a; border-color: #2a4a7a; color: #fff; }
.discipline-info { font-size: 0.9em; color: #444; margin: 0 0 0.5rem; }
.rank-list { font-size: 0.85em; color: #666; margin: 0 0 0.5rem; padding-left: 1.2rem; }
.reward-marker { color: #8a7400; font-size: 0.85em; font-weight: 400; text-transform: none; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-box { background: #fffbe6; border: 1px solid #e6c800; border-radius: 6px; padding: 1.5rem 1.75rem; max-width: 480px; width: 90%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25); }
.modal-box p { margin: 0 0 0.75rem; }
.modal-wide { max-width: 700px; }
.modal-mode-row { display: flex; justify-content: flex-end; margin-bottom: 0.75rem; }
.gold-cost-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; font-size: 0.9em; color: #555; }
.gs-input { width: 5rem; padding: 0.25rem 0.4rem; border: 1px solid #aaa; border-radius: 3px; font-size: 1rem; text-align: right; }
.gold-hint { font-size: 0.8em; color: #888; }
.ep-breakdown { font-size: 0.9em; color: #444; margin-top: 0.25rem; }
.confirmation-buttons { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.translation { font-weight: 400; color: #666; font-size: 0.85em; }
.info-layout { display: flex; gap: 1.5rem; margin-bottom: 1rem; flex: 1; min-height: 0; overflow: hidden; }
.info-props { flex: 0 0 auto; min-width: 240px; max-width: 280px; }
.info-props p { margin: 0.15rem 0; font-size: 0.85em; line-height: 1.4; }
.info-desc { flex: 1; font-size: 0.9em; line-height: 1.5; color: #444; white-space: pre-wrap; overflow-y: auto; min-height: 0; }
.detail-label { font-weight: 600; color: #555; display: inline-block; min-width: 6rem; }
.btn-info { padding: 0.2rem 0.5rem; background: #f5f5f5; border: 1px solid #bbb; border-radius: 3px; cursor: pointer; font-size: 0.8em; }
.btn-info:hover { background: #e8e8e8; }
@media (max-width: 600px) {
  .info-layout { flex-direction: column; overflow-y: auto; }
  .info-props { max-width: none; }
}
</style>
