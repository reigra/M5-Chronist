# Plan: Deduce Skill Groups v3 — Full-Category MIN

## 1. Problem der Vorgängerversionen

**Grundannahme bisher**: Ein Skill nutzt **1–2 Kategorien** aus seinem Letter.
Die Kategorie-Kosten werden durch Subset-Suche + MIN-Vergleich deduziert.

**Falsch erkannt durch eva-Vergleich**: Alle 3 verbliebenen Widersprüche sind in
eva_kodex konsistent. Der Fehler liegt im Algorithmus, nicht in den Daten.

**Die korrekte Regel**: Ein Skill kann ALLE Kategorien seines Letter nutzen.
Die Kosten sind `min(groupCosts[Letter-Kategorien])`. Der Letter gibt die
**maximale Menge** vor, der Skill nutzt tatsächlich einige (oft alle).

| Skill | Letter | eva Gruppen | Bisher (1–2, v2) | Neu (v3) |
|-------|--------|-------------|-------------------|----------|
| Gassenwissen | G | {Halbwelt, Sozial, Unterwelt} | Contradiction (kein 1-2 Subset global) | **MIN(alle 3) → assigned** |
| Klettern | A | {Alltag, Halbwelt, Körper} | Contradiction (min(alle 4 A-cats) ≠ obs) | **3er-Teilmenge → assigned** |
| Betäuben | K | {Halbwelt, Kampf} | Contradiction (Letter K = {Kampf, Unterwelt} ≠ eva) | bleibt Contradiction (cross-letter) |

## 2. Algorithmus (implementiert in `deduce_groups_v3.py`)

### Phase 1: Single-Category Letters (C, D, I, L) — unverändert
```
C → Freiland, D → Körper, I → Wissen, L → Kampf
lower[cid][cat] = upper[cid][cat] = observed_cost → bestätigt
```

### Phase 2: 2-Candidate Letters mit bekanntem cat1 (J, K) — unverändert
Vector matching (wie v1/v2): cat1=Kampf (aus L), finde cat2=Unterwelt Vektor.

### Phase 3: Multi-Cat Skills — Full-Set + Subset Search
Für jedes (A, E, G, H) Skill:

**Schritt 1 — Full-Set Check**: Prüfe ob `min(ALL letter cats)` in ALLEN Klassen
mit dem beobachteten Cost übereinstimmt. Wenn ja → assigne ALL Cats.

**Schritt 2 — Subset Fallback**: Wenn Full-Set scheitert, suche N-1, N-2, ..., 1
Subsets (größte zuerst). Sortiere nach (Größe desc, Confidence desc).
Picke das Beste.

### Fixpunkt-Iteration
Nach jeder Zuweisung:
- Propagiere Lower Bounds: `cost_c >= observed` für alle c in assigned subset
- Rückwärts-Propagation: Wenn alle bis auf eine Kategorie bestätigt sind
  und alle > observed → letzte muss = observed
- Wiederhole bis keine Änderung

## 3. Ergebnisse

| Metrik | v1 (MIN) | v2 (1-2 Subset) | v3 (Full-Cat) |
|--------|----------|-----------------|---------------|
| Assigned | 88 | 97 | **99** |
| Ambiguous | 1 | 0 | **0** |
| Contradictions | 11 | 3 | **1** |
| Confirmed Costs | 384/504 | 504/504 | **504/504** |
| eva exact match | — | 67% | **54/55 (98%)** |

### Verbliebene Issues

1. **Betäuben** (Letter K): Eva sagt {Halbwelt, Kampf}, aber Letter K im
   Mogadil-System ist {Kampf, Unterwelt}. Kann nicht aufgelöst werden ohne
   Änderung der Letter-Zuordnung.

2. **Skifahren** (Letter A): Algorithmus deduziert {Körper}, eva sagt {Alltag}.
   Körper-Kosten von D-Letter Skills matchen perfekt (63/63 Klassen).
   → Kein Algorithmus-Fehler, sondern ein Unterschied in den Quelldaten.

## 4. Dateien

| Datei | Beschreibung |
|-------|-------------|
| `deduce_groups_v3.py` | Algorithmus-Implementierung |
| `output/class_skills.json` | Eingabe: 100 Skills, 63 Klassen, Kosten |
| `output/skill_groups_min_v3.json` | Ergebnis: Skill→Kategorie-Zuweisung |
| `output/class_group_costs_min_v3.json` | Ergebnis: Kategorie-Kosten pro Klasse |

## 5. Nächste Schritte (optional)

- Betäuben manuell korrigieren (Letter K → groups={Halbwelt, Kampf})
- Skifahren validieren (Körper vs Alltag — Datenabgleich nötig)
- In AdvancementService integrieren
