<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RulesLoader } from '../services/RulesLoader'
import { characterStorage } from '../services/CharacterStorage'
import { computeGrad, esForNextGrad } from '../services/GradUtils'
import { sheetSkillService } from '../services/SheetSkillService'
import { UI } from '../constants/ui'
import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'

// ── State ─────────────────────────────────────────────────────────────────────

const route = useRoute()
const router = useRouter()

const character = ref<Character | null>(null)
const rules = ref<RulesData | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)

const browserSupported = 'showSaveFilePicker' in window

// ── Computed ──────────────────────────────────────────────────────────────────

const grad = computed(() =>
  character.value ? computeGrad(character.value.totalEs) : 0,
)

const nextGradEs = computed(() =>
  character.value ? esForNextGrad(character.value.totalEs) : 0,
)

const raceName = computed(() => {
  const c = character.value; const r = rules.value
  if (!c || !r) return c?.raceId ?? '—'
  return r.races.find(x => x.id === c.raceId)?.name ?? c.raceId
})

const typeName = computed(() => {
  const c = character.value; const r = rules.value
  if (!c || !r) return c?.typeId ?? '—'
  return r.types.find(x => x.id === c.typeId)?.name ?? c.typeId
})

const originName = computed(() => {
  const c = character.value; const r = rules.value
  if (!c || !r) return c?.originId ?? '—'
  return r.origins.find(x => x.id === c.originId)?.name ?? c.originId
})

const statusName = computed(() => {
  const c = character.value; const r = rules.value
  if (!c || !r) return c?.socialStatusId ?? '—'
  return r.socialStatuses.find(x => x.id === c.socialStatusId)?.name ?? c.socialStatusId
})

/** True if the character type can cast spells. */
const isCaster = computed(() => {
  const c = character.value; const r = rules.value
  if (!c || !r) return false
  const t = r.types.find(x => x.id === c.typeId)
  return t?.category === 'KampfZauberer' || t?.category === 'Zauberer'
})

/**
 * True if the character's type is marked as isMeta (not fully supported by loaded rules).
 * In this case all actions except export are disabled.
 */
const isUnsupportedType = computed(() => {
  const c = character.value; const r = rules.value
  if (!c || !r) return false
  return r.types.find(x => x.id === c.typeId)?.isMeta === true
})

/** True wenn der Charakter mindestens eine Waffen- oder Spezialgebiet-Spezialisierung hat. */
const hasSpecializations = computed(() =>
  (character.value?.weaponSpecializations?.length ?? 0) > 0 ||
  !!character.value?.spellSpecialization,
)

/** Learned spells with display data, sorted by level then name. */
const spellRows = computed(() => {
  const c = character.value; const r = rules.value
  if (!c || !r) return []
  return (c.spells ?? []).map(id => {
    const spell = r.spells.find(s => s.id === id)
    return { id, name: spell?.name ?? id, level: spell?.level ?? 0, spellGroup: spell?.spellGroup ?? '—' }
  }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
})

/** Known skills with their display name looked up from the rules. */
const skillRows = computed(() => {
  const c = character.value; const r = rules.value
  if (!c || !r || !r.skillRules) return []
  return sheetSkillService.buildRows(c, r, r.skillRules)
})

const weaponRows = computed(() => skillRows.value.filter(r => r.isWeapon))
const learnedRows = computed(() => skillRows.value.filter(r => !r.isWeapon && !r.unlearned))
const unlearnedRows = computed(() => skillRows.value.filter(r => r.unlearned))

// ── Lifecycle ─────────────────────────────────────────────────────────────────

async function exportCharacter(): Promise<void> {
  const char = character.value
  if (!char) return
  try {
    await characterStorage.exportToFile(char)
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Export failed.'
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
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to load data.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="sheet">

    <div v-if="loading" class="status">{{ UI.loading }}</div>
    <div v-else-if="errorMessage" class="status error">{{ errorMessage }}</div>

    <template v-else-if="character">

      <!-- ── Header ── -->
      <header class="sheet-header">
        <div class="sheet-title">
          <h1>{{ character.name }}</h1>
          <span class="grad-badge">{{ UI.labelGrad }} {{ grad }}</span>
        </div>
        <nav class="sheet-nav">
          <router-link
            :to="isUnsupportedType ? '' : { name: 'advancement', params: { id: character.id } }"
            class="btn-nav"
            :class="{ 'btn-nav--disabled': isUnsupportedType }"
            :aria-disabled="isUnsupportedType"
          >{{ UI.navAdvancement }}</router-link>
          <router-link
            v-if="isCaster && !isUnsupportedType"
            :to="{ name: 'spells', params: { id: character.id } }"
            class="btn-nav"
          >{{ UI.spells }}</router-link>
          <router-link :to="{ name: 'character-edit', params: { id: character.id } }" class="btn-nav">{{ UI.navEdit }}</router-link>
          <router-link :to="{ name: 'equipment', params: { id: character.id } }" class="btn-nav">{{ UI.navEquipment }}</router-link>
          <button
            class="btn-nav"
            :disabled="!browserSupported"
            :title="browserSupported ? UI.sheetExportHint : UI.sheetExportHintNA"
            @click="exportCharacter"
          >{{ UI.sheetExport }}</button>
        </nav>
      </header>

      <!-- ── Unsupported type warning ── -->
      <div v-if="isUnsupportedType" class="status error unsupported-warning">
        {{ UI.sheetUnsupportedType }}
      </div>

      <!-- ── Identity ── -->
      <section class="card">
        <h2>{{ UI.secIdentity }}</h2>
        <dl class="prop-list">
          <dt>{{ UI.labelPlayer }}</dt>    <dd>{{ character.player }}</dd>
          <dt>{{ UI.labelRace }}</dt>      <dd>{{ raceName }}</dd>
          <dt>{{ UI.labelType }}</dt>      <dd>{{ typeName }}</dd>
          <dt>{{ UI.labelOrigin }}</dt>    <dd>{{ originName }}</dd>
          <dt>{{ UI.labelStatus }}</dt>    <dd>{{ statusName }}</dd>
        </dl>
      </section>

      <!-- ── Personalia ── -->
      <section class="card">
        <h2>{{ UI.secPersonalia }}</h2>
        <dl class="prop-list">
          <dt>{{ UI.labelGeschlecht }}</dt>  <dd>{{ character.personalia?.geschlecht  ?? UI.notApplicable }}</dd>
          <dt>{{ UI.labelHaendigkeit }}</dt> <dd>{{ character.personalia?.haendigkeit ?? UI.notApplicable }}</dd>
          <dt>{{ UI.labelAlter }}</dt>       <dd>{{ character.personalia?.alter       ?? UI.notApplicable }}</dd>
          <dt>{{ UI.labelGroesse }}</dt>     <dd>{{ character.personalia?.groesse     ?? UI.notApplicable }}</dd>
          <dt>{{ UI.labelGewicht }}</dt>     <dd>{{ character.personalia?.gewicht     ?? UI.notApplicable }}</dd>
          <dt>{{ UI.labelGestalt }}</dt>     <dd>{{ character.personalia?.gestalt     ?? UI.notApplicable }}</dd>
          <dt>{{ UI.labelGlaube }}</dt>      <dd>{{ character.personalia?.glaube      ?? UI.notApplicable }}</dd>
          <dt>{{ UI.labelGG }}</dt>          <dd>{{ character.personalia?.gg          ?? UI.notApplicable }}</dd>
          <dt>{{ UI.labelSG }}</dt>          <dd>{{ character.personalia?.sg          ?? UI.notApplicable }}</dd>
        </dl>
      </section>

      <!-- ── Experience ── -->
      <section class="card">
        <h2>{{ UI.secExperience }}</h2>
        <dl class="prop-list">
          <dt>{{ UI.labelGrad }}</dt>              <dd>{{ grad }}</dd>
          <dt>{{ UI.labelEsTotal }}</dt>           <dd>{{ character.totalEs }}</dd>
          <dt>{{ UI.labelEpAvail }}</dt>           <dd>{{ character.availableEp }}</dd>
          <dt>{{ UI.labelGold }}</dt>              <dd>{{ character.gold ?? 0 }}</dd>
          <dt>{{ UI.labelNextGrad }}</dt>          <dd>{{ nextGradEs }} {{ UI.unitEs }}</dd>
        </dl>
      </section>

      <!-- ── Eigenschaften ── -->
      <section class="card">
        <h2>{{ UI.secProps }}</h2>
        <dl class="prop-list prop-list--wide">
          <dt>{{ UI.propSt }}</dt>  <dd>{{ character.properties.St }}</dd>
          <dt>{{ UI.propGs }}</dt>  <dd>{{ character.properties.Gs }}</dd>
          <dt>{{ UI.propGw }}</dt>  <dd>{{ character.properties.Gw }}</dd>
          <dt>{{ UI.propKo }}</dt>  <dd>{{ character.properties.Ko }}</dd>
          <dt>{{ UI.propIn }}</dt>  <dd>{{ character.properties.In }}</dd>
          <dt>{{ UI.propZt }}</dt>  <dd>{{ character.properties.Zt }}</dd>
          <dt>{{ UI.propPa }}</dt>  <dd>{{ character.properties.pA }}</dd>
          <dt>{{ UI.propWk }}</dt>  <dd>{{ character.properties.Wk }}</dd>
          <dt>{{ UI.propAu }}</dt>  <dd>{{ character.properties.Au }}</dd>
          <dt>{{ UI.propLp }}</dt>  <dd>{{ character.properties.LP }}</dd>
          <dt>{{ UI.propAp }}</dt>  <dd>{{ character.properties.AP }}</dd>
          <dt>{{ UI.propB }}</dt>   <dd>{{ character.properties.B }}</dd>
        </dl>
      </section>

      <!-- ── Boni ── -->
      <section class="card">
        <h2>{{ UI.secBoni }}</h2>
        <dl class="prop-list prop-list--wide">
          <dt>{{ UI.propAusb }}</dt>  <dd>{{ character.boni.AusB }}</dd>
          <dt>{{ UI.propSchb }}</dt>  <dd>{{ character.boni.SchB }}</dd>
          <dt>{{ UI.propAnb }}</dt>   <dd>{{ character.boni.AnB }}</dd>
          <dt>{{ UI.propAbb }}</dt>   <dd>{{ character.boni.AbB }}</dd>
          <dt>{{ UI.propZaub }}</dt>  <dd>{{ character.boni.ZauB }}</dd>
          <dt>{{ UI.propResbg }}</dt> <dd>{{ character.boni.ResBg }}</dd>
          <dt>{{ UI.propResbk }}</dt> <dd>{{ character.boni.ResBk }}</dd>
        </dl>
      </section>

      <!-- ── Waffenfertigkeiten ── -->
      <section v-if="weaponRows.length > 0" class="card">
        <h2>{{ UI.secWeaponSkills }}</h2>
        <table class="skill-table">
          <thead>
            <tr>
              <th>{{ UI.colSkill }}</th>
              <th>{{ UI.colEw }}</th>
              <th>{{ UI.colAttr }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in weaponRows" :key="row.name">
              <td>{{ row.name }}</td>
              <td>{{ row.displayEw }}</td>
              <td>{{ row.linkedProperty }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- ── Gelernte Fertigkeiten ── -->
      <section v-if="learnedRows.length > 0" class="card">
        <h2>{{ UI.secSkills }}</h2>
        <table class="skill-table">
          <thead>
            <tr>
              <th>{{ UI.colSkill }}</th>
              <th>{{ UI.colEw }}</th>
              <th>{{ UI.colAttr }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in learnedRows" :key="row.name">
              <td>{{ row.name }}</td>
              <td>{{ row.displayEw }}</td>
              <td>{{ row.linkedProperty }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- ── Ungelernte Fertigkeiten ── -->
      <section v-if="unlearnedRows.length > 0" class="card">
        <h2>{{ UI.secUnlearnedSkills }}</h2>
        <table class="skill-table">
          <thead>
            <tr>
              <th>{{ UI.colSkill }}</th>
              <th>{{ UI.colEw }}</th>
              <th>{{ UI.colAttr }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in unlearnedRows" :key="row.name" class="row-unlearned">
              <td>{{ row.name }}*</td>
              <td>{{ row.displayEw }}</td>
              <td>{{ row.linkedProperty }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- ── Spells ── -->
      <section v-if="isCaster" class="card">
        <h2>{{ UI.spells }}</h2>
        <table v-if="spellRows.length > 0" class="skill-table">
          <thead>
            <tr>
              <th>{{ UI.colLevel }}</th>
              <th>{{ UI.labelName }}</th>
              <th>{{ UI.colGroup }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in spellRows" :key="row.id">
              <td>{{ row.level }}</td>
              <td>{{ row.name }}</td>
              <td>{{ row.spellGroup }}</td>
            </tr>
          </tbody>
        </table>
          <p v-else class="empty-hint">{{ UI.emptySpellsLearned }}</p>
      </section>

      <!-- ── Spezialisierungen ── -->
      <section v-if="hasSpecializations" class="card">
        <h2>{{ UI.secSpecializations }}</h2>
        <dl class="prop-list">
          <template v-if="(character.weaponSpecializations?.length ?? 0) > 0">
            <dt
              v-for="(_, i) in character.weaponSpecializations"
              :key="'ws-dt-' + i"
            >{{ UI.labelWeaponSpec }} {{ (character.weaponSpecializations!.length > 1) ? i + 1 : '' }}</dt>
            <dd
              v-for="(spec, i) in character.weaponSpecializations"
              :key="'ws-dd-' + i"
            >{{ spec }}</dd>
          </template>
          <template v-if="character.spellSpecialization">
            <dt>{{ UI.labelSpellSpec }}</dt>
            <dd>{{ (UI.spellGroupNames as Record<string, string>)[character.spellSpecialization] ?? character.spellSpecialization }}</dd>
          </template>
        </dl>
      </section>

      <!-- ── Footer ── -->
      <div class="footer-actions">
        <button class="btn-nav" @click="router.push({ name: 'home' })">{{ UI.navHome }}</button>
      </div>

    </template>
  </main>
</template>

<style scoped>
.sheet {
  max-width: 800px;
  margin: 0 auto;
  padding: 1.5rem;
  font-family: sans-serif;
}

.status { color: #555; }
.status.error { color: #c00; }

.unsupported-warning {
  font-weight: 600;
  margin-bottom: 1rem;
  padding: 0.5rem 0.75rem;
  background: #fff0f0;
  border: 1px solid #c00;
  border-radius: 4px;
}

.sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.sheet-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.sheet-title h1 { margin: 0; }

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
  gap: 0.5rem;
  align-items: center;
}

.btn-nav {
  display: inline-block;
  padding: 0.3rem 0.75rem;
  background: #fff;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.85em;
  color: #333;
  text-decoration: none;
}

.btn-nav:hover {
  background: #f0f0f0;
}

.btn-nav--disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
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

.prop-list {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin: 0;
}

.prop-list--wide {
  grid-template-columns: repeat(2, max-content 1fr);
}

.prop-list dt { color: #666; font-size: 0.9em; }
.prop-list dd { margin: 0; font-weight: 600; }

.skill-table {
  width: 100%;
  border-collapse: collapse;
}

.skill-table th,
.skill-table td {
  text-align: left;
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid #eee;
  font-size: 0.9em;
}

.skill-table th { background: #f0f0f0; font-weight: 600; }

.row-unlearned td { font-style: italic; }

.empty-hint { color: #888; font-style: italic; margin: 0; }

.footer-actions { margin-top: 1rem; }
</style>

