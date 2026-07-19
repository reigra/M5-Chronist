## 1. Rules-Datenstruktur erweitern

- [x] 1.1 `ApGainConfig` Interface zu `src/types/Rules.ts` hinzufügen (Feld: `lowGradBonus: number`)
- [x] 1.2 `GradUpRules` Interface zu `src/types/Rules.ts` hinzufügen (Feld: `propertyGainTable`, `propertyMaxValue`, `propertyGainDice`)
- [x] 1.3 `GradUpRules` als optionales Feld in `UniversalRules` aufnehmen
- [x] 1.4 `apGain: ApGainConfig` als optionales Feld in `CharacterType` (Rules.types[]) aufnehmen
- [x] 1.5 Fallback in Services: wenn GradUpRules fehlen, sinnvolle Defaults verwenden

## 2. Parser anpassen (EVA)

- [x] 2.1 In `parse_klasse()` das Dynprops-Attribut `apbonus` auslesen → `type["apGain"] = {"lowGradBonus": int(apbonus)}`
- [x] 2.2 `M5_GRADUP_RULES`-Konstante in `parse_EVA_kodex.py` definieren (hartcodiert, analog zu `M5_FORMULAS`)
- [x] 2.3 `gradUpRules` in `build_universal_rules()` in den Output schreiben
- [x] 2.4 Parser neu laufen lassen: `python tools/scripts/parse_EVA_kodex.py`

## 3. Parser anpassen (Mogadil)

- [x] 3.1 `CATEGORY_AP_GAIN`-Map definieren (`Kämpfer=2, KampfZauberer=2, Zauberer=1`)
- [x] 3.2 `AP_GAIN_OVERRIDES` für Kr/Ba/Wä=3 hartcodieren
- [x] 3.3 Nach `_derive_category()`: `type["apGain"]` setzen (Override → Kategorie → 0)
- [x] 3.4 `M5_GRADUP_RULES`-Konstante + `gradUpRules` in `universalRules` ergänzen
- [x] 3.5 Parser neu laufen lassen: `python tools/scripts/parse_Mogadil.py`

## 4. GradUpService implementieren

- [x] 4.1 Datei `src/services/GradUpService.ts` anlegen
- [x] 4.2 `GradStepInput` und `GradStepResult` Interfaces definieren
- [x] 4.3 `computeStep()` implementieren: W%-Lookup, 1W3-Anwendung auf Eigenschaft, AP-Formel mit AusB-Neuberechnung
- [x] 4.4 `applyGradSteps()` implementieren: N Steps nacheinander, immutable über Character-Spread
- [x] 4.5 FW-Updates nach Gradschritten (grad-basierte Skills auf neuen Grad setzen)
- [x] 4.6 Singleton-Export (`export const gradUpService = new GradUpService()`)

## 5. GradUpPopup-Komponente erstellen

- [x] 5.1 Datei `src/components/GradUpPopup.vue` anlegen
- [x] 5.2 Stepper-UI mit `v-for` über Grad-Schritte, `currentStep`-Index
- [x] 5.3 Seite pro Schritt: Titel "Gradaufstieg X → Y (Z von N)"
- [x] 5.4 W%-Eingabefeld + Ergebnis-Anzeige (welche Eigenschaft)
- [x] 5.5 1W3-Eingabefeld für Eigenschaftssteigerung (nur wenn W% > 50)
- [x] 5.6 Combobox für freie Wahl (W% 96–100)
- [x] 5.7 AP-1W3-Eingabefeld mit Anzeige von Klassenbonus und AusB
- [x] 5.8 "Übernehmen"-Button: validiert Eingabe, schreitet zum nächsten Schritt
- [x] 5.9 "Abbrechen"-Button: schliesst Popup ohne Änderungen
- [x] 5.10 Event-Emission bei Bestätigung: liefert `GradStepInput[]` zurück

## 6. Integration in AdvancementView

- [x] 6.1 In `addEp()` Grad-Sprung erkennen (vorher/nachher `computeGrad`)
- [x] 6.2 Bei Grad-Sprung: Popup öffnen mit `steps`-Anzahl
- [x] 6.3 Nach Bestätigung: `GradUpService.applyGradSteps()` aufrufen
- [x] 6.4 Modifizierten Character speichern (IndexedDB)
- [x] 6.5 Kein Popup bei Grad-Sprung = 0 (bisheriges Verhalten)

## 7. Build-Test

- [x] 7.1 `npm run build` ausführen (vue-tsc + vite build)
- [x] 7.2 Eventuelle TypeScript-Fehler beheben
