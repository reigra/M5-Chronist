<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RulesLoader } from '../services/RulesLoader'
import { characterLoadService } from '../services/CharacterLoadService'
import { characterStorage } from '../services/CharacterStorage'
import { UI } from '../constants/ui'
import { isCaster as checkCaster } from '../services/CharacterService'
import { useNotifications } from '../composables/useNotifications'
import { characterValidator } from '../services/CharacterValidator'
import type { Character, CharacterSkill, CharacterSpell } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { ValidationResult } from '../types/CharacterValidation'

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

const rules = ref<RulesData | null>(null)
const loading = ref(true)
const saving = ref(false)
const loadError = ref(false)
const { error: notifyError, ok } = useNotifications()
const validationResult = ref<ValidationResult | null>(null)
const validationExpanded = ref(false)
const autoFixing = ref(false)

const hasAutoFixableIssues = computed(() => {
  return (validationResult.value?.hasErrors || validationResult.value?.hasWarnings) ?? false
})

const severityLabel = (severity: 'error' | 'warning' | 'info'): string => {
  if (severity === 'error') return UI.validationSeverityError
  if (severity === 'warning') return UI.validationSeverityWarning
  return UI.validationSeverityInfo
}

/** True when editing an existing character, false when creating a new one. */
const isEdit = computed(() => route.name === 'character-edit')

// ── Form fields ───────────────────────────────────────────────────────────────

const id         = ref('')
const name       = ref('')
const player     = ref('')
const raceId     = ref('')
const typeId     = ref('')
const originId   = ref('')
const statusId   = ref('')
const totalEs    = ref(0)
const availableEp = ref(0)
const gold        = ref(0)

// Base properties
const St = ref(50)
const Gs = ref(50)
const Gw = ref(50)
const Ko = ref(50)
const In = ref(50)
const Zt = ref(10)

// Derived properties
const pA   = ref(0)
const Wk   = ref(0)
const Au   = ref(0)
const AusB = ref(0)
const LP   = ref(0)
const AP   = ref(0)
const SchB = ref(0)
const B    = ref(0)
const AnB  = ref(0)
const AbB  = ref(0)
const ZauB = ref(0)
const ResBg = ref(0)
const ResBk = ref(0)

/** Skills currently on the character being edited. */
const skills = ref<CharacterSkill[]>([])

/** The skill ID selected in the "add skill" dropdown. */
const skillToAdd = ref('')
const skillSearchQuery = ref('')
const skillShowDropdown = ref(false)

/** FW for the skill being added. */
const skillFwToAdd = ref(12)

/** Spell IDs currently on the character being edited. */
const spells = ref<CharacterSpell[]>([])

/** The spell ID selected in the "add spell" dropdown. */
const spellToAdd = ref('')
const spellSearchQuery = ref('')
const spellShowDropdown = ref(false)

/** Waffenspezialisierungen (bis zu 3, nur für Kämpfer/KampfZauberer) */
const weaponSpec1 = ref('')
const weaponSpec2 = ref('')
const weaponSpec3 = ref('')

/** Magier-Spezialgebiet (nur für Typ "Ma") */
const spellSpecialization = ref('')

// ── Personalia fields ─────────────────────────────────────────────────────────

const geschlecht  = ref('')
const haendigkeit = ref('')
const alter       = ref<number | null>(null)
const groesse     = ref<number | null>(null)
const gewicht     = ref<number | null>(null)
const gestalt     = ref('')
const glaube      = ref('')
const gg          = ref<number | null>(null)
const sg          = ref<number | null>(null)

// ── Computed ──────────────────────────────────────────────────────────────────

/** Skills not yet on the character — available to add.
 *  Multi-Instanz-Skills (z.B. Sprache) werden als einzelne Instanz-Einträge aufgeführt. */
const availableSkills = computed(() => {
  const r = rules.value
  if (!r || !r.skillRules) return []
  const existing = new Set(skills.value.map(s => s.skillId))
  const result: { id: string; name: string }[] = []
  for (const skill of r.skills) {
    if (skill.id === 'Zaubersprüche') continue
    const multiRule = r.skillRules.multiInstanceSkills.find(m => m.baseSkillId === skill.id)
    if (multiRule) {
      // Multi-Instanz: alle Instanzen einzeln anzeigen, bereits gelernte ausfiltern
      let instances: string[]
      const src = multiRule.instanceSource
      if (src.type === 'rules') {
        const list = (r as Record<string, unknown>)[src.rulesKey] as Array<Record<string, string>> | undefined
        instances = list?.map(item => item[src.nameField]) ?? []
      } else {
        instances = src.values
      }
      for (const inst of instances) {
        const instanceId = multiRule.idPrefix + inst
        if (!existing.has(instanceId)) {
          result.push({ id: instanceId, name: skill.name + ': ' + inst })
        }
      }
    } else if (!existing.has(skill.id)) {
      result.push({ id: skill.id, name: skill.name })
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
})
/** True if the selected type has spellCosts (can learn spells). */
const isCaster = computed(() => {
  const r = rules.value
  if (!r || !typeId.value) return false
  const t = r.types.find(x => x.id === typeId.value)
  return checkCaster(t)
})

/** Spells available to add: in the type’s spell groups, not yet on the character. */
const availableSpells = computed(() => {
  const r = rules.value
  if (!r || !typeId.value) return []
  const t = r.types.find(x => x.id === typeId.value)
  if (!t?.spellCosts) return []
  const groups = new Set(Object.keys(t.spellCosts))
  const learned = new Set(spells.value.map(s => s.spellId))
  return r.spells
    .filter(s => groups.has(normalizeGroup(s.spellGroup)) && !learned.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
})

const skillFiltered = computed(() => {
  const q = skillSearchQuery.value.toLowerCase()
  if (!q) return availableSkills.value
  return availableSkills.value.filter(s => s.name.toLowerCase().includes(q))
})

const spellFiltered = computed(() => {
  const q = spellSearchQuery.value.toLowerCase()
  if (!q) return availableSpells.value
  return availableSpells.value.filter(s => s.name.toLowerCase().includes(q))
})

/** Learned spells with display data, sorted by level then name. */
const spellRows = computed(() => {
  const r = rules.value
  if (!r) return spells.value.map(s => ({ id: s.spellId, name: s.spellId, level: 0, spellGroup: '—', pp: s.pp ?? 0 }))
  return spells.value
    .map(s => {
      const spell = r.spells.find(sp => sp.id === s.spellId)
      return { id: s.spellId, name: spell?.name ?? s.spellId, level: spell?.level ?? 0, spellGroup: normalizeGroup(spell?.spellGroup) ?? '—', pp: s.pp ?? 0 }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
})
/** Playable types: isMeta filtered out, sorted alphabetically. */
const playableTypes = computed(() => {
  const r = rules.value
  if (!r) return []
  return r.types
    .filter(t => !t.isMeta)
    .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
})

/** For display: look up skill names from rules.
 *  Multi-Instanz-Skills (z.B. "Sprache:Albisch") werden als "Sprache: Albisch" angezeigt. */
/**
 * Aggregierte Liste der bekannten Fertigkeiten für die Tabelle.
 * Jeder Eintrag enthält die CharacterSkill-Daten sowie den Anzeigenamen
 * und ein Flag isStacked für gestapelte Fertigkeiten (baseSkillId).
 */
const skillRows = computed(() => {
  const r = rules.value
  if (!r || !r.skillRules) return skills.value.map(s => ({ ...s, name: s.skillId, isStacked: false }))
  const sr = r.skillRules
  return skills.value.map(cs => {
    const ruleSkill = r.skills.find(s => s.id === cs.skillId)
    let name = ruleSkill?.name ?? cs.skillId
    const multiRule = sr.multiInstanceSkills.find(m => cs.skillId.startsWith(m.idPrefix))
    if (multiRule) {
      const baseSkill = r.skills.find(s => s.id === multiRule.baseSkillId)
      const instanceName = cs.skillId.slice(multiRule.idPrefix.length)
      name = (baseSkill?.name ?? multiRule.baseSkillId) + ': ' + instanceName
    }
    return { ...cs, name, isStacked: !!ruleSkill?.baseSkillId }
  }).sort((a, b) => a.name.localeCompare(b.name))
})
/** Ob der gewählte Typ eine Waffenspezialisierung wählen kann (Kämpfer oder KampfZauberer). */
const canHaveWeaponSpec = computed(() => {
  const r = rules.value
  if (!r || !typeId.value) return false
  const t = r.types.find(x => x.id === typeId.value)
  return t?.category === 'Kämpfer' || t?.category === 'KampfZauberer'
})

/** Anzahl der Waffenspezialisierungs-Slots: Krieger (Kr) erhält 3, alle anderen 1. */
const weaponSlotCount = computed(() => typeId.value === 'Kr' ? 3 : 1)

/** Ob der gewählte Typ ein Spezialgebiet wählen kann (nur Magier, id "Ma"). */
const canHaveSpellSpec = computed(() => typeId.value === 'Ma')

/** Spezialgebiet-Optionen des Magiers: spellGroup-Keys aus dem Typ. */
const spellSpecGroups = computed(() => {
  const r = rules.value
  if (!r || !typeId.value) return []
  const t = r.types.find(x => x.id === typeId.value)
  return Object.keys(t?.spellCosts ?? {})
})

/** Alle Waffen aus den geladenen Regeln, alphabetisch sortiert. */
const allWeapons = computed(() =>
  [...(rules.value?.equipment ?? [])]
    .filter(e => e.waffentyp)
    .sort((a, b) => a.name.localeCompare(b.name))
)

const closeSkillDropdown = (): void => {
  setTimeout(() => { skillShowDropdown.value = false }, 200)
}
const closeSpellDropdown = (): void => {
  setTimeout(() => { spellShowDropdown.value = false }, 200)
}

function selectSkill(item: { id: string; name: string }): void {
  skillToAdd.value = item.id
  skillSearchQuery.value = item.name
  skillShowDropdown.value = false
}

function selectSpell(spell: { id: string; name: string }): void {
  spellToAdd.value = spell.id
  spellSearchQuery.value = spell.name
  spellShowDropdown.value = false
}

watch(skillSearchQuery, (val) => {
  if (!val) skillToAdd.value = ''
})
watch(spellSearchQuery, (val) => {
  if (!val) spellToAdd.value = ''
})
// ── Helpers ───────────────────────────────────────────────────────────────────

/** Populate all form fields from an existing character. */
function fillForm(c: Character): void {
  id.value          = c.id
  name.value        = c.name
  player.value      = c.player
  raceId.value      = c.raceId
  typeId.value      = c.typeId
  originId.value    = c.originId
  statusId.value    = c.socialStatusId
  totalEs.value     = c.totalEs
  availableEp.value = c.availableEp
  gold.value        = c.gold ?? 0

  St.value  = c.properties.St
  Gs.value  = c.properties.Gs
  Gw.value  = c.properties.Gw
  Ko.value  = c.properties.Ko
  In.value  = c.properties.In
  Zt.value  = c.properties.Zt
  pA.value  = c.properties.pA
  Wk.value  = c.properties.Wk
  Au.value  = c.properties.Au
  LP.value  = c.properties.LP
  AP.value  = c.properties.AP
  B.value   = c.properties.B

  AusB.value  = c.boni.AusB
  SchB.value  = c.boni.SchB
  AnB.value   = c.boni.AnB
  AbB.value   = c.boni.AbB
  ZauB.value  = c.boni.ZauB
  ResBg.value = c.boni.ResBg
  ResBk.value = c.boni.ResBk

  skills.value = [...c.skills]
  spells.value = [...(c.spells ?? [])]
  const wSpecs = c.weaponSpecializations ?? []
  weaponSpec1.value = wSpecs[0] ?? ''
  weaponSpec2.value = wSpecs[1] ?? ''
  weaponSpec3.value = wSpecs[2] ?? ''
  spellSpecialization.value = c.spellSpecialization ?? ''

  geschlecht.value  = c.personalia?.geschlecht  ?? ''
  haendigkeit.value = c.personalia?.haendigkeit ?? ''
  alter.value       = c.personalia?.alter       ?? null
  groesse.value     = c.personalia?.groesse     ?? null
  gewicht.value     = c.personalia?.gewicht     ?? null
  gestalt.value     = c.personalia?.gestalt     ?? ''
  glaube.value      = c.personalia?.glaube      ?? ''
  gg.value          = c.personalia?.gg          ?? null
  sg.value          = c.personalia?.sg          ?? null
}

/** Build the Character object from the current form state. */
function buildCharacter(): Character {
  const now = new Date().toISOString()
  const existingId = id.value || crypto.randomUUID()
  return {
    id:             existingId,
    name:           name.value.trim(),
    player:         player.value.trim(),
    raceId:         raceId.value,
    typeId:         typeId.value,
    originId:       originId.value,
    socialStatusId: statusId.value,
    totalEs:        totalEs.value,
    availableEp:    availableEp.value,
    gold:           gold.value,
    properties: {
      St: St.value, Gs: Gs.value, Gw: Gw.value, Ko: Ko.value, In: In.value, Zt: Zt.value,
      pA: pA.value, Wk: Wk.value, Au: Au.value, LP: LP.value, AP: AP.value, B: B.value,
    },
    boni: {
      AusB: AusB.value, SchB: SchB.value, AnB: AnB.value, AbB: AbB.value,
      ZauB: ZauB.value, ResBg: ResBg.value, ResBk: ResBk.value,
    },
    skills:    [...skills.value],
    spells:    [...spells.value],
    weaponSpecializations: canHaveWeaponSpec.value
      ? [weaponSpec1.value, weaponSpec2.value, weaponSpec3.value]
          .slice(0, weaponSlotCount.value)
          .filter(s => s !== '')
      : [],
    spellSpecialization: canHaveSpellSpec.value && spellSpecialization.value
      ? spellSpecialization.value
      : undefined,
    personalia: {
      geschlecht:  geschlecht.value  || undefined,
      haendigkeit: haendigkeit.value || undefined,
      alter:       alter.value       ?? undefined,
      groesse:     groesse.value     ?? undefined,
      gewicht:     gewicht.value     ?? undefined,
      gestalt:     gestalt.value     || undefined,
      glaube:      glaube.value      || undefined,
      gg:          gg.value          ?? undefined,
      sg:          sg.value          ?? undefined,
    },
    createdAt: isEdit.value ? (id.value ? '' : now) : now, // preserved on edit
    updatedAt: now,
  }
}

/** Add the selected skill to the character's skill list.
 *  Bei Multi-Instanz-Skills wird der baseValue des Basis-Skills verwendet. */
function addSkill(): void {
  const sid = skillToAdd.value
  if (!sid) return
  const r = rules.value
  // Bei Multi-Instanz-Skills (z.B. "Sprache:Albisch") den Basis-Skill für den FW-Default holen
  const multiRule = r?.skillRules?.multiInstanceSkills.find(m => sid.startsWith(m.idPrefix))
  const baseSkillId = multiRule ? multiRule.baseSkillId : sid
  const ruleSkill = r?.skills.find(s => s.id === baseSkillId)
  const fw = skillFwToAdd.value ?? (ruleSkill?.baseValue ?? 12)
  skills.value = [...skills.value, { skillId: sid, value: fw, pp: 0 }]
  skillToAdd.value = ''
  skillSearchQuery.value = ''
  skillFwToAdd.value = ruleSkill?.baseValue ?? 12
}

/** Remove a skill from the character's skill list. */
function removeSkill(skillId: string): void {
  skills.value = skills.value.filter(s => s.skillId !== skillId)
}

/** Add the selected spell to the character's spell list. */
function addSpell(): void {
  const sid = spellToAdd.value
  if (!sid) return
  spells.value = [...spells.value, { spellId: sid, pp: 0 }]
  spellToAdd.value = ''
  spellSearchQuery.value = ''
}

/** Remove a spell from the character's spell list. */
function removeSpell(spellId: string): void {
  spells.value = spells.value.filter(s => s.spellId !== spellId)
}

/** Validate required fields. Returns an error message or null. */
function validate(): string | null {
  if (!name.value.trim()) return 'Name is required.'
  if (!raceId.value) return 'Race is required.'
  if (!typeId.value) return 'Type is required.'
  if (availableEp.value > totalEs.value) return 'Available EP cannot exceed total ES.'
  return null
}

/**
 * Wird bei User-Änderung von Rasse oder Klasse getriggert.
 * Validiert den aktuellen Formularstand und zeigt Fehler/Warnungen im Banner.
 * Ändert KEINE Formularfelder — nur validationResult.value wird gesetzt.
 */
function onRaceOrTypeChanged(): void {
  if (!rules.value || !raceId.value || !typeId.value) return
  const temp = buildCharacter()
  validationResult.value = characterValidator.validate(temp, rules.value)
}

/**
 * Copy fields not managed by the form (createdAt, inventory, techniques) from the stored
 * character when editing.
 *
 * @param character - Character built from the form.
 * @returns A new character with the preserved fields (or the input when creating).
 */
async function withPreservedFields(character: Character): Promise<Character> {
  if (!isEdit.value) return character
  const existing = await characterStorage.load(character.id)
  if (!existing) return character
  return {
    ...character,
    createdAt: existing.createdAt,
    inventory: existing.inventory,
    techniques: existing.techniques,
  }
}

/** Save the character to IndexedDB and navigate to the character sheet. */
async function saveCharacter(): Promise<void> {
  const validationError = validate()
  if (validationError) { notifyError(validationError); return }

  saving.value = true

  try {
    // Preserve data not managed by this form when editing
    const character = await withPreservedFields(buildCharacter())

    // Validate against rules and show issues
    if (rules.value) {
      const issues = characterValidator.validate(character, rules.value)
      validationResult.value = issues
      if (issues.hasErrors) {
        notifyError(`${issues.issues.filter(i => i.severity === 'error').length} Fehler gefunden — bitte prüfen.`)
        saving.value = false
        return
      }
    }

    await characterStorage.save(character)
    await router.push({ name: 'character-sheet', params: { id: character.id } })
  } catch (e) {
    notifyError(e instanceof Error ? e.message : 'Failed to save.')
  } finally {
    saving.value = false
  }
}

/** Korrigiert formel-basierte Werte im aktuellen Formular. */
const runCorrection = async (): Promise<void> => {
  if (!rules.value) return
  autoFixing.value = true
  try {
    const character = await withPreservedFields(buildCharacter())
    const result = characterValidator.correctIssues(character, rules.value)
    if (isEdit.value) {
      await characterStorage.save(result.fixed)
    }
    fillForm(result.fixed)
    const issues = characterValidator.validate(result.fixed, rules.value)
    validationResult.value = issues
    ok(UI.validationAutoFixDone)
  } catch (e) {
    notifyError(e instanceof Error ? e.message : 'Correction failed')
  } finally {
    autoFixing.value = false
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  try {
    const [loadedRules] = await Promise.all([new RulesLoader().load()])
    rules.value = loadedRules

    if (isEdit.value) {
      const charId = route.params.id as string
      const result = await characterLoadService.load(charId)
      if (!result.character) {
        loadError.value = true
        notifyError(`Character "${charId}" not found.`, null)
        return
      }
      fillForm(result.character)
      validationResult.value = result.issues
    }
  } catch (e) {
    loadError.value = true
    notifyError(e instanceof Error ? e.message : 'Failed to load rules.', null)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="form-page">
    <h1>{{ isEdit ? UI.formEditTitle : UI.formNewTitle }}</h1>

    <div v-if="loading" class="status">{{ UI.formLoadingRules }}</div>
    <div v-else-if="loadError" class="status error">{{ UI.failedToLoad }}</div>

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

    <form v-if="!loading && !loadError" class="char-form" @submit.prevent="saveCharacter">

      <!-- ── Identity ── -->
      <section class="card">
        <h2>{{ UI.secIdentity }}</h2>
        <div class="form-grid form-grid--identity">

          <label class="form-field">{{ UI.labelName }} *
            <input v-model="name" type="text" required :placeholder="UI.formCharNamePlaceholder" />
          </label>

          <label class="form-field">{{ UI.labelPlayer }}
            <input v-model="player" type="text" :placeholder="UI.formPlayerNamePlaceholder" />
          </label>

          <label class="form-field">{{ UI.labelRace }} *
            <select v-model="raceId" required @change="onRaceOrTypeChanged">
              <option value="" disabled>{{ UI.formSelectPlaceholder }}</option>
              <option v-for="r in rules?.races" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </label>

          <label class="form-field">{{ UI.labelType }} *
            <select v-model="typeId" required @change="onRaceOrTypeChanged">
              <option value="" disabled>{{ UI.formSelectPlaceholder }}</option>
              <option v-for="t in playableTypes" :key="t.id" :value="t.id">{{ t.name ?? t.id }}</option>
            </select>
          </label>

          <label class="form-field">{{ UI.labelOrigin }}
            <select v-model="originId">
              <option value="" disabled>{{ UI.formSelectPlaceholder }}</option>
              <option v-for="o in rules?.origins" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
          </label>

          <label class="form-field">{{ UI.labelSocialStatus }}
            <select v-model="statusId">
              <option value="" disabled>{{ UI.formSelectPlaceholder }}</option>
              <option v-for="s in rules?.socialStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </label>
        </div>
      </section>

      <!-- ── Personalia ── -->
      <section class="card">
        <h2>{{ UI.secPersonalia }}</h2>
        <div class="form-grid form-grid--personalia">

          <div class="form-pair">
            <label for="p-geschlecht">{{ UI.labelGeschlecht }}</label>
            <select id="p-geschlecht" v-model="geschlecht">
              <option value="">—</option>
              <option v-for="opt in UI.geschlechtOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>

          <div class="form-pair">
            <label for="p-haendigkeit">{{ UI.labelHaendigkeit }}</label>
            <select id="p-haendigkeit" v-model="haendigkeit">
              <option value="">—</option>
              <option v-for="opt in UI.haendigkeitOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>

          <div class="form-pair">
            <label for="p-alter">{{ UI.labelAlter }}</label>
            <input id="p-alter" v-model.number="alter" type="number" min="1" max="999" />
          </div>

          <div class="form-pair">
            <label for="p-groesse">{{ UI.labelGroesse }}</label>
            <input id="p-groesse" v-model.number="groesse" type="number" min="1" max="300" />
          </div>

          <div class="form-pair">
            <label for="p-gewicht">{{ UI.labelGewicht }}</label>
            <input id="p-gewicht" v-model.number="gewicht" type="number" min="1" max="999" />
          </div>

          <div class="form-pair">
            <label for="p-gestalt">{{ UI.labelGestalt }}</label>
            <input id="p-gestalt" v-model="gestalt" type="text" />
          </div>

          <div class="form-pair">
            <label for="p-glaube">{{ UI.labelGlaube }}</label>
            <input id="p-glaube" v-model="glaube" type="text" />
          </div>

          <div class="form-pair">
            <label for="p-gg">{{ UI.labelGG }}</label>
            <input id="p-gg" v-model.number="gg" type="number" min="0" max="99" />
          </div>

          <div class="form-pair">
            <label for="p-sg">{{ UI.labelSG }}</label>
            <input id="p-sg" v-model.number="sg" type="number" min="0" max="99" />
          </div>

        </div>
      </section>

      <!-- ── Experience ── -->
      <section class="card">
        <h2>{{ UI.secExperience }}</h2>
        <div class="form-grid form-grid--experience">
          <label class="form-field">{{ UI.formEsTotalLabel }}
            <input v-model.number="totalEs" type="number" min="0" max="999999" class="es-input" />
          </label>
          <label class="form-field">{{ UI.formEpAvailLabel }}
            <input v-model.number="availableEp" type="number" min="0" max="999999" class="es-input" />
          </label>
          <label class="form-field">{{ UI.formGoldLabel }}
            <input v-model.number="gold" type="number" min="0" max="999999" class="es-input" />
          </label>
        </div>
      </section>

      <!-- ── Eigenschaften ── -->
      <section class="card">
        <h2>{{ UI.secProps }}</h2>
        <div class="form-grid form-grid--props">

          <div class="form-pair">
            <label for="p-st">{{ UI.propAbbrSt }}</label>
            <input id="p-st" v-model.number="St" type="number" min="1" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-gs">{{ UI.propAbbrGs }}</label>
            <input id="p-gs" v-model.number="Gs" type="number" min="1" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-gw">{{ UI.propAbbrGw }}</label>
            <input id="p-gw" v-model.number="Gw" type="number" min="1" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-ko">{{ UI.propAbbrKo }}</label>
            <input id="p-ko" v-model.number="Ko" type="number" min="1" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-in">{{ UI.propAbbrIn }}</label>
            <input id="p-in" v-model.number="In" type="number" min="1" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-zt">{{ UI.propAbbrZt }}</label>
            <input id="p-zt" v-model.number="Zt" type="number" min="1" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-pa">{{ UI.propAbbrPa }}</label>
            <input id="p-pa" v-model.number="pA" type="number" min="-2" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-wk">{{ UI.propAbbrWk }}</label>
            <input id="p-wk" v-model.number="Wk" type="number" min="-2" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-au">{{ UI.propAbbrAu }}</label>
            <input id="p-au" v-model.number="Au" type="number" min="-2" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-lp">{{ UI.propAbbrLp }}</label>
            <input id="p-lp" v-model.number="LP" type="number" min="1" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-ap">{{ UI.propAbbrAp }}</label>
            <input id="p-ap" v-model.number="AP" type="number" min="1" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-b">{{ UI.propAbbrB }}</label>
            <input id="p-b" v-model.number="B" type="number" min="1" max="100" />
          </div>

        </div>
      </section>

      <!-- ── Boni ── -->
      <section class="card">
        <h2>{{ UI.secBoni }}</h2>
        <div class="form-grid form-grid--props">

          <div class="form-pair">
            <label for="p-ausb">{{ UI.propAbbrAusb }}</label>
            <input id="p-ausb" v-model.number="AusB" type="number" min="-2" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-schb">{{ UI.propAbbrSchb }}</label>
            <input id="p-schb" v-model.number="SchB" type="number" min="-2" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-anb">{{ UI.propAbbrAnb }}</label>
            <input id="p-anb" v-model.number="AnB" type="number" min="-2" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-abb">{{ UI.propAbbrAbb }}</label>
            <input id="p-abb" v-model.number="AbB" type="number" min="-2" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-zaub">{{ UI.propAbbrZaub }}</label>
            <input id="p-zaub" v-model.number="ZauB" type="number" min="-2" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-resbg">{{ UI.propAbbrResbg }}</label>
            <input id="p-resbg" v-model.number="ResBg" type="number" min="-2" max="100" />
          </div>

          <div class="form-pair">
            <label for="p-resbk">{{ UI.propAbbrResbk }}</label>
            <input id="p-resbk" v-model.number="ResBk" type="number" min="-2" max="100" />
          </div>

        </div>
      </section>

      <!-- ── Skills ── -->
      <section class="card">
        <h2>{{ UI.secSkills }}</h2>

        <!-- Vorhandene Fertigkeiten -->
        <table v-if="skillRows.length > 0" class="skill-table">
          <thead>
            <tr><th>{{ UI.colSkill }}</th><th>{{ UI.colFw }}</th><th>{{ UI.colPp }}</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="row in skillRows" :key="row.skillId">
              <td>{{ row.name }}</td>
              <td>
                <input
                  :value="row.value"
                  type="number"
                  :min="row.isStacked ? undefined : 1"
                  max="18"
                  class="fw-input"
                  @change="e => {
                    const idx = skills.findIndex(s => s.skillId === row.skillId)
                    if (idx !== -1) skills[idx] = { ...skills[idx], value: Number((e.target as HTMLInputElement).value) }
                  }"
                />
              </td>
              <td>
                <input
                  :value="row.pp ?? 0"
                  type="number"
                  min="0"
                  class="pp-input"
                  @change="e => {
                    const idx = skills.findIndex(s => s.skillId === row.skillId)
                    if (idx !== -1) skills[idx] = { ...skills[idx], pp: Number((e.target as HTMLInputElement).value) }
                  }"
                />
              </td>
              <td>
                <button type="button" class="btn-remove-inline" @click="removeSkill(row.skillId)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-hint">{{ UI.emptySkillsForm }}</p>

        <!-- Fertigkeit hinzufügen -->
        <div class="add-skill-row">
          <div class="search-wrapper">
            <input v-model="skillSearchQuery" type="text" :placeholder="UI.formAddSkillPlaceholder"
              class="skill-select"
              @focus="skillShowDropdown = true"
              @input="skillShowDropdown = true"
              @blur="closeSkillDropdown" />
            <ul v-if="skillShowDropdown && skillFiltered.length > 0" class="search-dropdown">
              <li v-for="s in skillFiltered" :key="s.id"
                @mousedown.prevent="selectSkill(s)" class="search-dropdown-item">
                {{ s.name }}
              </li>
            </ul>
          </div>
          <label class="fw-label">{{ UI.colFw }}
            <input v-model.number="skillFwToAdd" type="number"  class="fw-input" />
          </label>
          <button type="button" class="btn-add" :disabled="!skillToAdd" @click="addSkill">{{ UI.add }}</button>
        </div>
      </section>

      <!-- ── Spezialisierungen ── -->
      <section v-if="canHaveWeaponSpec || canHaveSpellSpec" class="card">
        <h2>{{ UI.secSpecializations }}</h2>
        <div class="form-grid form-grid--specs">

          <template v-if="canHaveWeaponSpec">
            <label class="form-field">{{ UI.labelWeaponSpec }} 1
              <select v-model="weaponSpec1">
                <option value="">{{ UI.formSelectPlaceholder }}</option>
                <option v-for="w in allWeapons" :key="w.id" :value="w.id">
                  {{ w.name }} ({{ w.waffentyp }})
                </option>
              </select>
            </label>
            <label v-if="weaponSlotCount >= 2" class="form-field">{{ UI.labelWeaponSpec }} 2
              <select v-model="weaponSpec2">
                <option value="">{{ UI.formSelectPlaceholder }}</option>
                <option v-for="w in allWeapons" :key="w.id" :value="w.id">
                  {{ w.name }} ({{ w.waffentyp }})
                </option>
              </select>
            </label>
            <label v-if="weaponSlotCount >= 3" class="form-field">{{ UI.labelWeaponSpec }} 3
              <select v-model="weaponSpec3">
                <option value="">{{ UI.formSelectPlaceholder }}</option>
                <option v-for="w in allWeapons" :key="w.id" :value="w.id">
                  {{ w.name }} ({{ w.waffentyp }})
                </option>
              </select>
            </label>
          </template>

          <label v-if="canHaveSpellSpec" class="form-field">{{ UI.labelSpellSpec }}
            <select v-model="spellSpecialization">
              <option value="">{{ UI.formSelectPlaceholder }}</option>
              <option v-for="g in spellSpecGroups" :key="g" :value="g">
                {{ (UI.spellGroupNames as Record<string, string>)[g] ?? g }}
              </option>
            </select>
          </label>
        </div>
      </section>

      <!-- ── Spells ── -->
      <section v-if="isCaster" class="card">
        <h2>{{ UI.spells }}</h2>

        <table v-if="spellRows.length > 0" class="skill-table">
          <thead>
            <tr><th>{{ UI.colLevel }}</th><th>{{ UI.labelName }}</th><th>{{ UI.colGroup }}</th><th>{{ UI.colPp }}</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="row in spellRows" :key="row.id">
              <td>{{ row.level }}</td>
              <td>{{ row.name }}</td>
              <td>{{ row.spellGroup }}</td>
              <td>
                <input
                  :value="row.pp"
                  type="number"
                  min="0"
                  class="pp-input"
                  @change="e => {
                    const idx = spells.findIndex(s => s.spellId === row.id)
                    if (idx !== -1) spells[idx] = { ...spells[idx], pp: Number((e.target as HTMLInputElement).value) }
                  }"
                />
              </td>
              <td>
                <button type="button" class="btn-remove-inline" @click="removeSpell(row.id)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-hint">{{ UI.emptySpellsForm }}</p>

        <div class="add-skill-row">
          <div class="search-wrapper">
            <input v-model="spellSearchQuery" type="text" :placeholder="UI.formAddSpellPlaceholder"
              class="skill-select"
              @focus="spellShowDropdown = true"
              @input="spellShowDropdown = true"
              @blur="closeSpellDropdown" />
            <ul v-if="spellShowDropdown && spellFiltered.length > 0" class="search-dropdown">
              <li v-for="s in spellFiltered" :key="s.id"
                @mousedown.prevent="selectSpell(s)" class="search-dropdown-item">
                {{ s.name }} <span class="search-dropdown-group">({{ UI.colLevel }} {{ s.level }})</span>
              </li>
            </ul>
          </div>
          <button type="button" class="btn-add" :disabled="!spellToAdd" @click="addSpell">{{ UI.add }}</button>
        </div>
      </section>

      <!-- ── Submit ── -->
      <div class="form-actions">
        <button type="submit" class="btn-save" :disabled="saving">
          {{ saving ? UI.formSaving : (isEdit ? UI.formSaveChanges : UI.formCreateChar) }}
        </button>
        <button type="button" class="btn" @click="router.back()">{{ UI.cancel }}</button>
      </div>

    </form>
  </main>
</template>

<style scoped>
.form-page {
  max-width: 700px;
  margin: 0 auto;
  padding: 1.5rem;
  font-family: sans-serif;
}

.status { color: #555; margin-bottom: 1rem; }
.status.error { color: #c00; }

.char-form { display: flex; flex-direction: column; gap: 1.25rem; }

.card {
  background: #fafafa;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.card h2 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #555;
}

label {
  display: flex;
  flex-direction: column;
  font-size: 0.85em;
  color: #555;
  gap: 0.2rem;
}

input, select {
  padding: 0.35rem 0.5rem;
  border: 1px solid #bbb;
  border-radius: 3px;
  font-size: 1rem;
}

.form-grid {
  display: grid;
  gap: 0.5rem 1.25rem;
}

.form-grid--identity {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}

.form-grid--personalia {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.form-grid--experience {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.form-grid--props {
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
}

.form-grid--specs {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.85em;
  color: #555;
}

.form-pair {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.form-pair label {
  font-size: 0.85em;
  color: #555;
}

.skill-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0.75rem;
}

.skill-table th,
.skill-table td {
  text-align: left;
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid #eee;
  font-size: 0.9em;
}

.skill-table th { background: #f0f0f0; }

.fw-input { width: 4rem; text-align: right; }
.pp-input { width: 3rem; text-align: right; }
.es-input  { width: 7rem; text-align: right; }

.btn-remove-inline {
  background: none;
  border: none;
  color: #a00;
  cursor: pointer;
  font-size: 0.9em;
  padding: 0.1rem 0.3rem;
}

.add-skill-row {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.skill-select { flex: 1; min-width: 12rem; }

.search-wrapper { position: relative; flex: 1; min-width: 12rem; }

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

.fw-label {
  flex-direction: row;
  align-items: center;
  gap: 0.4rem;
  color: #555;
  font-size: 0.85em;
}

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

.empty-hint { color: #888; font-style: italic; font-size: 0.9em; margin: 0; }

.form-actions {
  display: flex;
  gap: 0.75rem;
}
</style>
