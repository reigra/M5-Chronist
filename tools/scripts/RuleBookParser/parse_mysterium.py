"""
parse_mysterium.py
------------------
Parses skill tables from Das Mysterium PDF (pages 34-38) and generates:
  - mysterium/skills.json

All parsing logic lives in pdf_skills_common.py; this script only
supplies the per-book configuration.

Usage:
    python tools/scripts/RuleBookParser/parse_mysterium.py
    python tools/scripts/RuleBookParser/parse_mysterium.py --dry-run
    python tools/scripts/RuleBookParser/parse_mysterium.py --dry-run --stage 1
"""

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from pdf_skills_common import SkillParseConfig, run  # noqa: E402
from pdf_types_common import (  # noqa: E402
    SKILL_HEADER_MAP,
    SPELL_HEADER_MAP,
    THAUMATURGIE_HEADER_MAP,
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
    # Mysterium-specific headings
    "Zauberfähigkeiten":             "Zaubersprüche",
}

CONFIG = SkillParseConfig(
    pdf_path=str(SCRIPT_DIR / "../../books/Das Mysterium_1702.pdf"),
    out_skills=str(SCRIPT_DIR / "../../mysterium/skills.json"),
    start_page=34,   # book page number (1-based)
    end_page=38,
    group_map=GROUP_MAP,
    description="Parse Das Mysterium PDF skill tables into JSON.",
)

# Type cost tables:
#   S. 32  Tabelle 1 (groupCosts)
#   S. 33  Tabelle 2a (spellCosts, Standardgruppen), Tabelle 2b (thaumaturgische Gruppen)
TYPE_CONFIG = TypeParseConfig(
    pdf_path=str(SCRIPT_DIR / "../../books/Das Mysterium_1702.pdf"),
    out_types=str(SCRIPT_DIR / "../../mysterium/types.json"),
    tables=[
        TypeTableConfig(page=32, header_map=SKILL_HEADER_MAP, field="groupCosts"),
        TypeTableConfig(page=33, header_map=SPELL_HEADER_MAP, field="spellCosts"),
        TypeTableConfig(page=33, header_map=THAUMATURGIE_HEADER_MAP, field="spellCosts"),
    ],
    # Lerneinheiten bei Spielbeginn: S. 30, names + categories.
    identity_pages=[30],
    category_map={
        "Kämpfer":               "Kämpfer",
        "Zauberkundige Kämpfer": "KampfZauberer",
        "Zauberer":              "Zauberer",
    },
    description="Parse Das Mysterium PDF type cost tables into JSON.",
)

if __name__ == "__main__":
    run(CONFIG)
    run_types(TYPE_CONFIG)
