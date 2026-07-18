## Context

`autoFix()` in `CharacterValidator` ergänzt beim Laden fehlende universelle InnateSkills aus `rules.universalRules.innateSkills[]`. Was fehlt: rassenspezifische Start-Fertigkeiten aus `race.skills[]` (z.B. `{ skillId: "Bergbau", value: 12 }` für Zwerge). `validate()` meldet diese als `MISSING_RACIAL_SKILL` — aber `autoFix()` ignoriert sie, weil es nur `innateSkills` abdeckt.

`correctIssues()` (der "Auto-Fix"-Button) wurde in einer früheren Revision bereits um dieselbe Logik für `innateSkills` erweitert (`computeInnateFw()`). Dieser Change erweitert jetzt auch `autoFix()` um `race.skills`, sodass die Fehlermeldung gar nicht erst auftritt.

## Goals / Non-Goals

**Goals:**
- `autoFix()` ergänzt fehlende Skills aus `race.skills[]` mit deren Startwerten
- `race.skillBonuses[id]` wird addiert (wie bei innateSkills)
- Die Ergänzung erfolgt NACH der innateSkills-Schleife, aber VOR der Rückgabe — so können auch `race.skills`-Einträge von den nachfolgenden Default-Korrekturen (pp: 0) profitieren
- Immutable: gibt neuen Character zurück

**Non-Goals:**
- Keine Änderung an der FW-Berechnungslogik für InnateSkills (bleibt in `computeInnateFw()`)
- Keine neue Validierungs-Kategorie (wird bereits von `validate()` als `MISSING_RACIAL_SKILL` erkannt)
- Keine UI-Änderungen

## Decisions

### 1. Position in `autoFix()`

Die `race.skills`-Schleife wird DIREKT nach der innateSkills-Schleife (Schritt 1, Zeile ~148) eingefügt, aber VOR den PP-Defaults (Schritt 2). So erhalten neu ergänzte Skills automatisch `pp: 0`.

### 2. FW-Berechnung für race.skills

Anders als innateSkills haben `race.skills`-Einträge bereits einen Fixwert (`value`). Es gibt keine Formel/FormulaId/gradValues — der Wert kommt direkt aus dem Regelwerk.  
`race.skillBonuses[id]` wird additiv draufgeschlagen (wie bei innateSkills auch).

```
fw = raceSkill.value + (race.skillBonuses[raceSkill.skillId] ?? 0)
```

### 3. `computeInnateFw()` bleibt unverändert

Die extrahierte Methode wird nur für innateSkills verwendet (Formel-Logik). `race.skills` haben eine simplere FW-Berechnung (Direktwert + Bonus) und brauchen keine eigene Methode.

### 4. `correctIssues()`-Erweiterung bleibt bestehen

Die in der vorherigen Revision hinzugefügte innateSkills-Ergänzung in `correctIssues()` (Schritt 2b) ist korrekt und nützlich — der Button kann so auch nachträglich fehlende Skills ergänzen. Sie wird nicht zurückgenommen.

## Risks / Trade-offs

- **[Doppelte Prüfung]** `autoFix()` + `correctIssues()` haben überlappende Logik für innateSkills. Das ist gewollt: autoFix läuft beim Laden, correctIssues beim Button-Klick. Idempotent durch `knownIds.hasNext()`.
- **[Reihenfolge]** `race.skills` werden NACH `innateSkills` ergänzt — falls ein Skill in beiden Listen auftaucht, gewinnt die `innateSkills`-Definition (weil sie zuerst kommt). Das ist konsistent mit der Erwartung, dass universelle Regeln Vorrang haben.
