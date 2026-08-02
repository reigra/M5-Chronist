"""
parse_kodex.py
--------------
Parses skill tables from Der Kodex PDF (pages 158-162) and generates:
  - kodex/skills.json

All parsing logic lives in pdf_skills_common.py; this script only
supplies the per-book configuration.

Usage:
    python tools/scripts/RuleBookParser/parse_kodex.py
    python tools/scripts/RuleBookParser/parse_kodex.py --dry-run
    python tools/scripts/RuleBookParser/parse_kodex.py --dry-run --stage 1
"""

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from pdf_skills_common import SkillParseConfig, run  # noqa: E402
from pdf_types_common import (  # noqa: E402
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
    pdf_path=str(SCRIPT_DIR / "../../books/Der Kodex_1402.pdf"),
    out_skills=str(SCRIPT_DIR / "../../kodex/skills.json"),
    start_page=158,  # book page number (1-based)
    end_page=162,
    group_map=GROUP_MAP,
    description="Parse Kodex PDF skill tables into JSON.",
)

# Type cost tables: S. 157, Tabelle 8 (groupCosts) und Tabelle 9 (spellCosts)
TYPE_CONFIG = TypeParseConfig(
    pdf_path=str(SCRIPT_DIR / "../../books/Der Kodex_1402.pdf"),
    out_types=str(SCRIPT_DIR / "../../kodex/types.json"),
    tables=[
        TypeTableConfig(page=157, header_map=SKILL_HEADER_MAP, field="groupCosts"),
        TypeTableConfig(page=157, header_map=SPELL_HEADER_MAP, field="spellCosts"),
    ],
    # Lerneinheiten bei Spielbeginn: S. 38-39, names + categories.
    identity_pages=[38, 39],
    category_map={
        "Kämpfer":               "Kämpfer",
        "Zauberkundige Kämpfer": "KampfZauberer",
        "Zauberer":              "Zauberer",
    },
    description="Parse Kodex PDF type cost tables into JSON.",
)

if __name__ == "__main__":
    run(CONFIG)
    run_types(TYPE_CONFIG)
