## 1. Python-Script: parse_klasse() erweitern

- [ ] 1.1 In `tools/scripts/parse_EVA_kodex.py` in `parse_klasse()`: nach Ermittlung von `has_zau`/`has_kae` die `propertyBonuses`-Logik einbauen
- [ ] 1.2 `ZAU && !KAE` → `propertyBonuses` mit `{ id: "ResBk", value: 2, mode: "add" }` und `{ id: "ResBg", value: 2, mode: "add" }`
- [ ] 1.3 `KAE` → `propertyBonuses` mit `{ id: "ResBk", value: 1, mode: "add" }`
- [ ] 1.4 `propertyBonuses` nur setzen, wenn mindestens eine Bedingung zutrifft

## 2. Regenerate & Build

- [ ] 2.1 Script ausführen: `python tools/scripts/parse_EVA_kodex.py tools/EVA/m5kodex.xml tools/rules/eva_kodex.json`
- [ ] 2.2 `npm run build` — typecheck + build müssen durchlaufen
