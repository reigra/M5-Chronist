## Context

Der Validator hat zwei parallele Korrektur-Funktionen mit unterschiedlichem Scope:

| Funktion | Wird aufgerufen von | Ergänzt innateSkills | Ergänzt race.skills | Persistiert |
|----------|-------------------|:---:|:---:|:---:|
| `autoFix()` | `CharacterLoadService.load()` | ✅ | ✅ | ❌ |
| `correctIssues()` | `runCorrection()`-Button (3 Views) | ✅ | ❌ | ✅ (nur im Edit-Mode) |

Der ursprüngliche Bug: Bei Neuanlage wird `autoFix()` nie aufgerufen (weil es nur im LoadService existiert). `correctIssues()` wird über den Button erreichbar, aber es fehlt die race.skills-Logik. Und selbst `autoFix()` im LoadService persistiert seine Änderungen nicht.

Hinzu kommt: `MISSING_RACIAL_SKILL` ist ein `warning` — der Save wird nicht blockiert, der User kann unwissentlich einen unvollständigen Charakter speichern.

## Goals / Non-Goals

**Goals:**
- `correctIssues()` ergänzt fehlende Rassen-Skills (wie `autoFix()` es bereits tut)
- `MISSING_RACIAL_SKILL` wird zu `error` → Save blockiert bis Korrektur
- `CharacterLoadService` persistiert autoFix-Änderungen in IndexedDB
- Race/Type-Wechsel im Edit-Formular triggert `validate()` (nur Lesen, keine Mutation)
- User kann fehlende Rassen-Skills via "Auto-Korrektur"-Button ergänzen
- **Validator warnt, wenn ein vorhandener Rassen-Skill einen falschen FW hat** (z.B. Nachtsicht=5 statt 2)

**Non-Goals:**
- Keine automatische Anpassung von Properties/Boni bei Rassenwechsel
- Keine automatische Entfernung alter Rassen-Skills bei Rassenwechsel
- Keine Änderung an `autoFix()` selbst (Logik bleibt identisch)
- Keine Änderung am `correctIssues()`-Verhalten für Boni/Formeln/InnateSkills (nur Erweiterung)

## Decisions

### D1: Race.skills-Ergänzung in `correctIssues()` VOR `innateSkills` (Section 2b → 2c)

Die Ergänzung wird als neuer Abschnitt **vor** der bestehenden "2b. Fehlende InnateSkills ergänzen" eingefügt (als neue 2b, das bisherige 2b wird 2c). **Rasse-spezifische Werte haben Vorrang vor universellen Defaults** — daher wird `race.skills` zuerst verarbeitet. `knownIds` wird einmalig vor beiden Abschnitten initialisiert.

```typescript
// ── 2b. Fehlende Rassen-Skills ergänzen (VOR innateSkills — Rasse gewinnt) ──
const knownIds = new Set(skills.map(s => s.skillId))
const fixRace = rules.races.find(r => r.id === character.raceId)
if (fixRace?.skills) {
  for (const rs of fixRace.skills) {
    if (knownIds.has(rs.skillId)) continue
    const bonus = fixRace.skillBonuses?.[rs.skillId] ?? 0
    skills.push({ skillId: rs.skillId, value: rs.value + bonus, pp: 0 })
    knownIds.add(rs.skillId)
    applied.push({
      action: 'add_racial_skill',
      target: rs.skillId,
      description: `Rassen-Fertigkeit "${rs.skillId}" mit FW ${rs.value + bonus} ergänzt`,
    })
  }
}

// ── 2c. Fehlende InnateSkills ergänzen (nach race.skills — nur wenn noch nicht vorhanden) ──
const addSkillBonuses = fixRace?.skillBonuses ?? {}
for (const innate of (rules.universalRules?.innateSkills ?? [])) {
  if (innate.condition === 'hasSpells' && (!character.spells || character.spells.length === 0)) {
    continue
  }
  if (knownIds.has(innate.id)) continue

  const fw = this.computeInnateFw(innate, ctx, formulaMap, rules, addSkillBonuses, character)

  skills.push({ skillId: innate.id, value: fw, pp: 0 })
  knownIds.add(innate.id)
  applied.push({
    action: 'add_innate_skill',
    target: innate.id,
    description: `Skill "${innate.id}" mit FW ${fw} ergänzt`,
  })
}
```

**Begründung**: Ein Skill wie "Nachtsicht" kann sowohl in `universalRules.innateSkills` (FW 0, universeller Default) als auch in `race.skills` der Elfen (FW 2, rassen-spezifisch) definiert sein. Wird `innateSkills` zuerst verarbeitet, landet FW 0 im Character und `race.skills` wird übersprungen. Die Reihenfolge **race.skills → innateSkills** stellt sicher, dass rassen-spezifische Werte gewinnen.

**Alternative**: In `autoFix()` den Scope erweitern. Aber autoFix wird nur im LoadService aufgerufen, nicht vom Button. correctIssues ist die vom User triggerbare Funktion — sie muss race.skills VOR innateSkills können.

**Wichtig**: Die gleiche Reihenfolge-Änderung muss auch in `autoFix()` vorgenommen werden (Section 1 vor 1b).

### D2: `MISSING_RACIAL_SKILL` → severity `'error'`

Einzelne Änderung in `validateCategoryC()`. Der Code `code: 'MISSING_RACIAL_SKILL'` existiert bereits mit `severity: 'warning'`. Wird auf `'error'` geändert.

**Begründung**: Rassen-Skills sind keine optionalen Fertigkeiten — sie gehören zur Rassendefinition. Ein Charakter ohne seine Rassen-Skills ist regeltechnisch unvollständig. Der Save muss blockieren, bis der User korrigiert hat.

### D3: Persistenz in `CharacterLoadService`

```typescript
const { fixed, applied } = characterValidator.autoFix(raw, rules)
if (applied.length > 0) {
  await characterStorage.save(fixed)
}
```

**Warum hier und nicht in `autoFix()` selbst**: `autoFix()` ist eine reine Transformationsfunktion (immutable, kein Side-Effect). Der LoadService orchestriert den Ladevorgang — er entscheidet, ob persistiert wird.

**Risiko**: IndexedDB-Write bei jedem Laden. Aber `autoFix()` ist idempotent — nach dem ersten Write ist `applied.length === 0`. In der Praxis: maximal ein Write pro Charakter-Lebenszyklus.

### D4: `@change`-Handler statt `watch`

```vue
<select v-model="raceId" required @change="onRaceOrTypeChanged">
```

```typescript
function onRaceOrTypeChanged(): void {
  if (!rules.value || !raceId.value || !typeId.value) return
  const temp = buildCharacter()
  validationResult.value = characterValidator.validate(temp, rules.value)
}
```

**Warum `@change` statt `watch([raceId, typeId])`**: Der Watch feuert auch bei `fillForm()` im Edit-Mode — unerwünscht. `@change` feuert nur bei User-Interaktion.

**Warum nur `validate()` und kein `autoFix()`**: Der User hat explizit entschieden, dass keine automatischen Änderungen am Formular stattfinden sollen. Validierung informiert, der User entscheidet über Korrektur.

### D5: `runCorrection()` speichert bei Neuanlage nicht

Bestehendes Verhalten bleibt: `runCorrection()` in `CharacterEditView` speichert nur im Edit-Mode (`if (isEdit.value)`). Bei Neuanlage korrigiert es nur das Formular (`fillForm(result.fixed)`). Der User speichert dann explizit via "Create"-Button → der vollständige Character (inkl. korrigierter Skills) landet in IndexedDB.

---

### D6: Validierung von Rassen-Skill-Werten (RACE_SKILL_VALUE_MISMATCH)

Zusätzlich zu `MISSING_RACIAL_SKILL` (fehlender Skill) SHALL der Validator prüfen, ob **vorhandene** Rassen-Skills den erwarteten FW haben.

```typescript
// In validateCategoryC(), nach MISSING_RACIAL_SKILL Prüfung:
if (race?.skills) {
  for (const rs of race.skills) {
    const cs = character.skills.find(s => s.skillId === rs.skillId)
    if (cs) {
      const expectedFw = rs.value + (race.skillBonuses?.[rs.skillId] ?? 0)
      if (cs.value !== expectedFw) {
        issues.push({
          path: `skills.${rs.skillId}.value`,
          severity: 'warning',
          code: 'RACE_SKILL_VALUE_MISMATCH',
          message: `Rassen-Fertigkeit "${rs.skillId}" hat FW ${cs.value}, Rasse erwartet FW ${expectedFw}`,
          actual: cs.value,
          expected: expectedFw,
        })
      }
    }
  }
}
```

**Severity: `warning`** (kein `error`), weil:
- Der User soll informiert werden, aber nicht blockiert
- Der Repair-Button (`correctIssues()`) korrigiert den Wert auf den erwarteten Rassen-FW

**correctIssues() Verhalten**: Überschreibt den FW mit dem erwarteten Rassen-Wert
(`rs.value + (race.skillBonuses[skillId] ?? 0)`), inkl. `applied`-Eintrag mit
`action: 'fix_racial_skill_value'`. Konsistent mit dem Prinzip "Repair-Button fixt
alle korrigierbaren Warnungen/Fehler" — analog zu Boni- und Attribut-Korrekturen.
`autoFix()` bleibt unverändert (ergänzt nur fehlende Skills, überschreibt nie Werte).

## Risks / Trade-offs

| Risiko | Mitigation |
|--------|------------|
| `@change`-Handler könnte bei schnellem Rassenwechsel inkonsistente Zwischenzustände validieren | `buildCharacter()` baut aus aktuellen Formularwerten; wenn `typeId` noch nicht gesetzt, bricht der Handler früh ab (`if (!typeId.value) return`) |
| autoFix-Persistenz könnte `updatedAt` verwirrend oft ändern | autoFix ändert `updatedAt` nicht (spreaded `...character`) — nur Datenergänzung, kein Timestamp-Update |
| `MISSING_RACIAL_SKILL` als error blockiert auch Batch-Importe und LaTeX-Export | Import/Export haben eigene Load-Pfade, die `autoFix()` durchlaufen (und ab jetzt persistieren) — die Skills sind vor Export/Import bereits fixiert |
