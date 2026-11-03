"""
parse_armorum.py
----------------
Parses skill tables from Ars Armorum PDF (pages 45-50) and generates:
  - armorum/skills.json
  - armorum/types.json
  - armorum/techniques.json, technique-descriptions.json, technique-rules.json
  - armorum/spells.json, spell-descriptions.json (Kampfverse)
  - armorum/meta.json
  - rules/armorum.json (combined)

All parsing logic lives in pdf_skills_common.py; this script only
supplies the per-book configuration.

Usage:
    python tools/scripts/RuleBookParser/parse_armorum.py
    python tools/scripts/RuleBookParser/parse_armorum.py --dry-run
    python tools/scripts/RuleBookParser/parse_armorum.py --dry-run --stage 1
"""

import json
import sys
from pathlib import Path

import pdfplumber

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
from armorum_index import parse_index  # noqa: E402
from armorum_techniques import complete_from_index, parse_technique_entries  # noqa: E402
from armorum_verses import cross_check_verses, parse_verses, to_spell_entries  # noqa: E402
from pdf_imprint import extract_imprint_version  # noqa: E402
from rulebook_combiner import combine as combine_rulebook  # noqa: E402

ARMORUM_DIR = SCRIPT_DIR / "../../armorum"
RULES_DIR = SCRIPT_DIR / "../../rules"

# Lernregeln für Techniken aus dem Fließtext (S. 8, 12, 15, 17, 21, 44, 54, 90).
# Werden als Regeldaten exportiert — die App enthält keine Spielregeln.
TECHNIQUE_RULES = {
    "goldPerLe": 100,                                   # S. 44
    "restrictionNames": {                               # S. 54, 90
        "G": "Größe",
        "H": "humanoider Körperbau",
        "B": "hochbeiniger Körperbau",
        "I": "menschliche Intelligenz",
    },
    "disciplines": [
        {"id": "Kampfkunst",  "skillId": "Kampfkunst",  "minValue": 0},    # S. 8
        {"id": "Fechtkunst",  "skillId": "Fechten",     "minValue": 12},   # S. 15, ohne Gs-Bonus
        {"id": "Schießkunst", "skillId": "Schießkunst", "minValue": 0},    # S. 12
        {"id": "KiDo",        "skillId": "KiDo",        "minValue": 0,     # S. 17, 21
         "ranks": [
             {"id": "S", "name": "Schüler"},
             {"id": "E", "name": "Eingeweihter", "minSkillValue": 14, "includeBonus": True,
              "requiredTechniques": {"rank": "S", "count": 6}},
             {"id": "M", "name": "Meister", "minSkillValue": 18, "includeBonus": True,
              "requiredTechniques": {"rank": "E", "count": 4}},
         ]},
    ],
}

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
    # S. 47 druckt "Kido"; kanonisch (S. 17, Mogadil) ist "KiDo"
    name_fixes={"Kido": "KiDo"},
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
    # Tabelle 3, Zeile ZAU: gilt für alle Zauberer (RulesStorage wendet Meta-Typen per Kategorie an)
    meta_types={"ZAU": {"isMeta": True, "category": "Zauberer"}},
)

def _write_json(path: Path, data: dict) -> None:
    """Write one section file (UTF-8, indented)."""
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Written: {path}")


def run_entries(dry_run: bool) -> None:
    """
    Parse techniques and Kampfverse, write section files and meta.json,
    then combine tools/armorum/ into tools/rules/armorum.json.
    """
    print(f"\nOpening: {CONFIG.pdf_path}")
    with pdfplumber.open(CONFIG.pdf_path) as pdf:
        index = parse_index(pdf)
        techniques, tech_desc = parse_technique_entries(pdf)
        ok = complete_from_index(techniques, tech_desc, index)
        spells, spell_desc = to_spell_entries(parse_verses(pdf))
        cross_check_verses(spells, index)
        version = extract_imprint_version(pdf)

    if not ok:
        print("WARNING: unexpected technique deviations — check the report above.")
    if dry_run:
        print(f"[dry-run] Would write {len(techniques)} techniques, {len(spells)} Kampfverse")
        return

    ARMORUM_DIR.mkdir(parents=True, exist_ok=True)
    _write_json(ARMORUM_DIR / "techniques.json", {"techniques": techniques})
    _write_json(ARMORUM_DIR / "technique-descriptions.json", {"techniqueDescriptions": tech_desc})
    _write_json(ARMORUM_DIR / "spells.json", {"spells": spells})
    _write_json(ARMORUM_DIR / "spell-descriptions.json", {"spellDescriptions": spell_desc})
    _write_json(ARMORUM_DIR / "technique-rules.json", {"techniqueRules": TECHNIQUE_RULES})
    _write_json(ARMORUM_DIR / "meta.json", {
        "id": "armorum", "title": "Ars Armorum", "version": version,
        "priority": 1, "notes": "",
    })
    RULES_DIR.mkdir(parents=True, exist_ok=True)
    combine_rulebook(str(ARMORUM_DIR), str(RULES_DIR / "armorum.json"))


if __name__ == "__main__":
    run(CONFIG)
    run_types(TYPE_CONFIG)
    run_entries(dry_run="--dry-run" in sys.argv)
