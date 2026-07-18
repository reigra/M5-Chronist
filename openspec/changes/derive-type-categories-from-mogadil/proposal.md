## Why

The Mogadil Lerntabellen PDF covers 40+ character types, but many of these (Bestienjäger, Klingenmagier, Paktkrieger, etc.) exist only in campaign supplements — they have no entry in the Kodex XML. Currently `parse_Mogadil.py` extracts `spellCosts` and `fightCosts` per type, but never sets `category` or `propertyBonuses`. Without these, the character validator can't compute ResBk/ResBg bonuses for Mogadil-only types.

The PDF contains the necessary signals: whether a type has spell costs, plus the "Waffen" skill group learning cost. From these, the type category (Kämpfer/KampfZauberer/Zauberer) can be derived, and from the category the standard ResBk/ResBg propertyBonuses follow.

## What Changes

- **`tools/scripts/parse_Mogadil.py`**: New logic to derive `category` and `propertyBonuses` (ResBk/ResBg) for each type from:
  - Presence of `spellCosts` (determines if magic-capable)
  - Per-type "Waffen" skill group cost (threshold ≥ 40 → Zauberer, < 40 → KampfZauberer)
  - No spellCosts → Kämpfer
  - Hardcoded override map for types misclassified by the heuristic (e.g., PS/Priester Streiter)
- **`mogadil.json` output**: Each type entry gains `category` and `propertyBonuses` fields.

No changes to TypeScript types, no changes to existing specs — the bonus-calculation system already consumes `category` and `propertyBonuses` as-is.

## Capabilities

### New Capabilities
- `mogadil-type-categories`: Derive character type category (Kämpfer/KampfZauberer/Zauberer) and ResBk/ResBg propertyBonuses from the Mogadil PDF data

### Modified Capabilities
*(none — the existing `bonus-calculation` spec is unchanged; this adds a new data source)*

## Impact

- **Affected file**: `tools/scripts/parse_Mogadil.py` (~30 lines of new logic)
- **Output change**: `tools/rules/mogadil.json` types entries grow `category` + `propertyBonuses`
- **Downstream**: RulesStorage merge already handles union of fields across sources; no merge logic changes needed
- **No dependency changes**: Same Python libraries (pdfplumber)
