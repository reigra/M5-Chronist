## Context

Heute werden Charaktere in `CharacterStorage` geladen, durchlaufen `migrate()` (Schema-Konvertierung + hartkodierte Innate-Skill-Injektion) und landen direkt im View. Es gibt keine Validierung gegen das Regelwerk — Werte ausserhalb erlaubter Bereiche oder fehlende Pflicht-Skills werden nicht erkannt.

Die Innate-Skill-Logik in `migrate()` enthält bereits Spielregel-Wissen (Raufen-Formel, Trinken-Formel, Abwehr/Resistenz-Zaubern per Grad-Tabelle), aber hartkodiert und nicht erweiterbar. House-Rules können diese Logik nicht beeinflussen.

Zwei Design-Dokumente bilden die Grundlage:
- `docs/character-validation.md` — detaillierter Plan für Validate/AutoFix-Typen und Prüfkategorien
- `docs/universal-rules.md` — Schemadesign für Formelsprache, FormulaEngine und Rulebook-Integration

Dieses Design führt beide Stränge zusammen und ergänzt die Architekturentscheidungen aus der Explore-Phase.

## Goals / Non-Goals

**Goals:**
- Character kann gegen Regelwerk validiert werden (7 Prüfkategorien)
- Fehlende Pflicht-Skills werden beim Laden automatisch ergänzt (autoFix)
- Regelwerk definiert, welche Skills obligatorisch sind (`innateSkills[]`) und wie ihr FW berechnet wird (`formulas[]`)
- Rassenspezifische Skill-Modifier (z.B. Zwerg +1 Raufen) sind an der Rasse definiert, nicht in Formeln
- FormulaEngine wertet Formel-Strings sicher aus (Recursive-Descent, kein eval)
- M5-Konvention: Divisionen werden einzeln abgerundet (`Math.floor` pro `/`-Operator), Klammern zuerst
- CharacterLoadService orchestriert die Lade-Kette (`migrate → autoFix → validate`)
- UI zeigt Issues als Banner + Feld-Markierungen
- Rückwärtskompatibel: Regelwerke ohne `universalRules` funktionieren uneingeschränkt

**Non-Goals:**
- Keine Live-Validierung während der Eingabe (on-blur / on-input) — späterer Schritt
- Kein Formel-Editor im UI — Formeln werden in den Rulebook-JSONs gepflegt
- Keine automatische Korrektur von falschen Werten — autoFix ergänzt nur, korrigiert nie
- Keine EP-Bilanz-Prüfung (komplexe Kostenrechnung) — bleibt späterer Ausbauschritt
- Keine Änderung am Backup/Drive-Logik

## Decisions

### D1: autoFix wird rules-basiert, nicht hartkodiert

**Entscheidung:** `autoFix()` liest obligatorische Skills aus `rules.universalRules.innateSkills[]` und berechnet den FW über `rules.universalRules.formulas[]` + FormulaEngine. Keine hartkodierten Formeln im Code.

**Begründung:** Der Plan in `docs/character-validation.md` sah hartkodierte Formeln vor ("später ins Regelwerk"). Da `docs/universal-rules.md` bereits ein vollständiges Schema für Formeln definiert, können wir den Zwischenschritt überspringen und direkt rules-basiert arbeiten. House-Rules können einzelne Formeln oder Skills überschreiben.

**Konsequenz:** `migrate()` verliert den Innate-Skill-Block. Aufrufer, die bisher von der Injektion abhingen, bekommen `autoFix()` stattdessen über `CharacterLoadService`.

### D2: CharacterLoadService orchestriert Lade-Kette

**Entscheidung:** Neuer Service `CharacterLoadService.load(id)` lädt Rules + Character, ruft `migrate()` → `autoFix()` → `validate()` und gibt `{ character, rules, issues }` zurück.

**Begründung:** Der heutige `CharacterStorage.load()` ruft nur `migrate()` auf und hat keinen Rules-Zugriff. Statt Rules in den Storage zu injecten (Kopplung) oder jeden View autoFix vergessen zu lassen, gibt es einen zentralen Einstiegspunkt. Views rufen `CharacterLoadService.load(id)` statt `CharacterStorage.load(id)`.

**Alternativen verworfen:**
- Rules-Parameter in `CharacterStorage.load()` → API-Änderung an 10+ Aufrufstellen
- autoFix in jedem View → Vergessensrisiko, Duplizierung

### D3: FormulaEngine als Recursive-Descent-Parser (Ansatz B)

**Entscheidung:** Implementierung als Tokenizer + Recursive-Descent-Evaluator (Ansatz B aus `docs/universal-rules.md`).

**Begründung:**
- Kein `eval`/`new Function` — typsicher, kontrollierbar
- Bessere Fehlermeldungen mit Position
- Volle Kontrolle über Operator-Rangfolge
- Erweiterbar für spätere Anforderungen
- Geschätzte ~130 Zeilen — vertretbarer Aufwand

**M5-spezifische Rundungsregel:** Divisionen werden einzeln abgerundet (`Math.floor` pro `/`-Operator). Klammern zuerst. Beispiel:
- `St/10 + Ko/20` → `floor(St/10) + floor(Ko/20)`
- `(St+Gw)/20` → `floor((St+Gw)/20)` — Klammer zuerst addieren, dann teilen, dann floren

### D4: Merge-Strategie für universalRules — mergeById (Option B)

**Entscheidung:** `universalRules.formulas[]` und `universalRules.innateSkills[]` werden als Arrays mit `id`-Feld geführt und per existierender `mergeById()`-Logik gemerged. First-Wins pro ID, höchste Source-Priority gewinnt.

**Begründung:** Konsistent mit allen anderen Arrays im Rulebook (skills, races, spells, etc.). House-Rules können einzelne Einträge überschreiben, ohne das gesamte `universalRules`-Objekt ersetzen zu müssen.

**Struktur im Rulebook-JSON:**
```json
{
  "universalRules": {
    "formulas": [
      { "id": "AnB",   "formula": "(St+Gw)/20",       "allowsDice": false },
      { "id": "AusB",  "formula": "Ko/10 + St/20",    "allowsDice": false },
      { "id": "raufen", "formula": "(St+Gw)/20 + AnB", "allowsDice": false },
      { "id": "trinken", "formula": "Ko/10",           "allowsDice": false }
    ],
    "innateSkills": [
      { "id": "Raufen",      "formulaId": "raufen",  "defaultFw": 0 },
      { "id": "Trinken",     "formula": "Ko/10",     "defaultFw": 0 },
      { "id": "Abwehr",      "gradValues": true,     "defaultFw": 11 },
      { "id": "Zaubern",      "gradValues": true,     "defaultFw": 11, "condition": "hasSpells" }
    ]
  }
}
```

### D5: Rassen-Modifier gehören an die Rasse, nicht in die Formel

**Entscheidung:** `Race` erhält ein optionales `skillBonuses: Record<string, number>`-Feld. Beispiel: Zwerg → `{ "Raufen": 1 }`. Für die autoFix-Berechnung wird der Bonus nach der Formel-Auswertung addiert.

**Begründung:** Der Zwerg-Bonus auf Raufen ist eine rassenspezifische Regel, keine universelle. Würde man ihn in die Formel schreiben, müsste jede Rasse ihre eigene Formel haben oder die Formelsprache müsste Bedingungen unterstützen (Ternary, etc.). Mit `skillBonuses` bleibt die Formelsprache schlank und die Rassen-Daten sind konsistent mit dem existierenden `lpModifier`-Feld.

**Betroffene autoFix-Logik:**
```
fw = FormulaEngine.evaluate(formula, ctx)   // Basis-FW aus Formel
bonus = rules.races[raceId]?.skillBonuses?.[skillId] ?? 0
finalFw = fw + bonus
```

### D6: Bedingung für Zaubern-Skill als condition-Feld

**Entscheidung:** `InnateSkill.condition` definiert eine Voraussetzung für den Skill. `"hasSpells"` → Skill wird nur angelegt, wenn `character.spells.length > 0`.

**Begründung:** Einfach, erweiterbar. Spätere Conditions wie `"hasMagicType"` können ergänzt werden, ohne die Formelsprache zu ändern.

### D7: Runden — Math.floor pro Division

**Entscheidung:** Der Recursive-Descent-Parser wendet `Math.floor` auf das Ergebnis jeder Division an (`/`-Operator). Andere Operatoren (`+`, `-`, `*`) werden nicht gerundet. Klammern-Ausdrücke werden zuerst ausgewertet, dann das Ergebnis geteilt/gefloored.

### D8: Fehler bei unbekannten Variablen = harter Abbruch

**Entscheidung:** Enthält eine Formel eine Variable, die nicht im Kontext existiert, wirft `FormulaEngine.evaluate()` einen Fehler. Der Aufrufer (`autoFix`/`validate`) fängt diesen und erzeugt ein `ValidationIssue` mit Code `FORMULA_ERROR` und severity `error`.

**Begründung:** Ein Tippfehler im Rulebook-JSON (z.B. `"St/10 + Foobar"`) darf nicht still ignoriert werden. Das Chips-System in der UI zeigt Fehler deutlich an.

### D9: `innateSkills`-Eintrag mit `formula` vs `formulaId` vs `gradValues`

Ein `InnateSkill` kann seinen FW auf drei Wegen beziehen:
- `formula: string` — direkte Formel (z.B. `"Ko/10"` für Trinken)
- `formulaId: string` — Referenz auf `formulas[].id` (z.B. `"raufen"` referenziert `{ id: "raufen", formula: "(St+Gw)/20 + AnB" }`)
- `gradValues: true` — FW kommt aus `Skill.gradValues[]`-Tabelle (für Abwehr, Resistenz, Zaubern)
- `defaultFw: number` — Fallback, wenn keine der anderen Quellen greift

### D10: `validate()`-Prüfkategorien

Die Prüfungen folgen dem Katalog aus `docs/character-validation.md`:

| Kategorie | severity | Checks |
|-----------|----------|--------|
| A — Struktur & Referenzen | error | MISSING_RACE, MISSING_TYPE, TYPE_NOT_ALLOWED_FOR_RACE, UNKNOWN_SKILL, MISSING_ORIGIN, MISSING_SOCIAL_STATUS, FORBIDDEN_SKILL |
| B — Eigenschaften | error | PROPERTY_OUT_OF_RANGE, DERIVED_OUT_OF_RANGE |
| C — Fertigkeiten | warning/error | SKILL_BELOW_BASE, SKILL_ABOVE_MAX, MISSING_INNATE_SKILL (warning), MISSING_RACIAL_SKILL (warning), MISSING_BASE_SKILL, UNEXPECTED_PP (info) |
| D — Zauber | warning | SPELLS_WITHOUT_CASTER_TYPE, UNKNOWN_SPELL |
| E — EP/Gold | warning | EP_EXCEEDS_ES, NEGATIVE_GOLD |
| F — Boni | info | BONUS_VALUE_SUSPICIOUS |
| G — Grad-abhängige Skills | warning | GRAD_SKILL_VALUE_MISMATCH |
| H — Formelfehler | error | FORMULA_ERROR |

Kategorie G nutzt `lookupGradValue()` aus `docs/character-validation.md` (absteigend durch `skill.gradValues[]`, erster Treffer mit `grad ≤ currentGrad`).

### D11: `autoFix` läuft immer leise im Hintergrund

autoFix wird in `CharacterLoadService.load()` nach `migrate()` und vor `validate()` aufgerufen. Der User sieht das Ergebnis nicht direkt — nur indirekt, weil der Character vollständig ist. Die `FixDescription[]` wird nicht im UI angezeigt, könnte aber für Debugging geloggt werden.

Validate läuft separat — bei Bedarf (nach dem Laden, beim Speichern, im Import-Dialog).

## Risks / Trade-offs

| Risiko | Mitigation |
|--------|------------|
| **Rulebook-JSONs ohne `universalRules`** — alte Quellen brechen autoFix | Leere Defaults: `universalRules: { formulas: [], innateSkills: [] }` → autoFix macht nichts. Character wird unverändert geladen. |
| **Formel-Fehler im Rulebook** — Tippfehler killer autoFix ganz | Fehler pro Eintrag fangen: eine kaputte Formel killt nicht den ganzen autoFix-Durchlauf. Issue wird gemeldet. |
| **migrate()-Entschlackung** — Aufrufer hängen noch an alter Innate-Injektion | CharacterLoadService fängt alle Lade-Pfälle ab. Views nutzen `storage.load()` nicht mehr direkt. Code-Review auf alle load()-Caller. |
| **Performance** — FormulaEngine wird bei jedem Laden neu erstellt | FormulaEngine ist zustandslos → Singleton pattern. Oder pro Aufruf neu (Preis ~130 Zeilen Code, irrelevant für Ladezeit). |
| **Runden pro Division vs. am Ende** — andere M5-Versionen runden anders | Klar als M5-Konvention dokumentiert. Bei Umstellung auf andere Edition nur eine Stelle (Parser) zu ändern. |
| **Zirkuläre Formeln** — `AP = 1W3 + 1 + AusB` braucht `AusB`, das separat berechnet wird | Reihenfolge: Im Kontext müssen alle abhängigen Variablen bereits aufgelöst sein. Werden Formeln für autoFix genutzt, ist das unkritisch (nur einfache Skill-Formeln). Für validate ist der Context bereits im Character (Boni sind Teil des Characters). |
