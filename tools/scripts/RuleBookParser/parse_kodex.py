"""
parse_skills.py
---------------
Parses skill tables from Der Kodex PDF (pages 158-162) and generates:
  - kodex/skills.json

Implementation is split into 4 stages:
  Stage 1: PDF loading, line extraction, group header detection
  Stage 2: Lernen-block parsing (skill entries with difficulty/cost)
  Stage 3: Verbessern-table parsing, deduplication, special cases
  Stage 4: JSON output, CLI

Usage:
    python tools/parse_skills.py
    python tools/parse_skills.py --dry-run
    python tools/parse_skills.py --dry-run --stage 1
"""

import argparse
import json
import re
import sys
from pathlib import Path

# Force UTF-8 output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

try:
    import pdfplumber
except ImportError:
    print("ERROR: pdfplumber not installed. Run: pip install pdfplumber")
    sys.exit(1)

# ── Configuration ─────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
PDF_PATH         = str(SCRIPT_DIR / "../../books/Der Kodex_1402.pdf")
OUT_SKILLS       = str(SCRIPT_DIR / "../../kodex/skills.json")



START_PAGE = 158  # book page number (1-based)
END_PAGE   = 162

# Font size thresholds
SIZE_HEADING = 18.0   # group heading (Halbwelt, Kampf, …)
SIZE_BODY    = 10.0   # normal text

# ── Group name mapping: PDF full name → JSON abbreviation ─────────────────────

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

# ── Ligature normalization ────────────────────────────────────────────────────

_UNICODE_LIGATURES = str.maketrans({
    '\ufb00': 'ff',
    '\ufb01': 'fi',
    '\ufb02': 'fl',
    '\ufb03': 'ffi',
    '\ufb04': 'ffl',
    '\ufb05': 'st',
    '\ufb06': 'st',
})

_LIGATURE_SPLIT_RE = re.compile(r'(fi|fl|ff|ffi|ffl) (?=[a-z\u00e4\u00f6\u00fc\u00df])')


def fix_ligatures(text: str) -> str:
    text = text.translate(_UNICODE_LIGATURES)
    text = _LIGATURE_SPLIT_RE.sub(r'\1', text)
    return text


# ── PDF line extraction ───────────────────────────────────────────────────────

def extract_lines(page) -> list[dict]:
    """
    Extract lines from a pdfplumber page.
    Returns list of dicts with keys: text, x0, y, max_size.
    Lines are sorted by ascending y.
    """
    raw_words = page.extract_words(
        x_tolerance=3,
        y_tolerance=3,
        keep_blank_chars=False,
        use_text_flow=False,
        extra_attrs=["size"],
    )

    # Group words into lines by y-coordinate (tolerance 3pt)
    buckets: dict[float, list[dict]] = {}
    for w in raw_words:
        y_key = round(float(w["top"]), 0)
        buckets.setdefault(y_key, []).append(w)

    lines = []
    for y in sorted(buckets.keys()):
        words = sorted(buckets[y], key=lambda w: w["x0"])
        text = fix_ligatures(" ".join(w["text"] for w in words))
        max_size = max(float(w.get("size", 0)) for w in words)
        x0 = words[0]["x0"]
        lines.append({
            "text":     text,
            "x0":       x0,
            "y":        y,
            "max_size": max_size,
        })
    return lines


def is_heading(line: dict) -> bool:
    """True if this line is a group heading (~18pt font)."""
    return abs(line["max_size"] - SIZE_HEADING) < 1.5


def get_group_abbrev(text: str) -> str | None:
    """Return the JSON abbreviation for a heading text, or None if not a known group."""
    # Ignore pure page numbers ("158", "159", …)
    if text.strip().isdigit():
        return None
    # Normalize "Waff en" → "Waffen" before lookup
    normalized = re.sub(r'Waff\s+en', 'Waffen', text.strip())
    return GROUP_MAP.get(normalized)


def is_page_number(line: dict) -> bool:
    """True if this line is just a page number (pure digits at ~18pt)."""
    return line["text"].strip().isdigit()


# ── Difficulty mapping ────────────────────────────────────────────────────────

DIFFICULTY_MAP = {
    "leicht":       "leicht",
    "normal":       "normal",
    "schwer":       "schwer",
    "sehr schwer":  "sehr schwer",
}

# Regex: matches one skill token like "Balancieren+12 (Gw)" or "Lesen von Zauberschrift+8 (In)"
# Also handles skills without linkedProperty: "Spießwaffen+5" or "Schilde+1"
SKILL_TOKEN_RE = re.compile(
    r'([A-Za-zÄÖÜäöüßÉéèê][A-Za-zÄÖÜäöüßÉéèê\s]+?)\+(\d+)(?:\s*\((\w+)\))?'
)

# Regex: matches the leading "difficulty: N LE" part of a Lernen line
LERNEN_LINE_RE = re.compile(
    r'^(leicht|normal|schwer|sehr schwer):\s+(\d+)\s+LE\s+(.*)',
    re.IGNORECASE
)


def parse_skill_tokens(text: str) -> list[dict]:
    """
    Parse all skill tokens from a text fragment (may contain multiple skills).
    Returns list of {name, base_value, linked_property}.
    linked_property may be None for weapon skills that omit it.
    """
    skills = []
    for m in SKILL_TOKEN_RE.finditer(text):
        name = m.group(1).strip()
        # Skip tokens where the "name" is really a difficulty keyword residue
        if name.lower() in ("leicht", "normal", "schwer", "sehr"):
            continue
        skills.append({
            "name":            name,
            "base_value":      int(m.group(2)),
            "linked_property": m.group(3),  # None if absent
        })
    return skills


# Skills with maxValue = 8 (shields/parrying weapons)
MAX_VALUE_8 = {"Schilde", "Parierwaffen"}


# ── Stage 3 helpers ───────────────────────────────────────────────────────────

def parse_verbessern_row(text: str) -> tuple[str | None, list[int] | None]:
    """
    Parse a difficulty row from a Verbessern table.
    Returns (difficulty_key, advancementCosts) or (None, None).
    Dashes are filtered out; only positive integers are kept.
    """
    for prefix, diff_key in [
        ("s. schwer", "sehr schwer"),
        ("schwer",    "schwer"),
        ("normal",    "normal"),
        ("leicht",    "leicht"),
    ]:
        if text.lower().startswith(prefix):
            rest = text[len(prefix):].strip()
            costs = [int(x) for x in rest.split() if x.lstrip("-").isdigit() and not x.startswith("-")]
            return diff_key, costs
    return None, None


def parse_verbessern_tables(pdf) -> tuple[dict, list | None, list | None]:
    """
    Stage 3a: Parse all Verbessern (TE) tables from the target pages.

    Returns:
      adv_map:           {group_abbrev: {difficulty: [advancementCosts]}}
      spell_level_costs: list of 12 ints for Zaubersprüche, or None
      shield_parry_costs: list of 7 ints for Schilde/Parierwaffen, or None
    """
    adv_map: dict[str, dict[str, list[int]]] = {}
    spell_level_costs: list[int] | None = None
    shield_parry_costs: list[int] | None = None

    for book_page in range(START_PAGE, END_PAGE + 1):
        page = pdf.pages[book_page - 1]
        lines = extract_lines(page)

        current_group  = None
        in_verbessern  = False
        in_shield_tbl  = False   # second mini-table for Schilde/Parierwaffen

        for line in lines:
            text = line["text"].strip()

            # ── Group heading ──────────────────────────────────────────────
            if is_heading(line) and not is_page_number(line):
                abbrev = get_group_abbrev(text)
                if abbrev:
                    current_group = abbrev
                    in_verbessern = False
                    in_shield_tbl = False
                continue

            if current_group is None:
                continue

            # ── Zaubersprüche: capture "LE 1 1 2 3 …" row ─────────────────
            if current_group == "Zaubersprüche":
                if text.startswith("LE "):
                    nums = [int(x) for x in text.split()[1:] if x.isdigit()]
                    if len(nums) == 12:
                        spell_level_costs = nums
                continue

            # ── Verbessern trigger ─────────────────────────────────────────
            if text.startswith("Verbessern"):
                in_verbessern = True
                in_shield_tbl = False
                continue

            if not in_verbessern:
                continue

            # ── Header lines (+6/+9/+2 …) ──────────────────────────────────
            if text.startswith("+"):
                # "+2 …" is the header of the Schilde/Parierwaffen mini-table
                in_shield_tbl = text.startswith("+2 ") or text.startswith("+2\t")
                continue

            # ── Schilde und Parierwaffen row ───────────────────────────────
            if text.startswith("Schilde und Parierwaffen"):
                costs = [int(x) for x in text.split() if x.isdigit()]
                shield_parry_costs = costs
                continue

            # ── Regular difficulty row ─────────────────────────────────────
            if not in_shield_tbl:
                diff_key, costs = parse_verbessern_row(text)
                if diff_key is not None:
                    adv_map.setdefault(current_group, {})[diff_key] = costs

    return adv_map, spell_level_costs, shield_parry_costs


# ── Stage 3b: Deduplicate instances into final skill list ─────────────────────

def build_skill_list(
    instances: list[dict],
    adv_map: dict,
    spell_level_costs: list | None,
    shield_parry_costs: list | None,
) -> list[dict]:
    """
    Merges raw skill instances (from Stage 2) with advancement costs (from Stage 3a).
    Deduplicates skills that appear in multiple groups.
    Returns an ordered list of skill dicts (order = first appearance in PDF).
    """
    skills: dict[str, dict] = {}
    skill_order: list[str] = []

    for inst in instances:
        name       = inst["name"]
        group      = inst["group"]
        diff       = inst["difficulty"]
        learn_cost = inst["learn_cost"]
        base_val   = inst["base_value"]

        # linkedProperty: from PDF token only; None if not in PDF (e.g. weapon skills)
        linked_prop = inst["linked_property"]

        # advancementCosts and maxValue
        if name in MAX_VALUE_8:
            costs   = shield_parry_costs or []
            max_val = 8
        else:
            costs   = adv_map.get(group, {}).get(diff, [])
            max_val = 18

        if name not in skills:
            skill_order.append(name)
            skills[name] = {
                "id":               name,
                "name":             name,
                "groups":           [group],
                "difficulty":       {group: diff},
                "learnCost":        learn_cost,
                "advancementCosts": costs,
                "baseValue":        base_val,
                "maxValue":         max_val,
                "linkedProperty":   linked_prop,
                "notes":            "",
            }
        else:
            sk = skills[name]
            if group not in sk["groups"]:
                sk["groups"].append(group)
            sk["difficulty"][group] = diff

    # Append the special Zaubersprüche entry at the end
    if spell_level_costs:
        skill_order.append("Zaubersprüche")
        skills["Zaubersprüche"] = {
            "id":              "Zaubersprüche",
            "name":            "Zaubersprüche",
            "groups":          [],
            "difficulty":      {},
            "learnCost":       None,
            "spellLevelCosts": spell_level_costs,
            "baseValue":       None,
            "maxValue":        None,
            "linkedProperty":  None,
            "notes":           (
                "Special entry for spells and songs. Not a regular skill. "
                "spellLevelCosts[i] = LE to learn a spell of level i+1 "
                "(index 0 = Stufe 1, index 11 = Stufe 12). "
                "EP cost = spellLevelCosts[stufe-1] × type.spellCosts[chosenSpellGroup]."
            ),
        }

    return [skills[n] for n in skill_order]


# ── Stage 1: Detect group headings ───────────────────────────────────────────

def stage1_detect_groups(pdf) -> list[dict]:
    """
    Stage 1: Extract all lines from target pages and identify group headings.
    Returns list of detected groups: {page, group_full, group_abbrev}.
    """
    detected = []

    for book_page in range(START_PAGE, END_PAGE + 1):
        pdf_index = book_page - 1
        page = pdf.pages[pdf_index]
        lines = extract_lines(page)

        for line in lines:
            if is_heading(line) and not is_page_number(line):
                abbrev = get_group_abbrev(line["text"])
                detected.append({
                    "page":        book_page,
                    "group_full":  line["text"],
                    "group_abbrev": abbrev,
                })

    return detected


# ── Stage 2: Parse Lernen blocks ─────────────────────────────────────────────

def stage2_parse_lernen(pdf) -> list[dict]:
    """
    Stage 2: For each group on each page, parse the Lernen block.
    Returns a flat list of raw skill instances:
      {name, base_value, linked_property, learn_cost, difficulty, group}
    Skills appearing in multiple groups will have multiple entries here.
    Deduplication happens in Stage 3.
    """
    instances = []

    for book_page in range(START_PAGE, END_PAGE + 1):
        pdf_index = book_page - 1
        page = pdf.pages[pdf_index]
        lines = extract_lines(page)

        current_group = None   # current group abbreviation
        in_lernen     = False  # inside a Lernen block
        pending_diff  = None   # difficulty of last parsed line (for continuation lines)
        pending_cost  = None   # learn cost of last parsed line

        for line in lines:
            text = line["text"].strip()

            # ── Group heading ──────────────────────────────────────────────
            if is_heading(line) and not is_page_number(line):
                abbrev = get_group_abbrev(text)
                if abbrev:
                    current_group = abbrev
                    in_lernen     = False
                    pending_diff  = None
                continue

            # ── Skip if no group active yet ────────────────────────────────
            if current_group is None:
                continue

            # ── "Zaubersprüche" group: skip Lernen block entirely ──────────
            if current_group == "Zaubersprüche":
                continue

            # ── Lernen: trigger ────────────────────────────────────────────
            if text.startswith("Lernen:"):
                in_lernen = True
                pending_diff = None
                continue

            # ── Verbessern trigger: end of Lernen block ────────────────────
            if text.startswith("Verbessern"):
                in_lernen = False
                pending_diff = None
                continue

            if not in_lernen:
                continue

            # ── Try to parse a difficulty line ─────────────────────────────
            m = LERNEN_LINE_RE.match(text)
            if m:
                diff_raw   = m.group(1).lower()
                difficulty = DIFFICULTY_MAP.get(diff_raw, diff_raw)
                learn_cost = int(m.group(2))
                rest       = m.group(3)
                pending_diff = difficulty
                pending_cost = learn_cost

                for skill in parse_skill_tokens(rest):
                    instances.append({**skill,
                                      "learn_cost": learn_cost,
                                      "difficulty": difficulty,
                                      "group":      current_group})
                continue

            # ── Continuation line (indented, x0 > 150) ────────────────────
            if pending_diff is not None and line["x0"] > 150:
                for skill in parse_skill_tokens(text):
                    instances.append({**skill,
                                      "learn_cost": pending_cost,
                                      "difficulty": pending_diff,
                                      "group":      current_group})

    return instances


# ── JSON formatting ─────────────────────────────────────────────────────────

def _compact_primitives(json_str):
    """Collapse JSON arrays/objects of primitives onto a single line each."""
    _prim = r'(?:"(?:[^"\\]|\\.)*"|[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|null|true|false)'

    # Collapse arrays of primitives: [ val, val, ... ]
    array_pat = re.compile(
        r'\[\s*(' + _prim + r'(?:\s*,\s*' + _prim + r')*)\s*\]',
        re.DOTALL,
    )
    def _arr(m):
        inner = re.sub(r'\s+', ' ', m.group(1)).strip()
        return '[ ' + inner + ' ]'
    json_str = array_pat.sub(_arr, json_str)
    json_str = re.sub(r'\[\s*\]', '[]', json_str)

    # Collapse objects with only primitive values: { "key": val, ... }
    _kv = r'"(?:[^"\\]|\\.)*"\s*:\s*' + _prim
    obj_pat = re.compile(
        r'\{\s*(' + _kv + r'(?:\s*,\s*' + _kv + r')*)\s*\}',
        re.DOTALL,
    )
    def _obj(m):
        inner = re.sub(r'\s+', ' ', m.group(1)).strip()
        return '{ ' + inner + ' }'
    json_str = obj_pat.sub(_obj, json_str)
    json_str = re.sub(r'\{\s*\}', '{}', json_str)

    return json_str


# ── Main / CLI ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Parse Kodex PDF skill tables into JSON."
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse only, print results, do not write files.")
    parser.add_argument("--stage", type=int, default=4,
                        help="Run up to this stage (1=groups, 2=lernen, 3=verbessern, 4=output). Default: 4")
    args = parser.parse_args()

    print(f"Opening: {PDF_PATH}")
    with pdfplumber.open(PDF_PATH) as pdf:
        print(f"PDF has {len(pdf.pages)} pages.")

        # ── Stage 1 ───────────────────────────────────────────────────────────
        groups = stage1_detect_groups(pdf)
        print(f"\n=== Stage 1: Group headings detected ({len(groups)}) ===")
        for g in groups:
            abbrev_display = g["group_abbrev"] or "UNKNOWN"
            print(f"  Page {g['page']:3d}  |  {g['group_full']!r:40s}  →  {abbrev_display}")

        unknown = [g for g in groups if g["group_abbrev"] is None]
        if unknown:
            print(f"\nWARNING: {len(unknown)} unrecognized heading(s)!")

        if args.stage == 1:
            return

        # ── Stage 2 ───────────────────────────────────────────────────────────
        instances = stage2_parse_lernen(pdf)
        print(f"\n=== Stage 2: Raw skill instances from Lernen blocks ({len(instances)}) ===")
        for inst in instances:
            prop = f" ({inst['linked_property']})" if inst['linked_property'] else ""
            print(f"  [{inst['group']:8s}] {inst['difficulty']:12s}  {inst['learn_cost']} LE  "
                  f"{inst['name']}+{inst['base_value']}{prop}")

        if args.stage == 2:
            return

        # ── Stage 3 ───────────────────────────────────────────────────────────
        adv_map, spell_level_costs, shield_parry_costs = parse_verbessern_tables(pdf)

        print(f"\n=== Stage 3a: Verbessern tables per group ===")
        for grp, diffs in adv_map.items():
            for diff, costs in diffs.items():
                print(f"  [{grp:8s}] {diff:12s}  {costs}")
        if spell_level_costs:
            print(f"  [Zaubersprüche] spellLevelCosts: {spell_level_costs}")
        if shield_parry_costs:
            print(f"  [Schilde/Parierwaffen] advancementCosts: {shield_parry_costs}")

        skill_list = build_skill_list(instances, adv_map, spell_level_costs, shield_parry_costs)

        print(f"\n=== Stage 3b: Deduplicated skills ({len(skill_list)}) ===")
        for sk in skill_list:
            if "spellLevelCosts" in sk:
                print(f"  {sk['name']:35s}  spellLevelCosts={sk['spellLevelCosts']}")
            else:
                groups_str = ", ".join(sk["groups"])
                print(f"  {sk['name']:35s}  groups=[{groups_str}]  "
                      f"baseValue={sk['baseValue']}  "
                      f"advancementCosts({len(sk['advancementCosts'])})={sk['advancementCosts']}")

        if args.stage == 3:
            return

        # ── Stage 4 ───────────────────────────────────────────────────────────
        out_path = Path(OUT_SKILLS)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        output = {"skills": skill_list}

        if args.dry_run:
            print(f"\n=== Stage 4: DRY RUN — first 5 skills as JSON ===")
            for sk in skill_list[:5]:
                print(_compact_primitives(json.dumps(sk, ensure_ascii=False, indent=2)))
            print(f"\n[dry-run] Would write {len(skill_list)} skills to {OUT_SKILLS}")
            return

        out_path.write_text(
            _compact_primitives(json.dumps(output, ensure_ascii=False, indent=2)),
            encoding="utf-8",
        )
        print(f"\nWritten: {OUT_SKILLS}  ({len(skill_list)} skills)")


if __name__ == "__main__":
    main()
