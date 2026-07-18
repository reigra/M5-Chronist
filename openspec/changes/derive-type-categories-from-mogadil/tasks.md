## 1. Daten-Extraktion: Waffen-Kosten abfangen

- [ ] 1.1 Vor der Skills-Schleife in `parse_mogadil_document()` ein `dict[str, int]` für Waffen-Kosten pro Typ-ID anlegen (`waffen_costs_by_type = {}`)
- [ ] 1.2 Im `if r['name'] == 'Waffen'`-Zweig (Zeile 844) die `r['costs']` auslesen und per `cost_columns`-Index den Typ-IDs zuordnen: `waffen_costs_by_type[cost_columns[idx]] = int(cost) if cost.isdigit() else 0`
- [ ] 1.3 Log-Ausgabe hinzufügen: wie viele Waffen-Kosten gefunden wurden (`log(f'  Found {len(waffen_costs_by_type)} Waffen cost entries')`)

## 2. Kategorie-Ableitung und propertyBonuses

- [ ] 2.1 Konstanten-Dict `CATEGORY_BONUSES` definieren (vor `parse_mogadil_document()` oder als Modul-Konstante):
  ```python
  CATEGORY_BONUSES = {
      'Kämpfer':        [{'id': 'ResBk', 'value': 1, 'mode': 'add'}],
      'KampfZauberer':  [{'id': 'ResBk', 'value': 1, 'mode': 'add'}],
      'Zauberer':       [{'id': 'ResBk', 'value': 2, 'mode': 'add'},
                          {'id': 'ResBg', 'value': 2, 'mode': 'add'}],
  }
  ```
- [ ] 2.2 Override-Dict `CATEGORY_OVERRIDES: dict[str, str]` definieren mit `{'PS': 'Zauberer'}` und Platzhalter-Kommentar für weitere Ausnahmen
- [ ] 2.3 Helfer-Funktion `_derive_category(type_id, spell_costs, waffen_cost)` schreiben:
  - Wenn `type_id in CATEGORY_OVERRIDES` → Override zurückgeben
  - Wenn `spell_costs` leer → `'Kämpfer'`
  - Wenn `waffen_cost >= 40` → `'Zauberer'` (Fallback `waffen_cost = 0` wenn kein Eintrag)
  - Sonst → `'KampfZauberer'`
- [ ] 2.4 In `parse_mogadil_document()` nach der finalen `types`-Liste (Zeile 831: `types = [types_by_id[col] ...]`) eine Schleife einfügen, die für jeden Typ `category` und `propertyBonuses` setzt

## 3. Verifikation

- [ ] 3.1 `parse_Mogadil.py` ausführen: `python tools/scripts/parse_Mogadil.py` und prüfen, ob `mogadil.json` gültiges JSON bleibt
- [ ] 3.2 Stichprobe von Typen prüfen:
  - Kr (Krieger) → category="Kämpfer", propertyBonuses=[ResBk +1]
  - Ma (Magier) → category="Zauberer", propertyBonuses=[ResBk+2, ResBg+2]
  - Or (Ordenskrieger) → category="KampfZauberer", propertyBonuses=[ResBk +1]
  - PS (Priester Streiter) → category="Zauberer" (Override), propertyBonuses=[ResBk+2, ResBg+2]
- [ ] 3.3 Log-Ausgabe der Kategorien-Verteilung am Ende (`log(f'  Types: {sum(1 for t in types if t.get("category")=="Kämpfer")} Kämpfer, ...')`)
