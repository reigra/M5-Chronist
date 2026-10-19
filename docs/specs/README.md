# Behavior Specs

Archived behavior specifications from the former OpenSpec setup. They preserve the domain rules behind character validation, bonus calculation, grad advancement, and rulebook data.

The implementation is authoritative. These documents describe intended behavior as of their archive date; update them only when behavior changes deliberately.

| Spec | Scope | Primary code |
|------|-------|--------------|
| [bonus-calculation.md](bonus-calculation.md) | Race/type property bonuses, `add`/`set` semantics, evaluation order | `src/services/CharacterValidator.ts`, `src/types/Race.ts`, `src/types/CharacterType.ts` |
| [character-validation.md](character-validation.md) | Validation categories A–I, `autoFix`, `FormulaEngine`, load orchestration | `src/services/CharacterValidator.ts`, `src/services/FormulaEngine.ts`, `src/services/CharacterLoadService.ts` |
| [grad-up.md](grad-up.md) | Grad advancement popup, W% property increase, AP gain, FW updates | `src/services/GradUpService.ts`, `src/components/GradUpPopup.vue`, `src/views/AdvancementView.vue` |
| [mogadil-type-categories.md](mogadil-type-categories.md) | Category and ResBk/ResBg derivation from Mogadil PDF data | `tools/scripts/parse_Mogadil.py` |
| [rulebook-universal-rules.md](rulebook-universal-rules.md) | `universalRules` schema (`formulas`, `innateSkills`), `race.skillBonuses`, merge behavior | `src/services/RulesStorage.ts`, `src/services/CharacterValidator.ts`, `src/types/Rules.ts` |
