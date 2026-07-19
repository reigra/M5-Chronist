## Context

Die AdvancementView erlaubt das Hinzufügen von EP zu einem Charakter. Dabei kann `totalEs` einen Grad-Schwellwert überschreiten. Aktuell passiert nach dem Speichern nichts — die M5-Regeln für AP-Erhöhung und Eigenschaftssteigerung beim Gradaufstieg werden nicht abgebildet.

Der Charakter hat bereits ein Feld `properties.AP` (Ausdauerpunkte). Die FormulaEngine unterstützt Dice-Notation (`1W3`, `W%`) via `evaluateExact()`. Grad-basierte FWs (Abwehr/Resistenz/Zaubern) werden bereits via `validateCategoryG()` erkannt und via `correctIssues()` korrigiert — aber nur passiv beim Laden, nicht aktiv beim Gradaufstieg.

## Goals / Non-Goals

**Goals:**
- Popup nach Gradaufstieg mit N Durchläufen (N = Anzahl gestiegener Grade)
- Pro Durchlauf: AP-Zuwachs (1W3 + AusB + Klassenbonus) und Eigenschaftssteigerung (W% → 1W3)
- Wizard-Charakter: jeder Durchlauf baut auf dem vorherigen auf (z.B. neuer AusB bei Ko-Änderung)
- Rules-Daten: `apGain` pro Typ, `gradUpRules` (W%-Tabelle) in `universalRules`
- FW-Updates für Abwehr/Resistenz/Zaubern auf den neuen Grad-Wert

**Non-Goals:**
- Keine automatischen Würfel — der Spieler gibt immer die Würfelergebnisse ein
- Keine Validierung der Würfeleingaben (der Spieler könnte schummeln)
- Keine Änderung an `autoFix()` oder `validate()` (FW-Updates laufen separat)

## Decisions

### D1: GradUpService — neuer Service für die Grad-Up-Logik

Ein neuer Service `GradUpService` kapselt die gesamte Grad-Up-Logik:

```typescript
class GradUpService {
  /**
   * Berechnet die Änderungen für EINEN Gradschritt.
   * Gibt ein Delta-Objekt zurück, keine Mutation.
   */
  computeStep(
    character: Character,
    rules: RulesData,
    currentGrad: number,
    apDice: number,       // 1W3-Ergebnis
    propertyDice: number, // W%-Ergebnis
    propertyGain: number, // 1W3-Ergebnis für Attribut (nur wenn W% > 50)
    chosenProperty?: string // bei freier Wahl (W% 96-100)
  ): Character

  /**
   * Wendet N Gradschritte nacheinander an.
   * Jeder Schritt bekommt seine Würfelergebnisse.
   * Der Character mutiert Schritt für Schritt.
   */
  applyGradSteps(
    character: Character,
    rules: RulesData,
    steps: GradStepInput[]
  ): Character
}
```

**Warum Service und nicht in AdvancementView?**: Die Logik ist komplex genug für einen eigenen Service. Ausserdem kann er später在其他 Views wiederverwendet werden (z.B. beim Character-Import).

### D2: Popup als Wizard-Stepper

Das Popup ist kein einfaches Modal, sondern ein Stepper mit N Seiten:

```
┌─────────────────────────────────────┐
│  Gradaufstieg 2 → 3  (1 von 2)      │
├─────────────────────────────────────┤
│                                     │
│  1. W%: [██]  →  Attribut: St      │
│      1W3: [██]  →  St +3           │
│                                     │
│  2. AP 1W3: [██]  +3 (Krieger)     │
│     + AusB (neu: Ko evtl. ↑)       │
│                                     │
│  [Abbrechen]          [Übernehmen]  │
└─────────────────────────────────────┘
```

Implementierung als Vue-Komponente mit `v-for` über die Grad-Schritte. Der aktuelle Schritt wird als `currentStep`-Index gesteuert. Nach dem letzten Schritt wird der finale Character gespeichert.

### D3: Rules-Daten-Struktur

**In `rules.types[]` — erweitert:**

```typescript
interface TypeApGain {
  lowGradBonus: number  // Bonus pro Grad für Grad 1-5 (z.B. 3 für Krieger)
}
```

**In `rules.universalRules` — neu:**

```typescript
interface GradUpRules {
  apDice: string                    // "1W3"
  propertyGainTable: Array<{
    range: [number, number]         // W%-range, inklusive, z.B. [51, 55]
    property: string | null         // null = keine, "free" = freie Wahl
  }>
  propertyMaxValue: number          // 100
  propertyGainDice: string          // "1W3"
}
```

### D3b — Parser-Integration für apGain und gradUpRules

Die JSON-Dateien werden **ausschliesslich** von den Parser-Scripten erzeugt. Alle neuen Daten werden dort hartcodiert oder aus Quellen extrahiert — keine manuellen JSON-Edits.

**EVA-Parser (`parse_EVA_kodex.py`):**

In `parse_klasse()` das Dynprops-Attribut `apbonus` auslesen:
```python
apbonus = attr(dynprops, "apbonus")
if apbonus:
    type_entry["apGain"] = { "lowGradBonus": int(apbonus) }
```

`gradUpRules` in `build_universal_rules()` als hardcodierte Konstante (analog zu `M5_FORMULAS`):
```python
M5_GRADUP_RULES = {
    "apDice": "1W3",
    "propertyGainDice": "1W3",
    "propertyMaxValue": 100,
    "propertyGainTable": [
        { "range": [1, 50],   "property": None },
        { "range": [51, 55],  "property": "Wk" },
        { "range": [56, 60],  "property": "pA" },
        { "range": [61, 65],  "property": "Au" },
        { "range": [66, 70],  "property": "St" },
        { "range": [71, 75],  "property": "Gs" },
        { "range": [76, 80],  "property": "Gw" },
        { "range": [81, 85],  "property": "Ko" },
        { "range": [86, 90],  "property": "In" },
        { "range": [91, 95],  "property": "Zt" },
        { "range": [96, 100], "property": "free" },
    ]
}
```

**Mogadil-Parser (`parse_Mogadil.py`):**

Nach `_derive_category()` den Bonus aus der Kategorie ableiten, plus hartcodiertes Override für Spezialfälle:
```python
CATEGORY_AP_GAIN = { "Kämpfer": 2, "KampfZauberer": 2, "Zauberer": 1 }
AP_GAIN_OVERRIDES  = { "Kr": 3, "Ba": 3, "Wä": 3 }

type_id = type_entry["id"]
if type_id in AP_GAIN_OVERRIDES:
    bonus = AP_GAIN_OVERRIDES[type_id]
else:
    bonus = CATEGORY_AP_GAIN.get(category, 0)
type_entry["apGain"] = { "lowGradBonus": bonus }
```

`gradUpRules` ebenfalls als hardcodierte Konstante (identisch zur EVA-Version) in den universalRules-Bereich.

### D4: Integration in AdvancementView

Das Erkennen des Grad-Sprungs passiert in `addEp()`:

```typescript
const oldGrad = computeGrad(character.totalEs)
character.totalEs += epAmount
const newGrad = computeGrad(character.totalEs)

if (newGrad > oldGrad) {
  const steps = newGrad - oldGrad
  // Popup öffnen, steps-Durchläufe
  // Nach Bestätigung: speichern
} else {
  // normal speichern
}
```

### D5: FW-Updates für Abwehr/Resistenz/Zaubern

Nach der Bestätigung aller Grad-Schritte werden die grad-basierten FWs aktualisiert. Der `GradUpService` verwendet dieselbe `lookupGradValue()`-Logik wie `CharacterValidator`.

```typescript
for (const skill of character.skills) {
  if (skillSchema.gradValues) {
    skill.value = lookupGradValue(skillSchema, character.totalEs)
  }
}
```

## Risks / Trade-offs

| Risiko | Mitigation |
|--------|------------|
| Spieler gibt falsche Würfelergebnisse ein (Schummeln) | Explizites Non-Goal — das ist ein P&P-Tool, keine Anti-Cheat-Software |
| AP-Berechnung hängt von Reihenfolge ab (Ko-Änderung → AusB) | Service zwingt Reihenfolge: erst Eigenschaft, dann AP |
| `gradUpRules`-Daten in Rulebooks vergessen/nicht vorhanden | Fallback: Popup zeigt trotzdem die Eingabefelder, verwendet 0 als Default-Bonus |
| Viele Grade auf einmal (z.B. Grad 2→7 = 5 Durchläufe) | Stepper-UI skaliert natürlich — einfach 5 Seiten nacheinander |

## Open Questions

- Soll der Spieler abbrechen können? Wenn ja: Alle Änderungen verwerfen oder bis zum aktuellen Schritt speichern? (Aktuelle Annahme: Abbrechen = nichts speichern)
