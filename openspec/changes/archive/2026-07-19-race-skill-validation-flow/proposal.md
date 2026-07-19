## Why

Rassen-Skills (`race.skills[]`) werden bei der Charaktererstellung weder ins Formular übernommen noch beim Speichern validiert. Ein neu erstellter Charakter landet ohne seine angeborenen Rassen-Fertigkeiten in IndexedDB — und das ganz ohne Fehlermeldung. Auch autoFix()-Korrekturen, die beim Laden eines Charakters durchgeführt werden, bleiben im RAM und werden nie persistiert. Zwei zusammenhängende Lücken im Validierungs- und Persistenzfluss verhindern, dass Rassen-Skills zuverlässig im Charakter landen.

## What Changes

- **`correctIssues()` erweitern**: Fehlende Rassen-Skills (`race.skills[]`) werden **VOR** den universellen InnateSkills ergänzt — analog zur bestehenden `innateSkills`-Ergänzung, aber mit Vorrang für rassen-spezifische Werte. Bisher konnte der "Auto-Korrektur"-Button nur universelle InnateSkills nachfüllen, nicht aber Rassen-Skills.
- **`MISSING_RACIAL_SKILL` → error**: Die Severity wird von `warning` auf `error` gehoben. Fehlende Rassen-Skills blockieren das Speichern — der User muss vorher korrigieren (manuell oder via Auto-Korrektur).
- **`CharacterLoadService` persistiert autoFix**: Wenn `autoFix()` Änderungen an einem geladenen Character vornimmt (`applied.length > 0`), wird der gefixte Character sofort in IndexedDB gespeichert. `autoFix()` verarbeitet dabei `race.skills[]` **VOR** `innateSkills[]`.
- **`CharacterEditView` validiert bei Rasse/Klassen-Wechsel**: Die `<select>`-Elemente für Rasse und Klasse erhalten `@change`-Handler, die `validate()` auf dem aktuellen Formularstand auslösen. Der User sieht sofort Fehler/Warnungen im Validation-Banner — ohne dass das Formular automatisch verändert wird.

## Capabilities

### Modified Capabilities

- `character-validation`: `MISSING_RACIAL_SKILL` von warning auf error geändert; `correctIssues()` um Rassen-Skills ergänzt; `CharacterLoadService` persistiert autoFix-Änderungen

## Impact

| Datei | Änderung |
|-------|----------|
| `src/services/CharacterValidator.ts` | Neue Section 2c in `correctIssues()`; `MISSING_RACIAL_SKILL` severity: `'error'` |
| `src/services/CharacterLoadService.ts` | `storage.save(fixed)` wenn `applied.length > 0` nach `autoFix()` |
| `src/views/CharacterEditView.vue` | `@change`-Handler auf Rasse/Klasse-Selects; validiert ohne Formular-Änderung |
