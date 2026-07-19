## Why

Beim EP-Hinzufügen in der AdvancementView kann der Charakter einen oder mehrere Grade aufsteigen. Aktuell passiert dabei nichts — AP und Eigenschaften bleiben unverändert, obwohl die M5-Regeln pro Grad eine AP-Erhöhung (1W3 + Klassenbonus) und eine mögliche Eigenschaftssteigerung (W%-Tabelle → 1W3) vorsehen. Der Spieler muss diese Änderungen manuell im Charakterblatt nachtragen, was fehleranfällig ist.

Dieser Change führt ein Popup ein, das nach einem Gradaufstieg erscheint und den Spieler Schritt für Schritt durch die Würfelwürfe und Änderungen führt.

## What Changes

- **Neuer GradUp-Service**: Berechnet AP-Zuwachs (1W3 + Klassenbonus + ΔAusB) und Eigenschaftssteigerung (W%-Tabelle → 1W3) auf Basis der Rules-Daten
- **Neue Rules-Daten**: `apGain` pro Typ, `gradUpRules` (W%-Tabelle) in `universalRules`
- **Neues Popup**: Wizard-artiger Stepper, der N Durchläufe zeigt (ein Durchlauf pro Grad)
- **Integration in AdvancementView**: `addEp()` erkennt Grad-Sprung (vorher/nachher `computeGrad`), triggert Popup
- **Immutable Updates**: Der Service gibt einen neuen Character zurück (wie AdvancementService)
- **FW-Aktualisierung**: Abwehr/Resistenz/Zaubern werden auf den neuen Grad-Wert gesetzt (wie validateCategoryG)

## Capabilities

### New Capabilities
- `grad-up`: Gradaufstieg-Popup mit Würfeleingabe, AP-Erhöhung, Eigenschaftssteigerung, FW-Updates

### Modified Capabilities
- `character-validation`: Neue Issue-Codes für Grad-Up betreffende Validierungen (optional)
- `advancement-view`: Integration des Grad-Up-Popups in den EP-Hinzufügen-Flow

## Impact

- `src/services/GradUpService.ts` — NEU
- `src/components/GradUpPopup.vue` — NEU
- `src/views/AdvancementView.vue` — MODIFIED: `addEp()` erkennt Grad-Sprung
- `src/types/Character.ts` — ggf. keine Änderung (AP existiert bereits)
- `src/types/Rules.ts` — NEU: `ApGainConfig`, `GradUpRules`
- `tools/scripts/parse_EVA_kodex.py` — MODIFIED: apbonus aus Dynprops lesen, gradUpRules hardcodiert (wie M5_FORMULAS)
- `tools/scripts/parse_Mogadil.py` — MODIFIED: apGain aus Kategorie + Override, gradUpRules hardcodiert
- `tools/rules/eva_kodex.json` — REGENERATED durch aktualisierten Parser
- `tools/rules/mogadil.json` — REGENERATED durch aktualisierten Parser
