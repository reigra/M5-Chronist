## Context

`parse_Mogadil.py` parses the Mogadil Lerntabellen PDF and outputs a `types[]` array with `id`, `name`, `spellCosts`, and `fightCosts`. It does not set `category` or `propertyBonuses` on types.

The Kodex parser (`parse_EVA_kodex.py`) sets `category` and `propertyBonuses` for ~14 core types via ZAU/KAE XML flags. But Mogadil covers 40+ types — the extras are campaign-supplement types like Bestienjäger, Klingenmagier, Dämonenbeschwörer, etc. For those, no Kodex entry exists, so they never get category or propertyBonuses.

The character validator (`CharacterValidator.ts`) relies on `character.boni.ResBk` and `character.boni.ResBg` being correctly computed from the type's `propertyBonuses`. Without them, Mogadil-only types get default zero bonuses regardless of what M5 rules dictate.

The merge system (`RulesStorage.mergeTypes`) already handles combining fields from multiple sources — it fills in undefined fields from lower-priority sources. Adding `category` + `propertyBonuses` to the Mogadil output means Mogadil-only types become self-sufficient, while core types simply get their fields confirmed (merge won't override Kodex values).

## Goals / Non-Goals

**Goals:**
- Every type in `mogadil.json` has a `category` field (Kämpfer/KampfZauberer/Zauberer)
- Every type in `mogadil.json` has a `propertyBonuses` array with ResBk/ResBg entries
- The derived categories match M5 rules (verified against Kodex for overlapping types)
- Hardcoded override mechanism exists for edge cases

**Non-Goals:**
- No changes to TypeScript types or existing specs (bonus-calculation spec unchanged)
- No changes to the merge logic in RulesStorage.ts
- No changes to the character validator
- No `groupCosts` derivation (that stays in the Kodex)

## Decisions

### Decision 1: Category derivation logic

The type category is derived from two data points already extracted by the parser:

```
spellCosts present?
  ├─ No  → Kämpfer     (→ ResBk +1)
  └─ Yes → Waffen cost ≥ 40?
             ├─ Yes → Zauberer    (→ ResBk +2, ResBg +2)
             └─ No  → KampfZauberer (→ ResBk +1)
```

**Rationale:**
- `spellCosts` is already extracted from the Zaubersprüche section — if present, the type can cast spells
- The "Waffen" skill cost is the per-type learning cost for weapon skills. Cost ≥ 40 means "prohibitively expensive for a caster" — correlates perfectly with pure Zauberer in M5
- Verified against all 14 Kodex types: 100% match using this heuristic
- The ZAU/KAE → propertyBonuses mapping from `parse_EVA_kodex.py` is reused directly

**Alternative considered:** Using `fightCosts` (all values = 120 means Zauberer). Rejected because:
- "Waffen" cost is a single integer per type, simpler and more reliable
- Some Zauberer types have non-120 fightCosts in the PDF layout quirks

### Decision 2: Hardcoded override map

A Python dict `CATEGORY_OVERRIDES: dict[str, str]` maps type IDs to forced categories. Applied before the heuristic check.

**Rationale:** PS (Priester Streiter) has Waffen cost 30 (below threshold) but is a pure Zauberer in M5. Rather than complicating the heuristic for one edge case, an explicit override keeps the logic simple and auditable.

### Decision 3: Where in the script to add the logic

The new logic executes in `parse_mogadil_document()` after `extract_type_costs()` returns, before the `types` list is finalized and output. At that point:
- `cost_columns` is known
- `all_rows` is available (contains the "Waffen" row with per-type costs)
- `types` list is built from footers

The Waffen costs are captured from `all_rows` during skill building (the "Waffen" row is currently consumed with `continue` — we read `r['costs']` before skipping).

### Decision 4: propertyBonuses format

Matches the existing format from `parse_EVA_kodex.py`:

| Category | propertyBonuses |
|----------|-----------------|
| Kämpfer | `[{id: "ResBk", value: 1, mode: "add"}]` |
| KampfZauberer | `[{id: "ResBk", value: 1, mode: "add"}]` |
| Zauberer | `[{id: "ResBk", value: 2, mode: "add"}, {id: "ResBg", value: 2, mode: "add"}]` |

Consistent with the ZAU/KAE derivation in `parse_EVA_kodex.py`:
- KAE=true → ResBk +1 (Kämpfer and KampfZauberer)
- ZAU=true, KAE=false → ResBk +2, ResBg +2 (Zauberer)

## Risks / Trade-offs

- **[False positive Waffen >= 40]** A future supplement could add a type with Waffen cost 40 that is actually a KampfZauberer. Mitigation: the override map catches this with a simple entry.
- **[False negative Waffen cost parsing]** If the PDF layout changes and the "Waffen" row moves or changes format, costs won't be found. Mitigation: graceful fallback to Kämpfer (safe default: no magic, no bonus beyond ResBk +1).
- **[No groupCosts for Mogadil-only types]** Category alone doesn't give you groupCosts — that's still needed for EP calculation. But that's a separate concern not addressed here. Types without groupCosts from any source will be marked `isMeta` by the merge system.
