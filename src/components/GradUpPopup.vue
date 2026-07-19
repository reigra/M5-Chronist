<script setup lang="ts">
import { ref, computed } from 'vue'
import type { GradStepInput } from '../services/GradUpService'
import type { RulesData, GradUpRules } from '../types/Rules'
import type { Character } from '../types/Character'
import { computeGrad } from '../services/GradUtils'
import { UI } from '../constants/ui'

const props = defineProps<{
  /** Der Character VOR den Gradschritten. */
  character: Character
  /** Die geladenen Rules-Daten. */
  rules: RulesData
  /** Anzahl der Gradschritte (N). */
  steps: number
}>()

const emit = defineEmits<{
  (e: 'confirm', steps: GradStepInput[]): void
  (e: 'cancel'): void
}>()

// ── State ──

const currentStep = ref(0) // 0-indexed

/** Eingabewerte pro Schritt. */
const stepInputs = ref<GradStepInput[]>(
  Array.from({ length: props.steps }, () => ({
    wpResult: 50,
    propertyGain: 2,
    apDice: 2,
  })),
)

// Eingabe-Felder für aktuellen Schritt
const wpResult = ref(50)
const propertyGain = ref(2)
const chosenProperty = ref('')
const apDice = ref(2)

// ── Computed ──

const gradUpRules = computed<GradUpRules>(() => {
  return props.rules.universalRules?.gradUpRules ?? {
    apDice: '1W3',
    propertyGainDice: '1W3',
    propertyMaxValue: 100,
    propertyGainTable: [
      { range: [1, 50],   property: null },
      { range: [51, 55],  property: 'Wk' },
      { range: [56, 60],  property: 'pA' },
      { range: [61, 65],  property: 'Au' },
      { range: [66, 70],  property: 'St' },
      { range: [71, 75],  property: 'Gs' },
      { range: [76, 80],  property: 'Gw' },
      { range: [81, 85],  property: 'Ko' },
      { range: [86, 90],  property: 'In' },
      { range: [91, 95],  property: 'Zt' },
      { range: [96, 100], property: 'free' },
    ],
  }
})

/** Der aktuelle Grad VOR diesem Schritt.
 *
 * Achtung: totalEs im Character ist bereits der END-Wert (nach EP-Hinzufügen).
 * Deshalb muss von baseGrad die volle Schrittanzahl abgezogen werden,
 * nicht steps - 1 (off-by-one vermeiden).
 *
 * Bsp: Grad 1→2, totalEs=200 → baseGrad=2, steps=1, currentStep=0
 *      2 - 1 + 0 = 1  →  "Gradaufstieg 1 → 2"  ✓
 */
const gradBeforeStep = computed(() => {
  const totalEs = props.character.totalEs
  const baseGrad = computeGrad(totalEs)
  return baseGrad - props.steps + currentStep.value
})

const oldGrad = computed(() => gradBeforeStep.value)
const newGrad = computed(() => gradBeforeStep.value + 1)

/** Die aus dem W%-Wurf ermittelte Eigenschaft. */
const lookupResult = computed(() => {
  const table = gradUpRules.value.propertyGainTable
  for (const entry of table) {
    const [lo, hi] = entry.range
    if (wpResult.value >= lo && wpResult.value <= hi) {
      return entry.property
    }
  }
  return null
})

/** Benötigt der Spieler eine 1W3-Eingabe für die Eigenschaft? */
const needsPropertyGain = computed(() => {
  return lookupResult.value !== null && lookupResult.value !== 'free'
})

/** Ist es eine freie Wahl? */
const isFreeChoice = computed(() => lookupResult.value === 'free')

/** Mögliche Eigenschaften für freie Wahl (alle 9 Basis-Eigenschaften). */
const freeChoiceProperties = ['St', 'Gs', 'Gw', 'Ko', 'In', 'Zt', 'pA', 'Wk', 'Au']

/** Klassenbonus für AP. */
const classBonus = computed(() => {
  const charType = props.rules.types.find(t => t.id === props.character.typeId)
  if (!charType?.apGain) return 0
  return gradBeforeStep.value <= 5 ? charType.apGain.lowGradBonus : 0
})

/** Aktueller AusB (vor Ko-Änderung in diesem Schritt). */
const currentAusB = computed(() => {
  return props.character.boni.AusB
})

/** Prüft, ob alle Eingaben valide sind. */
const isValid = computed(() => {
  if (wpResult.value < 1 || wpResult.value > 100) return false
  if (needsPropertyGain.value && (propertyGain.value < 1 || propertyGain.value > 3)) return false
  if (isFreeChoice.value && !chosenProperty.value) return false
  if (apDice.value < 1 || apDice.value > 3) return false
  return true
})

/** Ist dies der letzte Schritt? */
const isLastStep = computed(() => currentStep.value >= props.steps - 1)

// ── Actions ──

/** Bestätigt den aktuellen Schritt. */
function confirmStep(): void {
  if (!isValid.value) return

  // Aktuelle Eingaben speichern
  stepInputs.value[currentStep.value] = {
    wpResult: wpResult.value,
    propertyGain: needsPropertyGain.value || isFreeChoice.value ? propertyGain.value : 0,
    chosenProperty: isFreeChoice.value ? chosenProperty.value : undefined,
    apDice: apDice.value,
  }

  if (isLastStep.value) {
    // Alle Schritte bestätigt → emit
    emit('confirm', stepInputs.value)
  } else {
    // Nächsten Schritt initialisieren
    currentStep.value++
    // Vorherige Eingaben wiederherstellen (falls vorhanden)
    const prev = stepInputs.value[currentStep.value]
    wpResult.value = prev.wpResult
    propertyGain.value = prev.propertyGain
    chosenProperty.value = prev.chosenProperty ?? ''
    apDice.value = prev.apDice
  }
}

function cancel(): void {
  emit('cancel')
}
</script>

<template>
  <div class="grad-overlay" @click.self="cancel">
    <div class="grad-modal">
      <!-- Header -->
      <h2 class="grad-title">
        {{ UI.gradUpTitle }} {{ oldGrad }} → {{ newGrad }}
        ({{ currentStep + 1 }} {{ UI.gradUpStep }} {{ steps }})
      </h2>

      <div class="grad-body">
        <!-- 1. W%-Eingabe + Eigenschafts-Anzeige -->
        <div class="grad-field">
          <label class="grad-label">{{ UI.gradUpWpLabel }}</label>
          <div class="grad-input-row">
            <input
              v-model.number="wpResult"
              type="number"
              min="1"
              max="100"
              class="grad-input grad-input--small"
            />
            <span class="grad-result">
              <template v-if="lookupResult === null">
                {{ UI.gradUpNoAttr }}
              </template>
              <template v-else-if="lookupResult === 'free'">
                {{ UI.gradUpFreeChoice }}
              </template>
              <template v-else>
                {{ UI.gradUpAttrResult }} {{ lookupResult }}
              </template>
            </span>
          </div>
        </div>

        <!-- 1b. 1W3-Eingabe für Eigenschaft (nur wenn W% > 50) -->
        <div v-if="needsPropertyGain" class="grad-field">
          <label class="grad-label">{{ UI.gradUpPropertyGain }}</label>
          <input
            v-model.number="propertyGain"
            type="number"
            min="0"
            max="3"
            class="grad-input grad-input--small"
          />
        </div>

        <!-- 1c. Combobox für freie Wahl (W% 96–100) -->
        <div v-if="isFreeChoice" class="grad-field">
          <label class="grad-label">{{ UI.gradUpFreeChoice }}</label>
          <select v-model="chosenProperty" class="grad-select">
            <option value="">{{ UI.selectPlaceholder }}</option>
            <option
              v-for="prop in freeChoiceProperties"
              :key="prop"
              :value="prop"
            >
              {{ prop }}
            </option>
          </select>
          <div v-if="chosenProperty" class="grad-field">
            <label class="grad-label">{{ UI.gradUpPropertyGain }}</label>
            <input
              v-model.number="propertyGain"
              type="number"
              min="0"
              max="3"
              class="grad-input grad-input--small"
            />
          </div>
        </div>

        <!-- 2. AP-1W3-Eingabe -->
        <div class="grad-field">
          <label class="grad-label">{{ UI.gradUpApLabel }}</label>
          <input
            v-model.number="apDice"
            type="number"
            min="1"
            max="3"
            class="grad-input grad-input--small"
          />
          <span class="grad-ap-info">
            <template v-if="classBonus > 0">
              AP = 1W3 + ΔAusB + {{ classBonus }} ({{ UI.gradUpClassBonus }})
            </template>
            <template v-else>
              AP = 1W3 + ΔAusB
            </template>
            <br />
            <span class="grad-ap-ausb">{{ UI.gradUpAusb }} aktuell: +{{ currentAusB }}</span>
          </span>
        </div>
      </div>

      <!-- Footer -->
      <div class="grad-footer">
        <button class="grad-btn grad-btn--secondary" @click="cancel">
          {{ UI.gradUpAbbrechen }}
        </button>
        <button
          class="grad-btn grad-btn--primary"
          :disabled="!isValid"
          @click="confirmStep"
        >
          {{ isLastStep ? UI.confirm : UI.gradUpUebernehmen }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grad-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.grad-modal {
  background: #fff;
  border: 1px solid #2a4a7a;
  border-radius: 8px;
  padding: 1.5rem 2rem;
  max-width: 520px;
  width: 90%;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
}

.grad-title {
  margin: 0 0 1.25rem;
  font-size: 1.15rem;
  color: #2a4a7a;
  border-bottom: 1px solid #ddd;
  padding-bottom: 0.75rem;
}

.grad-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.grad-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.grad-label {
  font-size: 0.85em;
  font-weight: 600;
  color: #444;
}

.grad-input-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.grad-input {
  padding: 0.3rem 0.5rem;
  border: 1px solid #aaa;
  border-radius: 3px;
  font-size: 1rem;
  text-align: center;
}

.grad-input--small {
  width: 4rem;
}

.grad-result {
  font-weight: 600;
  color: #2a4a7a;
  font-size: 0.95em;
}

.grad-select {
  padding: 0.3rem 0.5rem;
  border: 1px solid #aaa;
  border-radius: 3px;
  font-size: 1rem;
  max-width: 12rem;
}

.grad-ap-info {
  font-size: 0.85em;
  color: #555;
  margin-top: 0.2rem;
}

.grad-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.grad-btn {
  padding: 0.45rem 1.25rem;
  border-radius: 4px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}

.grad-btn--primary {
  background: #2a4a7a;
  color: #fff;
  border-color: #2a4a7a;
}

.grad-btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.grad-btn--secondary {
  background: #f5f5f5;
  color: #444;
  border-color: #ccc;
}

.grad-btn--secondary:hover {
  background: #e8e8e8;
}
</style>
