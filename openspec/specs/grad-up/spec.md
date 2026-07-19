# Grad-Up (Gradaufstiegs-Popup)

## Purpose

Beim EP-Hinzufügen in der AdvancementView kann der Charakter einen oder mehrere Grade aufsteigen. Dieses Popup führt den Spieler Schritt für Schritt durch die M5-Gradaufstiegs-Regeln: Eigenschaftssteigerung (W%-Tabelle → 1W3) und AP-Erhöhung (1W3 + Klassenbonus + ΔAusB).

## Requirements

### Requirement: Grad-Up-Popup erscheint bei Grad-Sprung

Wenn in der AdvancementView EP hinzugefügt werden und der Charakter dadurch einen oder mehrere Grade aufsteigt, SHALL ein Popup erscheinen, das den Spieler Schritt für Schritt durch die Gradaufstiegs-Regeln führt.

#### Scenario: Einfacher Grad-Sprung (1 Grad)

- **WHEN** der Spieler EP hinzufügt und `newGrad === oldGrad + 1`
- **THEN** erscheint das Popup mit einem Durchlauf

#### Scenario: Mehrfach-Grad-Sprung (N Grade)

- **WHEN** der Spieler EP hinzufügt und `newGrad - oldGrad === N` (N > 1)
- **THEN** erscheint das Popup mit N aufeinanderfolgenden Durchläufen

#### Scenario: Kein Grad-Sprung

- **WHEN** der Spieler EP hinzufügt und `newGrad === oldGrad`
- **THEN** erscheint KEIN Popup
- **THEN** der Character wird wie bisher gespeichert

---

### Requirement: Stepper-UI pro Gradschritt

Das Popup SHALL ein Wizard-Stepper sein. Jeder Durchlauf zeigt eine Seite mit den Eingabefeldern für genau einen Gradschritt. Der Titel SHALL den alten und neuen Grad anzeigen (z.B. "Gradaufstieg 2 → 3 (1 von 2)").

#### Scenario: Stepper-Seite anzeigen

- **WHEN** das Popup geöffnet wird
- **THEN** wird Seite 1 von N angezeigt mit dem Titel "Gradaufstieg X → X+1 (1 von N)"

#### Scenario: Nächste Seite

- **WHEN** der Spieler auf "Übernehmen" klickt
- **THEN** wird die nächste Seite angezeigt (sofern verfügbar)

#### Scenario: Letzte Seite bestätigt

- **WHEN** der Spieler auf der letzten Seite auf "Übernehmen" klickt
- **THEN** wird das Popup geschlossen
- **THEN** der modifizierte Character wird gespeichert

---

### Requirement: Default-Werte der Eingabefelder

Alle Würfeleingaben im GradUp-Popup SHALL mit dem abgerundeten Erwartungswert des jeweiligen Würfels vorbelegt sein.

| Feld | Würfel | Default |
|------|--------|---------|
| W%-Ergebnis | W100 | 50 |
| 1W3 Eigenschaft | 1W3 | 2 |
| 1W3 AP | 1W3 | 2 |

#### Scenario: Default-Werte sind korrekt

- **WHEN** das Popup geöffnet wird
- **THEN** ist das W%-Feld mit 50 vorbelegt
- **THEN** ist das 1W3-Eigenschaftsfeld mit 2 vorbelegt
- **THEN** ist das 1W3-AP-Feld mit 2 vorbelegt

---

### Requirement: W%-Eigenschaftssteigerung

Jeder Gradschritt SHALL den Spieler auffordern, einen W%-Wurf einzugeben. Anhand der Tabelle in den Rules-Daten wird die betroffene Eigenschaft ermittelt. Der Spieler SHALL dann das 1W3-Ergebnis für die Steigerung eingeben.

#### Scenario: W% 01–50 (keine Steigerung)

- **WHEN** der Spieler einen W%-Wert zwischen 01 und 50 eingibt
- **THEN** wird keine Eigenschaft gesteigert
- **THEN** wird keine 1W3-Eingabe für Eigenschaften angefordert

#### Scenario: W% 51–95 (bestimmte Eigenschaft)

- **WHEN** der Spieler einen W%-Wert zwischen 51 und 95 eingibt
- **THEN** wird die entsprechende Eigenschaft aus der Tabelle angezeigt (z.B. "Attribut: St")
- **THEN** wird ein 1W3-Eingabefeld angezeigt
- **THEN** nach Eingabe des 1W3 wird die finale Änderung angezeigt (z.B. "St um 3 erhöht")

#### Scenario: W% 96–100 (freie Wahl)

- **WHEN** der Spieler einen W%-Wert zwischen 96 und 100 eingibt
- **THEN** wird ein Combobox zur Auswahl der Eigenschaft angezeigt
- **THEN** wird ein 1W3-Eingabefeld angezeigt
- **THEN** nach Eingabe des 1W3 wird die finale Änderung angezeigt

#### Scenario: Eigenschafts-Maximum 100

- **WHEN** die Eigenschaft bereits 100 erreicht hat oder durch die Steigerung 100 überschreiten würde
- **THEN** wird die Eigenschaft auf 100 gesetzt (keine weitere Steigerung)

---

### Requirement: AP-Erhöhung

Jeder Gradschritt SHALL den Spieler auffordern, ein 1W3-Ergebnis für die AP-Erhöhung einzugeben. Die Formel lautet:

- **Grad ≤ 5**: `AP += 1W3 + classBonus + ΔAusB`
- **Grad ≥ 6**: `AP += 1W3 + ΔAusB` (kein Klassenbonus)

Der classBonus wird aus `rules.types[character.type].apGain.lowGradBonus` gelesen. Höhere Grade (≥ 6) erhalten keinen Klassenbonus. ΔAusB ist die Differenz zwischen dem neuen AusB (nach Ko-Änderung in diesem Schritt) und dem alten AusB.

#### Scenario: AP-Erhöhung Grad 1–5 mit Klassenbonus

- **WHEN** der aktuelle Grad ≤ 5 ist
- **THEN** wird der Klassenbonus aus den Rules-Daten angezeigt (z.B. "+3 (Krieger)")
- **THEN** wird `AP += 1W3 + classBonus + ΔAusB` berechnet

#### Scenario: AP-Erhöhung Grad ≥ 6 ohne Klassenbonus

- **WHEN** der aktuelle Grad ≥ 6 ist
- **THEN** wird KEIN Klassenbonus angezeigt
- **THEN** wird `AP += 1W3 + ΔAusB` berechnet

#### Scenario: Erster Grad (Grad 1)

- **WHEN** der Charakter den ersten Grad erreicht (Grad 0 → 1)
- **THEN** gilt dieselbe Formel wie Grad 1–5: `AP += 1W3 + classBonus + ΔAusB`

#### Scenario: Ko-Änderung beeinflusst ΔAusB

- **WHEN** im selben Gradschritt die Ko-Eigenschaft erhöht wurde
- **THEN** wird ΔAusB = neuerAusB - alterAusB berechnet
- **THEN** wird ΔAusB auf die AP-Erhöhung addiert

---

### Requirement: FW-Updates nach Gradschritt

Nach Abschluss aller Gradschritte SHALL die grad-basierten Fähigkeitswerte (Abwehr, Resistenz, Zaubern) auf den aktuellen Grad aktualisiert werden.

#### Scenario: FW-Aktualisierung nach Gradaufstieg

- **WHEN** alle Gradschritte bestätigt wurden
- **THEN** werden alle Skills mit `skillSchema.gradValues` auf den aktuellen Grad-Wert gesetzt
- **THEN** wird der aktualisierte Character gespeichert

---

### Requirement: Abbrechen möglich

Das Popup SHALL einen "Abbrechen"-Button haben. Bei Abbruch werden KEINE Änderungen gespeichert.

#### Scenario: Abbrechen ohne Änderungen

- **WHEN** der Spieler auf "Abbrechen" klickt
- **THEN** wird das Popup geschlossen
- **THEN** wird der Character NICHT modifiziert
- **THEN** bleiben die EP-Änderungen in der AdvancementView erhalten (das EP-Hinzufügen wird trotzdem gespeichert, aber Character-Daten bleiben unverändert)

---

### Requirement: GradUpService

Das System SHALL einen `GradUpService` bereitstellen, der die Grad-Up-Logik kapselt. Der Service SHALL immutable arbeiten und einen neuen Character zurückgeben.

#### Scenario: computeStep gibt neuen Character zurück

- **WHEN** `computeStep()` aufgerufen wird
- **THEN** wird ein neues Character-Objekt zurückgegeben
- **THEN** das ursprüngliche Character-Objekt wird nicht modifiziert

#### Scenario: applyGradSteps wendet mehrere Schritte an

- **WHEN** `applyGradSteps()` mit 3 Steps aufgerufen wird
- **THEN** werden alle 3 Steps nacheinander angewendet
- **THEN** der zurückgegebene Character hat alle Änderungen aus allen 3 Steps
