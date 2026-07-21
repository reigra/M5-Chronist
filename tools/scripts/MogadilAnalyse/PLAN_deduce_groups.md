# Plan: Skill-Gruppen-Deduktion — Full-Category MIN

## Kernidee

Jeder Skill hat einen Letter (A–L), der seine **möglichen Kategorien** vorgibt.
Die Kosten eines Skills in einer Klasse sind:
`skill_cost = min({groupCosts[Klasse][Kat] für Kat in tatsächlich genutzte Kategorien})`

Ein Skill nutzt typischerweise alle Kategorien seines Letters, manchmal eine
Teilmenge. Der Algorithmus probiert zuerst alle Kategorien; wenn das scheitert,
werden kleinere Teilmengen getestet.

Auf diese Weise wurden **99 von 100 Skills** eindeutig zugewiesen, die
Kategorie-Kosten in **504/504 Fällen** bestätigt, und **54/55 Skill-Gruppen**
stimmen exakt mit eva überein.

### Abweichungen zu eva

| Skill | Letter | Mogadil (deduziert) | eva | Grund |
|-------|--------|---------------------|-----|-------|
| Betäuben | K | Kampf+Unterwelt | Halbwelt+Kampf | Letter K in Mogadil hat {Kampf,Unterwelt}, eva erwartet {Halbwelt,Kampf}. Cross-Letter-Konflikt — nicht automatisch auflösbar. |
| Skifahren | A | Körper | Alltag | Körper-Kosten matchen 63/63 Klassen perfekt. eva hat für die 15 Typen gar keinen Körper-Eintrag → eva kann {Körper} nicht ausdrücken.|

## Algorithmus (implementiert in `deduce_groups.py`)

### Datenstruktur

`lower[cid][cat]` / `upper[cid][cat]` — untere/obere Kostengrenze pro (Klasse, Kategorie).
Bestätigt wenn `lower == upper`. Initialisiert mit `{10, 20, 30, 40}`.

### Phase 1: Single-Category Letters (C, D, I, L)

```
C → Freiland, D → Körper, I → Wissen, L → Kampf
lower[cid][cat] = upper[cid][cat] = observed_cost → bestätigt
```

### Phase 2: 2-Candidate Letters mit bekanntem cat1 (B, F, K)

Vector matching: finde den häufigsten Kostenvektor für cat2.

| Letter | cat1 (bekannt aus) | cat2 |
|--------|-------------------|------|
| B (Alltag, Wissen) | Wissen (I) | Alltag |
| F (Freiland, Wissen) | Freiland (C) | Wissen |
| K (Kampf, Unterwelt) | Kampf (L) | Unterwelt |

J (Alltag, Halbwelt) hat keinen cat1 aus Single-Cat → wird iterativ in Phase 3
gelöst sobald Alltag oder Halbwelt bestätigt sind.

### Phase 3: Multi-Cat Skills — Full-Set + Subset Search

Für jedes noch nicht zugewiesene Skill (A, E, G, H; plus iterative 2-Cat-Letters):

**Schritt 1 — Full-Cat Check**: Prüfe ob `min(ALL letter cats)` in allen Klassen
mit dem beobachteten Cost übereinstimmt (d.h. alle Kategorien-Kosten sind bestätigt
und `min == observed`). Wenn ja → assigne ALL Cats.

**Schritt 2 — Subset Fallback**: Wenn Full-Cat scheitert, suche N-1, N-2, ..., 1
Subsets (größte zuerst). Sortiere nach (Größe desc, Confidence desc).
Picke das Beste mit eindeutigem Sieger.

### Fixpunkt-Iteration

Nach jeder Zuweisung:
- **Lower Bounds**: `cost_c >= observed` für alle c in assigned subset → erhöhe
  untere Grenze
- **Rückwärts-Propagation**: Wenn alle bis auf eine Kategorie bestätigt sind und
  alle > observed → letzte muss = observed
- **2-Cat Retry**: Wenn neue Kategorien bestätigt wurden, wiederhole Phase 2 für
  noch offene 2-Cat-Letters (B, F, J, K)
- Wiederhole bis keine Änderung

### Subset-Evaluierung (`evaluate_multicat_subsets`)

Für jedes Subset (N-1 bis 1 Kategorien) in jeder Klasse:
- **Bestätigte Kat < observed** → Subset ungültig (diese Kat kann nicht genutzt werden)
- **Alle bestätigt** → `min == observed` erforderlich
- **Alle bis auf eine bestätigt, alle > observed** → letzte muss = observed (Lesson!)
- **Keine bestätigt** → nur Lower-Bound-Check (≥ observed)

## 3. Ergebnisse

| Metrik | Wert |
|--------|------|
| Assigned | 99 von 100 |
| Ambiguous | 0 |
| Contradictions | 1 (Betäuben — Cross-Letter-Konflikt) |
| Confirmed Costs | 504 / 504 (100%) |
| eva group match (55 Skills) | 54 / 55 (98%) |
| groupCost match (15 Typen × 8 Kategorien) | 120 / 120 (100%) |

### Abweichungen zu eva

1. **Betäuben** (Letter K): eva sagt {Halbwelt, Kampf}, aber Letter K im
   Mogadil-System ist {Kampf, Unterwelt}. Cross-Letter-Konflikt — kein
   Algorithmusfehler, die Datenquellen sind hier inkonsistent.

2. **Skifahren** (Letter A): Algorithmus deduziert {Körper}, eva sagt {Alltag}.
   Körper-Kosten matchen 63/63 Klassen perfekt. In eva fehlt Körper für die
   15 Typen komplett (nur Alltag, Halbwelt, Kampf vorhanden) → eva kann {Körper}
   gar nicht ausdrücken. Vermutlich ein Fehler in evas Typ-Struktur.

### Konsistenznachweis

- **120/120 groupCost-Werte** der 15 überlappenden Typen identisch mit eva
- **54/55 Skill-Gruppen** exakter Match (Skifahren ausgenommen)
- **504/504 Kategorie-Kosten** bestätigt (63 × 8)
- **0 Ambiguities**
- Alle 44 Mogadil-only Skills (MagusNG-Erweiterungen) korrekt zugewiesen

## 4. Dateien

| Datei | Beschreibung |
|-------|-------------|
| `deduce_groups.py` | Algorithmus-Implementierung |
| `extract_class_skills.py` | Extraktion aus Mogadil-Quelldatei |
| `check_eva_groups.py` | Verifikation gegen eva_kodex |
| `letter_groups.json` | Letter→Kategorien-Mapping |
| `output/class_skills.json` | Eingabe: 100 Skills, 63 Klassen, Kosten |
| `output/skill_groups_min.json` | Ergebnis: Skill→Kategorie-Zuweisung |
| `output/class_group_costs_min.json` | Ergebnis: Kategorie-Kosten pro Klasse |

## 5. Integration in parse_Mogadil.py

### Ziel

Der Parser `tools/scripts/parse_Mogadil.py` soll direkt `groupCostCats` (Skills) und
`groupCosts` (Typen) ausgeben statt `costPatternId` / `costPatterns`.

Aktuelle Pipeline: PDF → parse_Mogadil → `mogadil.json` (mit costPatternId)

Neue Pipeline: PDF → parse_Mogadil → `mogadil.json` (mit groupCostCats + groupCosts)
  └─ intern: extrahieren → _build_class_skills → deduce_from_data → anreichern

Kein externer Zwischenschritt mehr — alles in `parse_Mogadil.py`.

### Schritt 1: `deduce_groups.deduce_from_data()` extrahieren

In `deduce_groups.py`:

```python
def deduce_from_data(skills_data: dict, groups_data: dict, log=print) -> tuple[dict, dict]:
    """Wie deduce(), aber liest aus Parametern statt Dateien.

    Args:
        skills_data: dict mit keys 'skills' und 'classColumns' (Format wie class_skills.json)
        groups_data: dict mit Letter→Kategorien-Mapping (Format wie letter_groups.json)
        log: print-Funktion für Logging

    Returns:
        (groups_output, costs_output) — gleiches Format wie die JSON-Ausgabedateien
    """
```

Dazu:
- `deduce()` umbenennen nach `deduce_from_data()` — da ist die ganze Logik drin
- Neue `deduce()` schreiben, die Dateien lädt und `deduce_from_data()` aufruft
- `load_data()` bleibt erhalten (wird von der neuen `deduce()` genutzt)

### Schritt 2: `_build_class_skills()` in `parse_Mogadil.py`

Neue Hilfsfunktion, die aus den bereits extrahierten Rohdaten das Format baut,
das `deduce_from_data()` erwartet:

```python
def _build_class_skills(all_rows: list, cost_columns: list) -> dict:
    """Baut class_skills-Format aus extrahierten Tabellen.

    Format:
      { skills: [{name, letter, costs: {As: 10, Ba: 20, ...}}, ...],
        classColumns: ["As", "Ba", "Bb", ...] }
    
    Das ist exakt das Format von class_skills.json — die Kosten pro Skill
    werden aus der flachen Liste (costs: ["10", "20", ...]) in ein
    Dict cost_columns[i] → int umgewandelt.
    """
```

Hinweis: Skills ohne gültige Letter (unbekannte Kategorie) werden wie heute
übersprungen. Ihre Letter müssen in `letter_groups.json` vorhanden sein.

### Schritt 3: `build_cost_patterns` ersetzen

Im `parse_mogadil_document()` (ca. Zeile 932–972):

```python
# ALT:
cost_patterns, pattern_map = build_cost_patterns(all_rows, cost_columns)
# ... dann für jedes skill: pattern_id = pattern_map[key] → costPatternId

# NEU:
from deduce_groups import deduce_from_data

class_skills = _build_class_skills(all_rows, cost_columns)
letter_groups_path = os.path.join(os.path.dirname(__file__),
    'MogadilAnalyse', 'letter_groups.json')
with open(letter_groups_path, encoding='utf-8') as f:
    letter_groups = json.load(f)

groups_output, costs_output = deduce_from_data(class_skills, letter_groups, log)

# Lookups
skill_groups = {}
for s in groups_output['skills']:
    skill_groups[s['name']] = s['groupCostCats']

class_costs = {}
for c in costs_output['classes']:
    class_costs[c['id']] = c['groupCosts']
```

### Schritt 4: Skill-Output umstellen

```python
# ALT:
skills.append({
    ...
    'costPatternId': pattern_id,
    ...
})

# NEU:
skills.append({
    ...
    'groupCostCats': skill_groups.get(skill_name, ''),
    ...
})
```

Für Waffenfertigkeiten analog: `'groupCostCats': skill_groups.get(wpn_name, '')`

### Schritt 5: Types mit groupCosts anreichern

Nach der Kategorie-Ableitung (ca. Zeile 915–925):

```python
for t in types:
    # ... bestehende Logik (category, propertyBonuses, apGain) ...
    t['groupCosts'] = class_costs.get(t['id'], {})
```

### Schritt 6: Output bereinigen

Aus dem `output`-Dict (Zeile 1022–1038) entfernen:
- `'costPatterns': cost_patterns,` → entfernen
- `'costColumns': cost_columns,` → entfernen (optional — nur noch zum Debuggen)

`build_cost_patterns()` und `_compact_arrays()` können bleiben (erstere
wird nicht mehr aufgerufen, letztere wird nicht mehr benötigt — beides
später aufräumbar).

### Was unverändert bleibt

- `extract_class_skills.py` als Standalone-Skript (für unabhängige Tests)
- `check_eva_groups.py` für Verifikation
- `download_parse_rules_gui.py` (keine Änderung nötig — ruft nur
  `parse_mogadil_document()` auf, dessen Signatur gleich bleibt)
- Die Ausgabedateien in `MogadilAnalyse/output/` bleiben als Referenz erhalten

### Test nach Integration

`mogadil.json` neu parsen und mit bisheriger Version vergleichen:

1. `python tools/scripts/parse_Mogadil.py`
2. Prüfen: jedes Skill hat `groupCostCats` statt `costPatternId`
3. Prüfen: jeder Type hat `groupCosts`-Dict
4. Prüfen: `costPatterns` fehlt im Output
5. Stichprobe: Werte in `groupCostCats` + `groupCosts` mit `skill_groups_min.json`
   und `class_group_costs_min.json` abgleichen
6. Zahlenabgleich: 504 Kategorie-Kosten + 8 Kategorien × 63 Typen = 504 bestätigt?
