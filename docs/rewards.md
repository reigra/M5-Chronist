# Training as a reward (Belohnungs-Ausbildung)

## Context

M5 lets the GM pay for a job with free teacher support instead of gold:

| Action | Normal | Reward (Belohnung) |
|---|---|---|
| Learn skill (Fertigkeit/Waffenfertigkeit) | full EP + 200 GS per LE | full EP, **0 GS** |
| Learn spell (Zauber) | full EP + 100 GS per LE | **½ EP**, **0 GS** |
| Advance skill (Steigern) | full EP + 20 GS per TE | **½ EP**, **0 GS** |

PP (Praxispunkte) still apply as usual in both modes: they first reduce the TE/LE count, and only then is the reward halving applied.

Today `AdvancementView` and `SpellsView` only know the normal calculation. Both pages need a mode toggle. Every cost shown (tables, affordability, modals) must follow the selected mode.

## Decisions (agreed)

1. **Rounding**: halve the total after PP and round up once:
   `cost = ceil((TE − PP) × EP/TE / 2)`, and the same with LE for spells.
2. **Gold-for-EP replacement** (up to 50 % EP paid at 10 GS/EP) is **disabled** in reward mode. The input is hidden and `epToPayWithGold` is forced to 0.
3. **Toggle persistence**: one in-memory mode per browser session, shared by AdvancementView and SpellsView. It is not persisted, so a reload resets it to `normal`.
4. **Table display**: show only the effective cost (mode + PP). Keep the existing PP strikethrough as it is. In reward mode, the cost column header gets a small "Belohnung" marker.
5. **Modal toggle**: each confirmation modal has its own toggle. It starts with the page mode when the modal opens. Changing it in the modal recalculates only that pending action and does **not** change the page mode.
6. **Gold fee input** in modals stays editable (GM override). Its default is 0 in reward mode and the normal fee otherwise. Switching the modal mode resets it to the new default.

## Step-by-step implementation

### Step 1 — Types
- `src/types/Advancement.ts` (new) or add to an existing types file: `export type AdvancementMode = 'normal' | 'reward'`.

### Step 2 — `AdvancementService` (`src/services/AdvancementService.ts`)
- Add an optional `mode: AdvancementMode = 'normal'` parameter (last position, so existing callers keep working) to:
  - `advanceCost(..., pp, mode?)`. Apply `ceil(x / 2)` in reward mode after the PP reduction.
  - `advanceSkill` / `advanceSkillInstance`: add `mode`. In reward mode, compute `cost` with halving and ignore `epToPayWithGold` (treat it as 0).
  - `learnCost` / `learnSkill` / `learnSkillInstance` stay **unchanged**: their EP are the same in both modes, and an unused `mode` parameter would break `noUnusedParameters`.
- New pure helpers so views stop hardcoding gold factors:
  - `learnGoldCost(skill, mode)` → `mode === 'reward' ? 0 : skill.learnCost * 200`
  - `advanceGoldCost(teAfterPp, mode)` → `mode === 'reward' ? 0 : teAfterPp * 20`
  - `spellLearnCost(spell, group, type, ppAvailable, mode)` → `{ epCost, originalEpCost, ppUsed, goldCost }`. `group` is the normalized spell group key; `normalizeGroup` stays in the view. Move the spell math out of `SpellsView` (`lc × spellCosts[group]`, PP reduction, halving, `100 GS/LE` gold fee).
  - `maxGoldEp(cost, mode)` → `mode === 'reward' ? 0 : Math.floor(cost / 2)`
- Private `applyMode(ep, mode)` → `mode === 'reward' ? Math.ceil(ep / 2) : ep`, used by `advanceCost`, `advanceSkill*` and `spellLearnCost`.
- Update the class JSDoc header and the method JSDoc (the reward rule, rounding and the "PP first" order).

### Step 3 — Shared mode state
- `src/composables/useAdvancementMode.ts` (new): a module-level `ref<AdvancementMode>('normal')`, returned by `useAdvancementMode()`. It follows the global-singleton style of `useNotifications`. This is the session-shared page mode.

### Step 4 — Reusable toggle component
- `src/components/AdvancementModeToggle.vue` (new): a two-state switch (`Normal` / `Belohnung`) with `v-model` (`modelValue: AdvancementMode`). Use a plain scoped style. Labels come from `UI`.

### Step 5 — UI strings (`src/constants/ui.ts`)
- Done (the `advMode*` strings in Step 4, `advCostRewardMarker` in Step 5).
- `advModeNormal: 'Normal'`, `advModeReward: 'Belohnung'`, `advModeLabel: 'Kostenart:'`, `advModeRewardHint: 'Belohnung: Ausbildung durch Lehrmeister – kein Gold, halbe EP für Steigern/Zauber'`, `advCostRewardMarker: '(Belohnung)'`.

### Step 6 — `AdvancementView.vue`
- **Header**: wrap the `ep-balance` paragraph in an `ep-balance-row` flex container (`justify-content: space-between`), with the toggle right-aligned (`v-model="pageMode"` from `useAdvancementMode`).
- **`knownSkillRows`**: pass `pageMode` to `advanceCost` for `cost` and `costWithoutPp` (both in the selected mode, so the PP strikethrough still shows only the PP saving). Use `fixedGoldCost = advancementService.advanceGoldCost(teCost − ppUsed, mode)`. In reward mode, `canAdvance` = `availableEp >= cost` only, because there is no gold path.
- **`learnableSkillRows` / `learnableWeaponRows`**: the cost is unchanged. `canAfford` stays EP-only. Optional: also check `gold >= learnGoldCost` in normal mode; this is a pre-existing gap, so ask before changing it.
- **Column headers**: when `pageMode === 'reward'`, append `UI.advCostRewardMarker` to `colNextCost` and `colCost`.
- **`PendingAction`**: add `mode: AdvancementMode`. Have `requestLearn` / `requestAdvance` take the mode (the default is `pageMode`). Pull the cost-building into `buildLearnAction(skill, mode)` / `buildAdvanceAction(skill, value, instanceId, mode)` so the modal toggle can rebuild the action.
- **Modal**: add the toggle at the top of the modal box (`:model-value="pendingAction.mode"` and `@update:model-value="switchPendingMode"`). `switchPendingMode` rebuilds the action with the new mode and keeps `selectedInstance`. In reward mode, hide the "EP-Ersatz" row and the `ep-breakdown` line. The PP note stays.
- **`confirmAction`**: pass `action.mode` to the service calls. Gold deduction = `action.goldCost + epToPayWithGold × 10`, where `epToPayWithGold` is 0 in reward mode.
- **Confirm button `:disabled`**: works without change because `maxGoldEp` is 0 and `goldCost` defaults to 0.

### Step 7 — `SpellsView.vue`
- Use the same header `ep-balance-row` and toggle.
- **`learnableSpellRows`**: use `advancementService.spellLearnCost(spell, type, groupPp, pageMode)`. In reward mode, `canAfford` = `availableEp >= cost`. In normal mode, keep the current EP/gold logic.
- **Column header marker**, as in Step 6.
- **`PendingSpellAction`**: add `mode`. Build it through `spellLearnCost`. Add the modal toggle and `switchPendingMode`. Hide the EP replacement in reward mode.
- **`confirmLearn`**: no service call, but it uses `action.epCost` / `action.goldCost`, which already reflect the mode. PP consumption is unchanged.

### Step 8 — Help / docs
- `src/help/` topic for advancement (if one exists): add a short paragraph about the Belohnung toggle.
- Add an entry to `CHANGELOG`.

## Affected functionality (summary)

| Area | Change |
|---|---|
| Known skills table: "Nächste Kosten" | halved in reward mode, PP first |
| Known skills: "Steigern" button enabled | EP-only check in reward mode |
| Learn skill/weapon tables | EP cost unchanged (the reward only drops the 200 GS/LE fee), header marker |
| Advance modal | toggle; gold fee 0; EP replacement hidden; cost recalculated |
| Learn skill modal | toggle; gold fee 0 (EP unchanged) |
| Spells learn table | halved EP in reward mode, PP first; affordability EP-only |
| Spell learn modal | toggle; gold fee 0; EP replacement hidden |
| Not affected | grad-based skills, non-advanceable skills, Add EP, GradUp popup, PP accrual |

## Open points (decide during implementation if they come up)
- Should learnable-skill `canAfford` also check gold in normal mode (pre-existing gap)?
- The reward is not logged on the character. If the GM later wants an audit trail ("learned via reward"), that is a separate feature.

## Verification
1. `npx vue-tsc -b` and `npm run build` must pass (strict and noUnused).
2. `npm run dev`, then open a character with rules imported:
   - Advancement: toggle to Belohnung. Check that "Nächste Kosten" halves (odd values round up), that a skill with PP shows the PP strikethrough on halved values, and that learn costs stay the same.
   - Open the advance modal: the toggle starts with the page mode. Switching it recalculates EP and the gold fee (20 GS/TE ↔ 0), and EP-Ersatz appears or disappears. Confirm, then check the EP/gold/PP deductions on the sheet.
   - Learn a skill in reward mode: EP deducted, 0 GS.
   - Spells: same checks with halved EP, 0 GS and group PP consumed.
   - Navigate Advancement ↔ Spells: the mode is kept. Reload: back to Normal.