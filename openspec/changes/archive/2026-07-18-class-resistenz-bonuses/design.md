## Context

Die EVA-XML hat für jede Klasse (`Typ="Klasse"`) die Attribute `ZAU` und `KAE` in den Dynprops. Diese bestimmen die Kategorie (`Zauberer`, `Kämpfer`, `KampfZauberer`, `Freie`), werden aber nicht für Resistenz-Boni genutzt.

`parse_EVA_kodex.py` erzeugt `propertyBonuses` bereits für Rassen (aus `Resistenz`). Das mode-System (`add`/`set`) und die Evaluationsreihenfolge (Formel → Rasse → Typ) sind im Validator implementiert.

## Goals / Non-Goals

**Goals:**
- `parse_klasse()` erzeugt `propertyBonuses` aus den Attributen `ZAU`/`KAE`
- `mode` ist immer `"add"` (Klassen-Boni sind additiv)
- Generierte Typen haben `propertyBonuses` mit korrekten Werten

**Non-Goals:**
- Keine Änderung an `CharacterValidator` (mode-System läuft bereits)
- Keine Änderung an den TypeScript-Typen
- Kein neues Datenformat — `propertyBonuses` wird wie bei Rassen genutzt

## Decisions

### 1. Ableitungslogik aus ZAU/KAE

```
ZAU && !KAE  →  ResBk +2, ResBg +2   (reiner Zauberer)
KAE          →  ResBk +1              (Kämpfer/KampfZauberer)
```

Begründung: Die Werte ergeben sich direkt aus den M5-Regeln. Die Logik wird in `parse_klasse()` implementiert, nachdem `has_zau`/`has_kae` ermittelt wurden. Alternative (statische Mapping-Tabelle) wäre wartbarer, aber hier ist die Logik einfach genug für Inline-Code.

### 2. mode: "add" für Typen

Rassen nutzen `mode: "set"` (ersetzen Formel), Typen nutzen `mode: "add"` (addieren auf Formel+Rasse). Das ist konsistent mit den M5-Regeln und der Evaluationsreihenfolge.

### 3. Reihenfolge der Einträge

Die `propertyBonuses` werden in `parse_klasse()` ans Ende des Type-Dicts gesetzt (vor `return`). Läuft über den gleichen Merge-Pfad wie bestehende Daten — kein neuer Code nötig.

## Risks / Trade-offs

- **Reihenfolge KAE vs. ZAU**: Ein KampfZauberer hat `KAE=true, ZAU=true`. Die Logik prüft zuerst `ZAU && !KAE` (trifft nicht zu), dann `KAE` (trifft zu) → nur ResBk +1. Kein ResBg-Bonus für KampfZauberer. Das ist M5-konform.
- **Freie Typen**: Weder ZAU noch KAE → kein propertyBonuses. Ebenfalls korrekt.
- **Keine Hausregel-Überschreibung**: Wenn jemand per Hausregel andere Typ-Boni will, muss er das über ein separates Source-JSON mit `mode: "set"` lösen.
