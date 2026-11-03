<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { characterLoadService } from '../services/CharacterLoadService'
import { characterValidator } from '../services/CharacterValidator'
import { characterStorage } from '../services/CharacterStorage'
import type { ValidationResult } from '../types/CharacterValidation'
import { computeGrad, esForNextGrad } from '../services/GradUtils'
import { sheetSkillService } from '../services/SheetSkillService'
import { isCaster as checkCaster, canLearnTechniques, resolveName } from '../services/CharacterService'
import { UI } from '../constants/ui'
import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import { latexExportService } from '../services/LatexExportService'
import { sanitizeFileName, saveFileAs, isDriveAvailable } from '../services/FileProvider'
import { useNotifications } from '../composables/useNotifications'
//import clsContent from '../../tools/LaTeX/m5figur-mv.cls?raw'
import clsContent from '../../tools/LaTeX/m5figur-chronist.cls?raw'

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
const loadError = ref(false)
const validationResult = ref<ValidationResult | null>(null)
const { error, ok } = useNotifications()

const isOnline = ref(navigator.onLine)
window.addEventListener('online', () => { isOnline.value = true })
window.addEventListener('offline', () => { isOnline.value = false })
const showSpellDetail = ref(false)
const validationExpanded = ref(false)
const autoFixing = ref(false)

/** True if there are issues that correctIssues() can resolve. */
const hasAutoFixableIssues = computed(() => {
  return (validationResult.value?.hasErrors || validationResult.value?.hasWarnings) ?? false
})

// ── Computed ──────────────────────────────────────────────────────────────────

const grad = computed(() =>
  character.value ? computeGrad(character.value.totalEs) : 0,
)

const nextGradEs = computed(() =>
  character.value ? esForNextGrad(character.value.totalEs) : 0,
)

const raceName  = computed(() => resolveName(rules.value?.races,          character.value?.raceId))
const typeName  = computed(() => resolveName(rules.value?.types,          character.value?.typeId))
const originName = computed(() => resolveName(rules.value?.origins,       character.value?.originId))
const statusName = computed(() => resolveName(rules.value?.socialStatuses, character.value?.socialStatusId))

/** Map of path → severity for quick lookup of field-level issues. */
const issueMap = computed(() => {
  const map = new Map<string, 'error' | 'warning' | 'info'>()
  if (!validationResult.value) return map
  for (const issue of validationResult.value.issues) {
    if (!map.has(issue.path) || issue.severity === 'error') {
      map.set(issue.path, issue.severity)
    }
  }
  return map
})

const issueClass = (path: string): string => {
  const sev = issueMap.value.get(path)
  if (!sev) return ''
  return `has-issue has-issue--${sev}`
}

/** True if the character's type has spellCosts (can learn spells). */
const isCaster = computed(() => {
  const c = character.value; const r = rules.value
  if (!c || !r) return false
  const t = r.types.find(x => x.id === c.typeId)
  return checkCaster(t)
})

/** True if the character's type has fightCosts (can learn Kampftechniken). */
const hasTechniques = computed(() => {
  const c = character.value; const r = rules.value
  if (!c || !r) return false
  return canLearnTechniques(r.types.find(x => x.id === c.typeId))
})

/** Learned Kampftechniken for the sheet, sorted by discipline, level, name. */
const techniqueRows = computed(() => {
  const c = character.value; const r = rules.value
  if (!c || !r) return []
  return (c.techniques ?? [])
    .map(ct => {
      const t = r.techniques.find(x => x.id === ct.techniqueId)
      return { id: ct.techniqueId, name: t?.name ?? ct.techniqueId, level: t?.level ?? 0, discipline: t?.discipline ?? '—', apCost: t?.apCost ?? '' }
    })
    .sort((a, b) => a.discipline.localeCompare(b.discipline, 'de') || a.level - b.level || a.name.localeCompare(b.name, 'de'))
})

/**
 * Returns the first matching issue message for a given path, for tooltip display.
 */
const issueMessage = (path: string): string | undefined => {
  if (!validationResult.value) return undefined
  const issue = validationResult.value.issues.find(i => i.path === path)
  return issue?.message
}

const severityLabel = (severity: 'error' | 'warning' | 'info'): string => {
  if (severity === 'error') return UI.validationSeverityError
  if (severity === 'warning') return UI.validationSeverityWarning
  return UI.validationSeverityInfo
}

const toggleValidation = (): void => {
  validationExpanded.value = !validationExpanded.value
}

const runCorrection = async (): Promise<void> => {
  const c = character.value; const r = rules.value
  if (!c || !r) return
  autoFixing.value = true
  try {
    const result = characterValidator.correctIssues(c, r)
    await characterStorage.save(result.fixed)
    character.value = result.fixed
    // Re-validate after correction
    const issues = characterValidator.validate(result.fixed, r)
    validationResult.value = issues
    ok(UI.validationAutoFixDone)
  } catch (e) {
    error(e instanceof Error ? e.message : 'Correction failed')
  } finally {
    autoFixing.value = false
  }
}

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
  }).sort((a, b) => a.name.localeCompare(b.name, 'de'))
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
    error(e instanceof Error ? e.message : 'Export failed.')
  }
}

async function exportToDrive(): Promise<void> {
  const char = character.value
  if (!char) return
  try {
    await characterStorage.exportToDrive(char)
    ok(UI.driveExportSuccess)
  } catch (e) {
    error(e instanceof Error ? (UI.driveErrorPrefix + ' ' + e.message) : 'Export failed.')
  }
}

async function exportLatex(): Promise<void> {
  const char = character.value; const r = rules.value
  if (!char || !r) return
  try {
    const tex = latexExportService.generate(char, r)
    const name = sanitizeFileName(char.name) + '.tex'
    await saveFileAs(tex, name, 'text/plain')
  } catch (e) {
    error(e instanceof Error ? e.message : 'LaTeX export failed.')
  }
}

function exportLatexPdf(): void {
  const char = character.value; const r = rules.value
  if (!char || !r) return
  if (!isOnline.value) {
    error('PDF-Export benötigt eine Internetverbindung.')
    return
  }

  const tex = latexExportService.generate(char, r)
  const form = document.createElement('form')
  form.action = 'https://texlive.net/cgi-bin/latexcgi'
  form.method = 'POST'
  form.enctype = 'multipart/form-data'
  form.target = '_blank'

  const addField = (name: string, value: string) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }

  addField('filename[]', 'document.tex')
  addField('filecontents[]', tex)
  addField('filename[]', 'm5figur-chronist.cls')
//  addField('filename[]', 'm5figur-mv.cls')
  addField('filecontents[]', clsContent)
  addField('return', 'pdf')

  document.body.appendChild(form)
  form.submit()
  document.body.removeChild(form)
}

onMounted(async () => {
  try {
    const id = route.params.id as string
    const result = await characterLoadService.load(id)
    if (!result.character) {
      loadError.value = true
      error(`Character "${id}" not found.`, null)
      return
    }
    character.value = result.character
    rules.value = result.rules
    validationResult.value = result.issues
  } catch (e) {
    loadError.value = true
    error(e instanceof Error ? e.message : 'Failed to load data.', null)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="sheet">

    <div v-if="loading" class="status">{{ UI.loading }}</div>
    <div v-else-if="loadError" class="status error">{{ UI.failedToLoad }}</div>

    <template v-else-if="character">

      <!-- ── Validation Banner ── -->
      <div v-if="validationResult && (validationResult.hasErrors || validationResult.hasWarnings)" class="validation-banner" :class="{ 'validation-banner--expanded': validationExpanded }">
        <button type="button" class="validation-banner-summary" @click="toggleValidation" :title="UI.validationClickForDetails">
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
          <router-link
            v-if="hasTechniques && !isUnsupportedType"
            :to="{ name: 'techniques', params: { id: character.id } }"
            class="btn-nav"
          >{{ UI.techniques }}</router-link>
          <router-link :to="{ name: 'character-edit', params: { id: character.id } }" class="btn-nav">{{ UI.navEdit }}</router-link>
          <router-link :to="{ name: 'equipment', params: { id: character.id } }" class="btn-nav">{{ UI.navEquipment }}</router-link>
        </nav>
        <nav class="sheet-nav sheet-nav--export">
          <button
            class="btn-nav"
            @click="exportCharacter"
          >{{ UI.sheetExport }}</button>
          <button
            class="btn-nav"
            :disabled="isUnsupportedType"
            @click="exportLatex"
          >{{ UI.sheetExportLatex }}</button>
          <button
            class="btn-nav"
            :disabled="isUnsupportedType || !isOnline"
            :title="!isOnline ? 'PDF-Export benötigt Internet' : ''"
            @click="exportLatexPdf"
          >{{ UI.sheetExportLatexPdf }}</button>
          <button
            v-if="isDriveAvailable()"
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
            <span class="prop-value" :class="issueClass('properties.St')" :title="issueMessage('properties.St')">{{ character.properties.St }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propGs }}</span>
            <span class="prop-value" :class="issueClass('properties.Gs')" :title="issueMessage('properties.Gs')">{{ character.properties.Gs }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propGw }}</span>
            <span class="prop-value" :class="issueClass('properties.Gw')" :title="issueMessage('properties.Gw')">{{ character.properties.Gw }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propKo }}</span>
            <span class="prop-value" :class="issueClass('properties.Ko')" :title="issueMessage('properties.Ko')">{{ character.properties.Ko }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propIn }}</span>
            <span class="prop-value" :class="issueClass('properties.In')" :title="issueMessage('properties.In')">{{ character.properties.In }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propZt }}</span>
            <span class="prop-value" :class="issueClass('properties.Zt')" :title="issueMessage('properties.Zt')">{{ character.properties.Zt }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propPa }}</span>
            <span class="prop-value" :class="issueClass('properties.pA')" :title="issueMessage('properties.pA')">{{ character.properties.pA }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propWk }}</span>
            <span class="prop-value" :class="issueClass('properties.Wk')" :title="issueMessage('properties.Wk')">{{ character.properties.Wk }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propAu }}</span>
            <span class="prop-value" :class="issueClass('properties.Au')" :title="issueMessage('properties.Au')">{{ character.properties.Au }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propLp }}</span>
            <span class="prop-value" :class="issueClass('properties.LP')" :title="issueMessage('properties.LP')">{{ character.properties.LP }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propAp }}</span>
            <span class="prop-value" :class="issueClass('properties.AP')" :title="issueMessage('properties.AP')">{{ character.properties.AP }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propB }}</span>
            <span class="prop-value" :class="issueClass('properties.B')" :title="issueMessage('properties.B')">{{ character.properties.B }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propAusb }}</span>
            <span class="prop-value" :class="issueClass('boni.AusB')" :title="issueMessage('boni.AusB')">{{ character.boni.AusB }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propSchb }}</span>
            <span class="prop-value" :class="issueClass('boni.SchB')" :title="issueMessage('boni.SchB')">{{ character.boni.SchB }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propAnb }}</span>
            <span class="prop-value" :class="issueClass('boni.AnB')" :title="issueMessage('boni.AnB')">{{ character.boni.AnB }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propAbb }}</span>
            <span class="prop-value" :class="issueClass('boni.AbB')" :title="issueMessage('boni.AbB')">{{ character.boni.AbB }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propZaub }}</span>
            <span class="prop-value" :class="issueClass('boni.ZauB')" :title="issueMessage('boni.ZauB')">{{ character.boni.ZauB }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propResbg }}</span>
            <span class="prop-value" :class="issueClass('boni.ResBg')" :title="issueMessage('boni.ResBg')">{{ character.boni.ResBg }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">{{ UI.propResbk }}</span>
            <span class="prop-value" :class="issueClass('boni.ResBk')" :title="issueMessage('boni.ResBk')">{{ character.boni.ResBk }}</span>
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
          <div v-for="row in weaponRows" :key="row.name" class="skill-row skill-row--with-pp" :class="issueClass('skills.' + row.skillId + '.value')" :title="issueMessage('skills.' + row.skillId + '.value')">
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
          <div v-for="row in learnedRows" :key="row.name" class="skill-row skill-row--with-pp" :class="issueClass('skills.' + row.skillId + '.value')" :title="issueMessage('skills.' + row.skillId + '.value')">
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

      <!-- ── Kampftechniken ── -->
      <section v-if="techniqueRows.length > 0" class="card">
        <div class="section-header">
          <h2>{{ UI.techniques }}</h2>
        </div>
        <table class="skill-table">
          <thead>
            <tr>
              <th>{{ UI.colLevel }}</th>
              <th>{{ UI.labelName }}</th>
              <th>{{ UI.techColDiscipline }}</th>
              <th>{{ UI.techColAp }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in techniqueRows" :key="row.id">
              <td>{{ row.level }}</td>
              <td>{{ row.name }}</td>
              <td>{{ row.discipline }}</td>
              <td>{{ row.apCost }}</td>
            </tr>
          </tbody>
        </table>
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

.validation-banner {
  background: #fff8e1;
  border: 1px solid #f0c040;
  border-radius: 4px;
  padding: 0.25rem 0.75rem;
  margin-bottom: 1rem;
  font-size: 0.9em;
  font-weight: 600;
}

.validation-banner--expanded {
  padding-bottom: 0.5rem;
}

.validation-banner-summary {
  display: flex;
  gap: 1rem;
  align-items: center;
  width: 100%;
  padding: 0.25rem 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
}

.validation-banner-summary:hover {
  opacity: 0.8;
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
  flex-direction: column;
  margin-bottom: 1.5rem;
  gap: 0.75rem;
}

.sheet-nav {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.sheet-nav--export {
  width: 100%;
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

.has-issue { position: relative; }
.has-issue--error { color: #c00; font-weight: 700; }
.has-issue--warning { color: #b8860b; font-weight: 600; }
.has-issue--info { color: #555; }

.empty-hint { color: #888; font-style: italic; margin: 0; }

.footer-actions { margin-top: 1rem; }
</style>

