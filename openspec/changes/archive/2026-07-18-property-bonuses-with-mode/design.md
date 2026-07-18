## Context

Das Formelsystem wertet `universalRules.formulas` aus und schreibt die Ergebnisse in `character.boni`. Es gibt jedoch keine Möglichkeit, rassen- oder typabhängige Bonus-Modifikatoren abzubilden.

Sowohl `Race` als auch `CharacterType` haben bereits ein Feld `propertyBonuses: Array<{ id: string; value: number }>`, das aber **nie ausgewertet wird**. Es fehlt:
- Eine Semantik (additiv vs. ersetzend)
- Die Einbindung in die drei Evaluationspfade des `CharacterValidator`

## Goals / Non-Goals

**Goals:**
- `propertyBonuses` wird in `autoFix()`, `correctIssues()` und `validateCategoryI()` ausgewertet
- Jeder Bonus deklariert explizit, ob er additiv (`add`) oder ersetzend (`set`) wirkt
- Evaluationsreihenfolge: Formel → Rasse → Typ (letzterer gewinnt bei Konflikten)
- `parse_EVA_kodex.py` erzeugt `propertyBonuses` aus XML-Attribut `Resistenz` (set-mode)

**Non-Goals:**
- Kein condition-System auf `UniversalFormula`-Ebene (das kommt später, wenn Bedarf besteht)
- Keine Änderung an der Merge-Logik in `RulesStorage` (spread kopiert `mode` automatisch)
- Keine UI-Änderungen (Boni werden weiterhin nur im Validator/Korrektur-Pfad berechnet)

## Decisions

### 1. `mode` ist required — kein Default

`mode: 'add' | 'set'` muss explizit gesetzt werden. Es gibt keinen impliziten Default. Dadurch ist auf den ersten Blick klar, was ein Bonus tut.

Alternativen verworfen:
- **Default `add`** → könnte zu Überraschungen führen, wenn jemand `set` erwartet
- **Default `set`** → genauso problematisch
- **Kein mode, implizit nach Quelle** (Rasse = set, Typ = add) → zu starr, widerspricht der Idee, dass beide Quellen beide Modi nutzen können

### 2. Evaluationsreihenfolge: Formel → Rasse → Typ

```
1. Formel:          bonus(Ko)         →  0
2. Rasse (mode):    set(5)            →  5    ← ersetzt Formel-Ergebnis
3. Typ   (mode):    add(1)            →  6    ← addiert auf Rasse-Wert
                     ────
                 final:  6
```

Begründung: Die Rasse definiert die Basis (Formel oder Festwert), der Typ gibt einen obligatorischen Bonus obendrauf. Im Beispiel Kämpfer-Zwerg ergibt sich so ResBk = 5 (Rasse) + 1 (Typ) = 6.

Da beide Quellen beide Modi unterstützen, kann ein Hausregel-Werk dies bei Bedarf umkehren.

### 3. Drei Eingriffspunkte im CharacterValidator

| Methode | Aufgabe |
|---------|---------|
| `autoFix()` | Setzt Default-Boni (0) + wendet Rasse/Typ-Boni an |
| `correctIssues()` | Berechnet Formel → Rasse → Typ → überschreibt `character.boni` |
| `validateCategoryI()` | Baut Sollwert inkl. Rasse/Typ-Boni für Vergleich |

### 4. Keine Änderung an der Merge-Logik

`propertyBonuses` wird in `mergeTypes()` und `mergeById()` per `{ ...bonus }` kopiert. Das neue `mode`-Feld wird automatisch mitkopiert — kein Eingriff nötig.

### 5. TypeScript-Typ: `PropertyBonusEntry`

Für das mode-Feld führen wir kein neues Interface ein, sondern schreiben es inline:

```typescript
// Vorher
propertyBonuses?: Array<{ id: string; value: number }>

// Nachher
propertyBonuses?: Array<{ id: string; value: number; mode: 'add' | 'set' }>
```

Beide Dateien (`Race.ts`, `CharacterType.ts`) bekommen dieselbe Änderung.

## Risks / Trade-offs

- **Brechende Änderung**: Bestehende Rulebook-JSONs mit `propertyBonuses` ohne `mode` brechen beim TypeCheck. Da aktuell niemand das Feld nutzt, ist der Zeitpunkt ideal.
- **Evaluationsreihenfolge nicht konfigurierbar**: Wer will, dass der Typ vor der Rasse ausgewertet wird, muss die Daten anders organisieren. Für die M5-Regeln ist die gewählte Ordnung korrekt. Bei Bedarf kann später ein `priority`-Feld ergänzt werden.
- **3 Stellen im Validator**: Die Bonus-Logik ist dreimal ähnlich, aber nicht identisch (autoFix setzt Default-Boni, correctIssues überschreibt, validateCategoryI vergleicht nur). Das ist akzeptabel — eine Extraktion in eine Hilfsfunktion wäre möglich, aber verfrüht (YAGNI).
