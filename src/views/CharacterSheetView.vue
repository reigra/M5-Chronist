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

// ── Google Drive Sichtbarkeit ─────────────────────────────────────────────────
const isDriveVisible = import.meta.env.DEV || import.meta.env.VITE_GOOGLE_DRIVE_VISIBLE === 'true'

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Add a numeric bonus to a dice damage string.
 * e.g. "1W6+1" + 3 → "1W6+4", "2W6-2" + 3 → "2W6+1"
 */
function addDamageBonus(damage: string, bonus: number): string {
  if (bonus === 0) return damage
  const clean = damage.replace(/\s+/g, '')
  const m = clean.match(/^(\d+)W(\d+)([+-]\d+)?$/i)
  if (!m) return damage
  const base = m[3] ? parseInt(m[3], 10) : 0
  const total = base + bonus
  if (total === 0) return `${m[1]}W${m[2]}`
  const sign = total >= 0 ? '+' : ''
  return `${m[1]}W${m[2]}${sign}${total}`
}

function weaponTypeSortKey(group: string): number {
  if (group.includes('Angriff')) return 0
  if (group.includes('Fern')) return 1
  if (group.includes('Verteidigung')) return 2
  return 0
}

interface CombatRow {
  name: string
  ew: number
  damageDisplay: string | null
  apSchutz: number | null
  isDefense: boolean
}

// ── State ─────────────────────────────────────────────────────────────────────

const route = useRoute()
const router = useRouter()

const character = ref<Character | null>(null)
const rules = ref<RulesData | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)

const showSpellDetail = ref(false)

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

/** True if the character's type has spellCosts (can learn spells). */
const isCaster = computed(() => {
  const c = character.value; const r = rules.value
  if (!c || !r) return false
  const t = r.types.find(x => x.id === c.typeId)
  const sc = t?.spellCosts
  return !!sc && Object.keys(sc).length > 0
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
  return (c.spells ?? []).map(s => {
    const spellId = typeof s === 'string' ? s : s.spellId
    const spell = r.spells.find(sp => sp.id === spellId)
    if (!spell) return { id: spellId, name: spellId, level: 0, spellGroup: '—', pp: typeof s === 'string' ? 0 : (s.pp ?? 0) }

    const desc = spell.shortDescription || r.spellDescriptions?.find(d => d.id === spellId)?.description || ''
    return {
      id: spellId,
      name: spell.name,
      level: spell.level,
      spellGroup: spell.spellGroup,
      spellType: spell.spellType,
      apCost: spell.apCost,
      castingTime: spell.castingTime,
      range: spell.range,
      targetType: spell.targetType,
      effectArea: spell.effectArea,
      duration: spell.duration,
      displayDescription: desc,
      pp: typeof s === 'string' ? 0 : (s.pp ?? 0),
    }
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

/** Weapons from inventory with combat stats. */
const combatRows = computed((): CombatRow[] => {
  const c = character.value
  if (!c) return []

  const rows: (CombatRow & { sortKey: number })[] = []

  const boni = c.boni
  const hasSkill = (id: string) => c.skills.some(s => s.skillId === id)
  const skillVal = (id: string) => c.skills.find(s => s.skillId === id)?.value ?? 0

  // ── 1. Feste Fertigkeiten (festgelegte Reihenfolge) ──

  if (hasSkill('Abwehr')) {
    rows.push({
      name: 'Abwehr', ew: skillVal('Abwehr') + (boni?.AbB ?? 0),
      damageDisplay: null, apSchutz: null, isDefense: false, sortKey: 0,
    })
  }

  if (hasSkill('Resistenz')) {
    const v = skillVal('Resistenz')
    rows.push({ name: 'Resistenz (Geist)', ew: v + (boni?.ResBg ?? 0), damageDisplay: null, apSchutz: null, isDefense: false, sortKey: 1 })
    rows.push({ name: 'Resistenz (Körper)', ew: v + (boni?.ResBk ?? 0), damageDisplay: null, apSchutz: null, isDefense: false, sortKey: 2 })
  }

  if (hasSkill('Raufen')) {
    rows.push({
      name: 'Raufen', ew: skillVal('Raufen') + (boni?.AnB ?? 0),
      damageDisplay: addDamageBonus('1W6-4', boni?.SchB ?? 0), apSchutz: null, isDefense: false, sortKey: 3,
    })
  }

  // ── 2. Waffen aus Inventar ──

  for (const item of (c.inventory ?? []).filter(i => i.waffe)) {
    const group = item.group ?? ''
    const sk = weaponTypeSortKey(group) + 4

    if (group.includes('Verteidigung')) {
      rows.push({
        name: item.name, ew: skillVal(item.skillId ?? '') + (item.abb ?? 0),
        damageDisplay: null, apSchutz: item.saveAP ?? null, isDefense: true, sortKey: sk,
      })
      continue
    }

    const anbTotal = (boni?.AnB ?? 0) + (item.anb ?? 0) + ((item.spezialwaffe ?? false) ? 2 : 0)
    const ew = skillVal(item.skillId ?? '') + anbTotal

    let damageDisplay: string | null = null
    if (item.damage) {
      const schbTotal = group.includes('Angriff')
        ? (boni?.SchB ?? 0) + (item.schb ?? 0)
        : (item.schb ?? 0)
      damageDisplay = addDamageBonus(item.damage, schbTotal)
    }

    rows.push({ name: item.name, ew, damageDisplay, apSchutz: null, isDefense: false, sortKey: sk })
  }

  // ── 3. Sortieren ──

  rows.sort((a, b) => a.sortKey - b.sortKey || a.name.localeCompare(b.name))
  return rows
})

/** Adjust PP for a learned skill and persist. */
async function adjustPp(skillId: string, delta: number): Promise<void> {
  const c = character.value
  if (!c) return
  const idx = c.skills.findIndex(s => s.skillId === skillId)
  if (idx === -1) return
  const current = c.skills[idx].pp ?? 0
  if (current + delta < 0) return
  const updated = {
    ...c,
    skills: c.skills.map(s =>
      s.skillId === skillId ? { ...s, pp: Math.max(0, (s.pp ?? 0) + delta) } : s,
    ),
    updatedAt: new Date().toISOString(),
  }
  await characterStorage.save(updated)
  character.value = updated
}

/** Adjust PP for a spell and persist. */
async function adjustSpellPp(spellId: string, delta: number): Promise<void> {
  const c = character.value
  if (!c) return
  const idx = c.spells.findIndex(s => (typeof s === 'string' ? s : s.spellId) === spellId)
  if (idx === -1) return
  const current = (typeof c.spells[idx] === 'string' ? 0 : (c.spells[idx] as any).pp) ?? 0
  if (current + delta < 0) return
  const updated = {
    ...c,
    spells: c.spells.map(s => {
      const sid = typeof s === 'string' ? s : s.spellId
      if (sid !== spellId) return s
      return { spellId: sid, pp: Math.max(0, ((typeof s === 'string' ? 0 : (s as any).pp) ?? 0) + delta) }
    }),
    updatedAt: new Date().toISOString(),
  }
  await characterStorage.save(updated)
  character.value = updated
}

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

async function exportToDrive(): Promise<void> {
  const char = character.value
  if (!char) return
  try {
    await characterStorage.exportToDrive(char)
  } catch (e) {
    errorMessage.value = e instanceof Error ? (UI.driveErrorPrefix + ' ' + e.message) : 'Export failed.'
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
            @click="exportCharacter"
          >{{ UI.sheetExport }}</button>
          <button
            v-if="isDriveVisible"
            class="btn-nav"
            @click="exportToDrive"
          >{{ UI.exportGoogleDrive }}</button>
        </nav>
      </header>

      <!-- ── Unsupported type warning ── -->
      <div v-if="isUnsupportedType" class="status error unsupported-warning">
        {{ UI.sheetUnsupportedType }}
      </div>

      <!-- ── Identität, Personalia & Spezialisierungen ── -->
      <section class="card">
        <h2>{{ UI.secIdentityPersonalia }}</h2>
        <div class="prop-grid prop-grid--identity">
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelPlayer }}</span>
            <span class="prop-value">{{ character.player }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelRace }}</span>
            <span class="prop-value">{{ raceName }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelType }}</span>
            <span class="prop-value">{{ typeName }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelOrigin }}</span>
            <span class="prop-value">{{ originName }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelStatus }}</span>
            <span class="prop-value">{{ statusName }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelGeschlecht }}</span>
            <span class="prop-value">{{ character.personalia?.geschlecht ?? UI.notApplicable }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelHaendigkeit }}</span>
            <span class="prop-value">{{ character.personalia?.haendigkeit ?? UI.notApplicable }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelAlter }}</span>
            <span class="prop-value">{{ character.personalia?.alter ?? UI.notApplicable }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelGroesse }}</span>
            <span class="prop-value">{{ character.personalia?.groesse ?? UI.notApplicable }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelGewicht }}</span>
            <span class="prop-value">{{ character.personalia?.gewicht ?? UI.notApplicable }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelGestalt }}</span>
            <span class="prop-value">{{ character.personalia?.gestalt ?? UI.notApplicable }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelGlaube }}</span>
            <span class="prop-value">{{ character.personalia?.glaube ?? UI.notApplicable }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelGG }}</span>
            <span class="prop-value">{{ character.personalia?.gg ?? UI.notApplicable }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelSG }}</span>
            <span class="prop-value">{{ character.personalia?.sg ?? UI.notApplicable }}</span>
          </div>
          <template v-if="hasSpecializations">
            <div v-for="(spec, i) in (character.weaponSpecializations ?? [])" :key="'ws-' + i" class="prop-row">
              <span class="prop-label">{{ UI.labelWeaponSpec }}{{ (character.weaponSpecializations!.length > 1) ? ' ' + (i + 1) : '' }}</span>
              <span class="prop-value">{{ spec }}</span>
            </div>
            <div v-if="character.spellSpecialization" class="prop-row">
              <span class="prop-label">{{ UI.labelSpellSpec }}</span>
              <span class="prop-value">{{ (UI.spellGroupNames as Record<string, string>)[character.spellSpecialization] ?? character.spellSpecialization }}</span>
            </div>
          </template>
        </div>
      </section>

      <!-- ── Experience ── -->
      <section class="card">
        <h2>{{ UI.secExperience }}</h2>
        <div class="prop-grid prop-grid--experience">
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelGrad }}</span>
            <span class="prop-value">{{ grad }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelEsTotal }}</span>
            <span class="prop-value">{{ character.totalEs }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelEpAvail }}</span>
            <span class="prop-value">{{ character.availableEp }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelGold }}</span>
            <span class="prop-value">{{ character.gold ?? 0 }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.labelNextGrad }}</span>
            <span class="prop-value">{{ nextGradEs }} {{ UI.unitEs }}</span>
          </div>
        </div>
      </section>

      <!-- ── Eigenschaften & Boni ── -->
      <section class="card">
        <h2>{{ UI.secPropsBoni }}</h2>
        <div class="prop-grid prop-grid--props">
          <div class="prop-row">
            <span class="prop-label">{{ UI.propSt }}</span>
            <span class="prop-value">{{ character.properties.St }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propGs }}</span>
            <span class="prop-value">{{ character.properties.Gs }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propGw }}</span>
            <span class="prop-value">{{ character.properties.Gw }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propKo }}</span>
            <span class="prop-value">{{ character.properties.Ko }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propIn }}</span>
            <span class="prop-value">{{ character.properties.In }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propZt }}</span>
            <span class="prop-value">{{ character.properties.Zt }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propPa }}</span>
            <span class="prop-value">{{ character.properties.pA }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propWk }}</span>
            <span class="prop-value">{{ character.properties.Wk }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propAu }}</span>
            <span class="prop-value">{{ character.properties.Au }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propLp }}</span>
            <span class="prop-value">{{ character.properties.LP }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propAp }}</span>
            <span class="prop-value">{{ character.properties.AP }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propB }}</span>
            <span class="prop-value">{{ character.properties.B }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propAusb }}</span>
            <span class="prop-value">{{ character.boni.AusB }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propSchb }}</span>
            <span class="prop-value">{{ character.boni.SchB }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propAnb }}</span>
            <span class="prop-value">{{ character.boni.AnB }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propAbb }}</span>
            <span class="prop-value">{{ character.boni.AbB }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propZaub }}</span>
            <span class="prop-value">{{ character.boni.ZauB }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propResbg }}</span>
            <span class="prop-value">{{ character.boni.ResBg }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propResbk }}</span>
            <span class="prop-value">{{ character.boni.ResBk }}</span>
          </div>
        </div>
      </section>

      <!-- ── Kampf ── -->
      <section v-if="combatRows.length > 0" class="card">
        <h2>{{ UI.secCombat }}</h2>
        <div class="combat-grid">
          <template v-for="row in combatRows" :key="row.name">
            <span class="combat-name">{{ row.name }}</span>
            <span class="combat-ew">{{ row.ew >= 0 ? '+' + row.ew : row.ew }}</span>
            <span class="combat-stat">{{ row.damageDisplay ?? (row.apSchutz != null ? '-' + row.apSchutz + ' AP' : '—') }}</span>
          </template>
        </div>
      </section>

      <!-- ── Waffenfertigkeiten ── -->
      <section v-if="weaponRows.length > 0" class="card">
        <h2>{{ UI.secWeaponSkills }}</h2>
        <div class="skill-grid skill-grid--weapons">
          <div v-for="row in weaponRows" :key="row.name" class="skill-row skill-row--with-pp">
            <span>{{ row.name }}</span>
            <span>{{ row.displayEw >= 0 ? '+' + row.displayEw : row.displayEw }}</span>
            <span class="pp-control">
              <button type="button" class="btn-pp" :disabled="(row.pp ?? 0) <= 0" @click="adjustPp(row.skillId, -1)">−</button>
              <span class="pp-value">{{ UI.colPp }} {{ row.pp ?? 0 }}</span>
              <button type="button" class="btn-pp" @click="adjustPp(row.skillId, 1)">+</button>
            </span>
          </div>
        </div>
      </section>

      <!-- ── Gelernte Fertigkeiten ── -->
      <section v-if="learnedRows.length > 0" class="card">
        <h2>{{ UI.secSkills }}</h2>
        <div class="skill-grid skill-grid--learned">
          <div v-for="row in learnedRows" :key="row.name" class="skill-row skill-row--with-pp">
            <span>{{ row.name }}</span>
            <span>{{ row.displayEw >= 0 ? '+' + row.displayEw : row.displayEw }}</span>
            <span class="pp-control">
              <button type="button" class="btn-pp" :disabled="(row.pp ?? 0) <= 0" @click="adjustPp(row.skillId, -1)">−</button>
              <span class="pp-value">{{ UI.colPp }} {{ row.pp ?? 0 }}</span>
              <button type="button" class="btn-pp" @click="adjustPp(row.skillId, 1)">+</button>
            </span>
          </div>
        </div>
      </section>

      <!-- ── Ungelernte Fertigkeiten ── -->
      <section v-if="unlearnedRows.length > 0" class="card">
        <h2>{{ UI.secUnlearnedSkills }}</h2>
        <div class="skill-grid skill-grid--unlearned">
          <div v-for="row in unlearnedRows" :key="row.name" class="skill-row skill-row--unlearned">
            <span>{{ row.name }}*</span>
            <span>{{ row.displayEw >= 0 ? '+' + row.displayEw : row.displayEw }}</span>
          </div>
        </div>
      </section>

      <!-- ── Spells ── -->
      <section v-if="spellRows.length > 0" class="card">
        <div class="section-header">
          <h2>{{ UI.spells }}</h2>
          <button v-if="spellRows.length > 0" class="btn-toggle" @click="showSpellDetail = !showSpellDetail">
            {{ showSpellDetail ? UI.spellOverviewView : UI.spellDetailView }}
          </button>
        </div>
        <table v-if="!showSpellDetail && spellRows.length > 0" class="skill-table">
          <thead>
            <tr>
              <th>{{ UI.colLevel }}</th>
              <th>{{ UI.labelName }}</th>
              <th>{{ UI.colGroup }}</th>
              <th>{{ UI.colPp }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in spellRows" :key="row.id">
              <td>{{ row.level }}</td>
              <td>{{ row.name }}</td>
              <td>{{ row.spellGroup }}</td>
              <td class="pp-cell">{{ row.pp ?? 0 }}</td>
              <td class="pp-control">
                <button type="button" class="btn-pp" :disabled="(row.pp ?? 0) <= 0" @click="adjustSpellPp(row.id, -1)">−</button>
                <button type="button" class="btn-pp" @click="adjustSpellPp(row.id, 1)">+</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else-if="showSpellDetail && spellRows.length > 0" class="spell-detail-list">
          <div v-for="row in spellRows" :key="row.id" class="spell-detail-item">
            <div class="spell-detail-line1">
              <span class="spell-name">{{ row.name }}</span>
              <span class="spell-meta">{{ row.spellType }} | AP: {{ row.apCost }} | {{ row.castingTime }} | {{ row.range }} | {{ row.targetType }} | {{ row.effectArea }} | {{ row.duration }}</span>
            </div>
            <div v-if="row.displayDescription" class="spell-detail-line2">{{ row.displayDescription }}</div>
          </div>
        </div>
        <p v-else class="empty-hint">{{ UI.emptySpellsLearned }}</p>
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

.card {
  background: #fafafa;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
}

.card h2 {
  margin: 0;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #555;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.btn-toggle {
  padding: 0.2rem 0.6rem;
  background: #fff;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.8em;
  color: #555;
}

.btn-toggle:hover {
  background: #e8e8e8;
}

.spell-detail-item {
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
  font-size: 0.9em;
}

.spell-detail-item:last-child {
  border-bottom: none;
}

.spell-detail-line1 {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
}

.spell-name {
  font-weight: 600;
  white-space: nowrap;
}

.spell-meta {
  color: #666;
  white-space: normal;
}

.spell-detail-line2 {
  margin-top: 0.2rem;
  color: #444;
  font-size: 0.95em;
  line-height: 1.4;
}

.prop-grid {
  display: grid;
  gap: 0.25rem 1.5rem;
}

.prop-grid--identity {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.prop-grid--experience {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.prop-grid--props {
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}

.prop-row {
  display: flex;
  gap: 0.4rem;
  padding: 0.15rem 0;
}

.prop-label {
  color: #666;
  font-size: 0.9em;
  white-space: nowrap;
}

.prop-value {
  font-weight: 600;
  margin-left: auto;
  text-align: right;
}

.skill-table {
  width: auto;
  border-collapse: collapse;
}

.skill-table td {
  white-space: nowrap;
  padding: 0.35rem 1rem 0.35rem 0;
  border-bottom: 1px solid #eee;
  font-size: 0.9em;
}

.skill-table td:last-child {
  text-align: right;
  padding: 0.35rem 0;
}

.skill-grid {
  display: grid;
  gap: 0 1.5rem;
}

.skill-grid--weapons {
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

.skill-grid--learned {
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.skill-grid--unlearned {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.skill-row {
  display: flex;
  justify-content: space-between;
  padding: 0.35rem 0;
  border-bottom: 1px solid #eee;
  font-size: 0.9em;
}

.skill-row span:last-child {
  text-align: right;
  white-space: nowrap;
}

.skill-row--unlearned { font-style: italic; }

.combat-grid {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0 0.75rem;
  align-items: center;
}

.combat-grid > * {
  padding: 0.35rem 0;
  border-bottom: 1px solid #eee;
  font-size: 0.9em;
}

.combat-ew,
.combat-stat {
  text-align: right;
  white-space: nowrap;
}

.skill-row--with-pp {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.5rem;
  align-items: center;
}

.pp-control {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.pp-value {
  font-size: 0.85em;
  color: #666;
  white-space: nowrap;
}

.combat-stat {
  white-space: nowrap;
  text-align: right;
}

.btn-pp {
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: 1px solid #aaa;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  font-size: 0.85em;
  font-weight: 600;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-pp:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-pp:hover:not(:disabled) {
  background: #e8e8e8;
}

.pp-cell {
  text-align: center !important;
  font-weight: 600;
}

.empty-hint { color: #888; font-style: italic; margin: 0; }

.footer-actions { margin-top: 1rem; }
</style>

