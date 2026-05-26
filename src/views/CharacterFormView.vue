<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RulesLoader } from '../services/RulesLoader'
import { characterStorage } from '../services/CharacterStorage'
import { UI } from '../constants/ui'
import type { Character, CharacterSkill } from '../types/Character'
import type { RulesData } from '../types/Rules'

// ── State ─────────────────────────────────────────────────────────────────────

const route = useRoute()
const router = useRouter()

const rules = ref<RulesData | null>(null)
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref<string | null>(null)

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

/** FW for the skill being added. */
const skillFwToAdd = ref(12)

/** Spell IDs currently on the character being edited. */
const spells = ref<string[]>([])

/** The spell ID selected in the "add spell" dropdown. */
const spellToAdd = ref('')

// ── Computed ──────────────────────────────────────────────────────────────────

/** Skills not yet on the character — available to add. */
const availableSkills = computed(() => {
  const r = rules.value
  if (!r) return []
  const existing = new Set(skills.value.map(s => s.skillId))
  return r.skills
    .filter(s => !existing.has(s.id) && s.id !== 'Zaubersprüche')
    .sort((a, b) => a.name.localeCompare(b.name))
})
/** True if the selected type can cast spells. */
const isCaster = computed(() => {
  const r = rules.value
  if (!r || !typeId.value) return false
  const t = r.types.find(x => x.id === typeId.value)
  return t?.category === 'KampfZauberer' || t?.category === 'Zauberer'
})

/** Spells available to add: in the type’s spell groups, not yet on the character. */
const availableSpells = computed(() => {
  const r = rules.value
  if (!r || !typeId.value) return []
  const t = r.types.find(x => x.id === typeId.value)
  if (!t?.spellCosts) return []
  const groups = new Set(Object.keys(t.spellCosts))
  const learned = new Set(spells.value)
  return r.spells
    .filter(s => groups.has(s.spellGroup) && !learned.has(s.id))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
})

/** Learned spells with display data, sorted by level then name. */
const spellRows = computed(() => {
  const r = rules.value
  if (!r) return spells.value.map(id => ({ id, name: id, level: 0, spellGroup: '—' }))
  return spells.value
    .map(id => {
      const spell = r.spells.find(s => s.id === id)
      return { id, name: spell?.name ?? id, level: spell?.level ?? 0, spellGroup: spell?.spellGroup ?? '—' }
    })
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
})
/** For display: look up skill names from rules. */
const skillRows = computed(() => {
  const r = rules.value
  if (!r) return skills.value.map(s => ({ ...s, name: s.skillId }))
  return skills.value.map(cs => ({
    ...cs,
    name: r.skills.find(s => s.id === cs.skillId)?.name ?? cs.skillId,
  })).sort((a, b) => a.name.localeCompare(b.name))
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
    createdAt: isEdit.value ? (id.value ? '' : now) : now, // preserved on edit
    updatedAt: now,
  }
}

/** Add the selected skill to the character's skill list. */
function addSkill(): void {
  const sid = skillToAdd.value
  if (!sid) return
  const r = rules.value
  const ruleSkill = r?.skills.find(s => s.id === sid)
  const fw = skillFwToAdd.value ?? (ruleSkill?.baseValue ?? 12)
  skills.value = [...skills.value, { skillId: sid, value: fw }]
  skillToAdd.value = ''
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
  spells.value = [...spells.value, sid]
  spellToAdd.value = ''
}

/** Remove a spell from the character's spell list. */
function removeSpell(spellId: string): void {
  spells.value = spells.value.filter(id => id !== spellId)
}

/** Validate required fields. Returns an error message or null. */
function validate(): string | null {
  if (!name.value.trim()) return 'Name is required.'
  if (!raceId.value) return 'Race is required.'
  if (!typeId.value) return 'Type is required.'
  if (availableEp.value > totalEs.value) return 'Available EP cannot exceed total ES.'
  return null
}

/** Save the character to IndexedDB and navigate to the character sheet. */
async function saveCharacter(): Promise<void> {
  const validationError = validate()
  if (validationError) { errorMessage.value = validationError; return }

  saving.value = true
  errorMessage.value = null

  try {
    const character = buildCharacter()
    // Preserve the original createdAt when editing
    if (isEdit.value) {
      const existing = await characterStorage.load(character.id)
      if (existing) character.createdAt = existing.createdAt
    }
    await characterStorage.save(character)
    await router.push({ name: 'character-sheet', params: { id: character.id } })
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to save.'
  } finally {
    saving.value = false
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  try {
    const [loadedRules] = await Promise.all([new RulesLoader().load()])
    rules.value = loadedRules

    if (isEdit.value) {
      const charId = route.params.id as string
      const existing = await characterStorage.load(charId)
      if (!existing) {
        errorMessage.value = `Character "${charId}" not found.`
        return
      }
      fillForm(existing)
    }
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to load rules.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="form-page">
    <h1>{{ isEdit ? UI.formEditTitle : UI.formNewTitle }}</h1>

    <div v-if="loading" class="status">{{ UI.formLoadingRules }}</div>
    <div v-else-if="errorMessage" class="status error">{{ errorMessage }}</div>

    <form v-if="!loading" class="char-form" @submit.prevent="saveCharacter">

      <!-- ── Identity ── -->
      <section class="card">
        <h2>{{ UI.secIdentity }}</h2>

        <label>{{ UI.labelName }} *
          <input v-model="name" type="text" required :placeholder="UI.formCharNamePlaceholder" />
        </label>

        <label>{{ UI.labelPlayer }}
          <input v-model="player" type="text" :placeholder="UI.formPlayerNamePlaceholder" />
        </label>

        <label>{{ UI.labelRace }} *
          <select v-model="raceId" required>
            <option value="" disabled>{{ UI.formSelectPlaceholder }}</option>
            <option v-for="r in rules?.races" :key="r.id" :value="r.id">{{ r.name }}</option>
          </select>
        </label>

        <label>{{ UI.labelType }} *
          <select v-model="typeId" required>
            <option value="" disabled>{{ UI.formSelectPlaceholder }}</option>
            <option v-for="t in rules?.types" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </label>

        <label>{{ UI.labelOrigin }}
          <select v-model="originId">
            <option value="" disabled>{{ UI.formSelectPlaceholder }}</option>
            <option v-for="o in rules?.origins" :key="o.id" :value="o.id">{{ o.name }}</option>
          </select>
        </label>

        <label>{{ UI.labelSocialStatus }}
          <select v-model="statusId">
            <option value="" disabled>{{ UI.formSelectPlaceholder }}</option>
            <option v-for="s in rules?.socialStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
      </section>

      <!-- ── Experience ── -->
      <section class="card">
        <h2>{{ UI.secExperience }}</h2>
        <label>{{ UI.formEsTotalLabel }}
          <input v-model.number="totalEs" type="number" min="0" max="999999" class="es-input" />
        </label>
        <label>{{ UI.formEpAvailLabel }}
          <input v-model.number="availableEp" type="number" min="0" max="999999" class="es-input" />
        </label>
      </section>

      <!-- ── Eigenschaften ── -->
      <section class="card">
        <h2>{{ UI.secProps }}</h2>
        <div class="prop-grid">
          <label for="p-st">{{ UI.propAbbrSt }}</label>    <input id="p-st" v-model.number="St" type="number" min="1"  max="100" />
          <label for="p-gs">{{ UI.propAbbrGs }}</label>    <input id="p-gs" v-model.number="Gs" type="number" min="1"  max="100" />
          <label for="p-gw">{{ UI.propAbbrGw }}</label>    <input id="p-gw" v-model.number="Gw" type="number" min="1"  max="100" />
          <label for="p-ko">{{ UI.propAbbrKo }}</label>    <input id="p-ko" v-model.number="Ko" type="number" min="1"  max="100" />
          <label for="p-in">{{ UI.propAbbrIn }}</label>    <input id="p-in" v-model.number="In" type="number" min="1"  max="100" />
          <label for="p-zt">{{ UI.propAbbrZt }}</label>    <input id="p-zt" v-model.number="Zt" type="number" min="1"  max="100" />
          <label for="p-pa">{{ UI.propAbbrPa }}</label>    <input id="p-pa" v-model.number="pA" type="number" min="-2" max="100" />
          <label for="p-wk">{{ UI.propAbbrWk }}</label>    <input id="p-wk" v-model.number="Wk" type="number" min="-2" max="100" />
          <label for="p-au">{{ UI.propAbbrAu }}</label>    <input id="p-au" v-model.number="Au" type="number" min="-2" max="100" />
          <label for="p-lp">{{ UI.propAbbrLp }}</label>    <input id="p-lp" v-model.number="LP" type="number" min="1"  max="100" />
          <label for="p-ap">{{ UI.propAbbrAp }}</label>    <input id="p-ap" v-model.number="AP" type="number" min="1"  max="100" />
          <label for="p-b">{{ UI.propAbbrB }}</label>      <input id="p-b"  v-model.number="B"  type="number" min="1"  max="100" />
        </div>
      </section>

      <!-- ── Boni ── -->
      <section class="card">
        <h2>{{ UI.secBoni }}</h2>
        <div class="prop-grid">
          <label for="p-ausb">{{ UI.propAbbrAusb }}</label>  <input id="p-ausb"  v-model.number="AusB"  type="number" min="-2" max="100" />
          <label for="p-schb">{{ UI.propAbbrSchb }}</label>  <input id="p-schb"  v-model.number="SchB"  type="number" min="-2" max="100" />
          <label for="p-anb">{{ UI.propAbbrAnb }}</label>    <input id="p-anb"   v-model.number="AnB"   type="number" min="-2" max="100" />
          <label for="p-abb">{{ UI.propAbbrAbb }}</label>    <input id="p-abb"   v-model.number="AbB"   type="number" min="-2" max="100" />
          <label for="p-zaub">{{ UI.propAbbrZaub }}</label>  <input id="p-zaub"  v-model.number="ZauB"  type="number" min="-2" max="100" />
          <label for="p-resbg">{{ UI.propAbbrResbg }}</label><input id="p-resbg" v-model.number="ResBg" type="number" min="-2" max="100" />
          <label for="p-resbk">{{ UI.propAbbrResbk }}</label><input id="p-resbk" v-model.number="ResBk" type="number" min="-2" max="100" />
        </div>
      </section>

      <!-- ── Skills ── -->
      <section class="card">
        <h2>{{ UI.secSkills }}</h2>

        <!-- Vorhandene Fertigkeiten -->
        <table v-if="skillRows.length > 0" class="skill-table">
          <thead>
            <tr><th>{{ UI.colSkill }}</th><th>{{ UI.colFw }}</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="row in skillRows" :key="row.skillId">
              <td>{{ row.name }}</td>
              <td>
                <input
                  :value="row.value"
                  type="number"
                  min="1"
                  max="18"
                  class="fw-input"
                  @change="e => {
                    const idx = skills.findIndex(s => s.skillId === row.skillId)
                    if (idx !== -1) skills[idx] = { ...skills[idx], value: Number((e.target as HTMLInputElement).value) }
                  }"
                />
              </td>
              <td>
                <button type="button" class="btn-remove" @click="removeSkill(row.skillId)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-hint">{{ UI.emptySkillsForm }}</p>

        <!-- Fertigkeit hinzufügen -->
        <div class="add-skill-row">
          <select v-model="skillToAdd" class="skill-select">
            <option value="" disabled>{{ UI.formAddSkillPlaceholder }}</option>
            <option v-for="s in availableSkills" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <label class="fw-label">{{ UI.colFw }}
            <input v-model.number="skillFwToAdd" type="number" min="1" max="18" class="fw-input" />
          </label>
          <button type="button" class="btn-add" :disabled="!skillToAdd" @click="addSkill">{{ UI.add }}</button>
        </div>
      </section>

      <!-- ── Spells ── -->
      <section v-if="isCaster" class="card">
        <h2>{{ UI.spells }}</h2>

        <table v-if="spellRows.length > 0" class="skill-table">
          <thead>
            <tr><th>{{ UI.colLevel }}</th><th>{{ UI.labelName }}</th><th>{{ UI.colGroup }}</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="row in spellRows" :key="row.id">
              <td>{{ row.level }}</td>
              <td>{{ row.name }}</td>
              <td>{{ row.spellGroup }}</td>
              <td>
                <button type="button" class="btn-remove" @click="removeSpell(row.id)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-hint">{{ UI.emptySpellsForm }}</p>

        <div class="add-skill-row">
          <select v-model="spellToAdd" class="skill-select">
            <option value="" disabled>{{ UI.formAddSpellPlaceholder }}</option>
            <option v-for="s in availableSpells" :key="s.id" :value="s.id">
              {{ UI.colLevel }} {{ s.level }} – {{ s.name }} ({{ s.spellGroup }})
            </option>
          </select>
          <button type="button" class="btn-add" :disabled="!spellToAdd" @click="addSpell">{{ UI.add }}</button>
        </div>
      </section>

      <!-- ── Submit ── -->
      <div class="form-actions">
        <button type="submit" class="btn-save" :disabled="saving">
          {{ saving ? UI.formSaving : (isEdit ? UI.formSaveChanges : UI.formCreateChar) }}
        </button>
        <button type="button" class="btn-cancel" @click="router.back()">{{ UI.cancel }}</button>
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

.prop-grid {
  display: grid;
  grid-template-columns: max-content 3.5rem max-content 3.5rem max-content 3.5rem;
  column-gap: 0.5rem;
  row-gap: 0.5rem;
  align-items: center;
}

.prop-grid label {
  display: block;
  font-size: 0.9em;
  color: #555;
  white-space: nowrap;
  text-align: right;
}

/* Extra left spacing before the 2nd and 3rd column groups */
.prop-grid label:nth-child(6n+3),
.prop-grid label:nth-child(6n+5) {
  padding-left: 1.5rem;
}

.prop-grid input[type="number"] {
  width: 3.5rem;
  padding: 0.25rem 0.35rem;
  text-align: right;
  font-size: 0.95rem;
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
.es-input  { width: 7rem; text-align: right; }

.btn-remove {
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

.fw-label {
  flex-direction: row;
  align-items: center;
  gap: 0.4rem;
  color: #555;
  font-size: 0.85em;
}

.btn-add {
  padding: 0.35rem 0.85rem;
  background: #fff;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
}

.btn-add:disabled { opacity: 0.4; cursor: not-allowed; }

.empty-hint { color: #888; font-style: italic; font-size: 0.9em; margin: 0; }

.form-actions {
  display: flex;
  gap: 0.75rem;
}

.btn-save {
  padding: 0.5rem 1.5rem;
  background: #2a7a2a;
  color: #fff;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 1rem;
}

.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-cancel {
  padding: 0.5rem 1rem;
  background: #fff;
  border: 1px solid #aaa;
  border-radius: 3px;
  cursor: pointer;
}
</style>
