"""
parse_armorum.py
----------------
Parses skill tables from Ars Armorum PDF (pages 45-50) and generates:
  - armorum/skills.json

All parsing logic lives in pdf_skills_common.py; this script only
supplies the per-book configuration.

Usage:
    python tools/scripts/RuleBookParser/parse_armorum.py
    python tools/scripts/RuleBookParser/parse_armorum.py --dry-run
    python tools/scripts/RuleBookParser/parse_armorum.py --dry-run --stage 1
"""

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from pdf_skills_common import SkillParseConfig, run  # noqa: E402
from pdf_types_common import (  # noqa: E402
    FIGHT_HEADER_MAP,
    LED_HEADER_MAP,
    SKILL_HEADER_MAP,
    SPELL_HEADER_MAP,
    TypeParseConfig,
    TypeTableConfig,
    run_types,
)

# ── Configuration ─────────────────────────────────────────────────────────────

# Group name mapping: PDF full name → JSON abbreviation
GROUP_MAP = {
    "Alltag":                        "Alltag",
    "Freiland":                      "Freiland",
    "Halbwelt":                      "Halbwelt",
    "Kampf":                         "Kampf",
    "Körperbeherrschung":            "Körper",
    "Sozial":                        "Sozial",
    "Unterwelt":                     "Unterwelt",
    "Waffen":                        "Waffen",
    "Wissen":                        "Wissen",
    "Zaubersprüche und Zauberlieder": "Zaubersprüche",
    # Waff en (with ligature split in some PDF extractions)
    "Waff en":                       "Waffen",
}

CONFIG = SkillParseConfig(
    pdf_path=str(SCRIPT_DIR / "../../books/Ars Armorum.pdf"),
    out_skills=str(SCRIPT_DIR / "../../armorum/skills.json"),
    start_page=45,   # book page number (1-based)
    end_page=50,
    group_map=GROUP_MAP,
    description="Parse Ars Armorum PDF skill tables into JSON.",
)

# Type cost tables:
#   S. 43  Tabelle 1 (groupCosts), Tabelle 2a (spellCosts, Standardgruppen)
#   S. 44  Tabelle 2b (spellCosts, Kampfverse/Zauberverse), Tabelle 3 (fightCosts, 2-Block)
TYPE_CONFIG = TypeParseConfig(
    pdf_path=str(SCRIPT_DIR / "../../books/Ars Armorum.pdf"),
    out_types=str(SCRIPT_DIR / "../../armorum/types.json"),
    tables=[
        TypeTableConfig(page=43, header_map=SKILL_HEADER_MAP, field="groupCosts"),
        TypeTableConfig(page=43, header_map=SPELL_HEADER_MAP, field="spellCosts"),
        TypeTableConfig(page=44, header_map=LED_HEADER_MAP, field="spellCosts"),
        TypeTableConfig(page=44, header_map=FIGHT_HEADER_MAP, field="fightCosts"),
    ],
    # Lerneinheiten bei Spielbeginn: S. 42, names only (no category headers).
    # Ars Armorum is the combat book: identity-page types are Kämpfer, but
    # types that also learn spells (spellCosts present) are Kampfzauberer.
    # No category overrides needed — the spell rule covers Fi and Sk.
    identity_pages=[42],
    default_category="Kämpfer",
    spell_category="KampfZauberer",
    description="Parse Ars Armorum PDF type cost tables into JSON.",
)

if __name__ == "__main__":
    run(CONFIG)
    run_types(TYPE_CONFIG)
