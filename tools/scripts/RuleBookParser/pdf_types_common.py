"""
pdf_types_common.py
-------------------
Shared library for parsing character type cost tables from the three
rulebooks (Ars Armorum, Der Kodex, Das Mysterium).

Each parser supplies its per-book configuration via a `TypeParseConfig`
dataclass (which tables to read, which cost field they populate) and then
delegates to `run()`. The output is a `types.json` section file with the
top-level key `"types"`, following the same pattern as `skills.json`.

Cost tables are matrices: one header row of group names followed by rows
of `TypeID n n n ...` values. Values are EP costs per TE/LE; "-" means the
type cannot learn that group and is omitted from the cost map.

Handled special cases:
  - Footnote markers in type IDs (e.g. "Ma*" → "Ma")
  - Two-column-block tables (Ars Armorum Tabelle 3): one physical line
    contains two independent type rows (id + values + id + values)
  - Multi-ID rows (Mysterium Tabelle 2b): "Er, Dr, Ma, PB, PS 120 ..."
    assigns the same costs to several types

Usage (via the individual parser scripts):
    python parse_<book>.py
    python parse_<book>.py --dry-run
"""

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Force UTF-8 output (same as pdf_skills_common)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

try:
    import pdfplumber
except ImportError:
    print("ERROR: pdfplumber not installed. Run: pip install pdfplumber")
    sys.exit(1)

from pdf_skills_common import extract_lines, fix_ligatures, _compact_primitives

# ── Configuration ─────────────────────────────────────────────────────────────

@dataclass
class TypeTableConfig:
    """
    One cost table inside a book's PDF.

    Attributes:
        page:       book page number (1-based)
        header_map: PDF column header abbreviation → canonical group key
        field:      target JSON field ("groupCosts", "spellCosts", "fightCosts")
    """
    page: int
    header_map: dict
    field: str


@dataclass
class TypeParseConfig:
    """
    Per-book configuration for the type-table parser.

    Attributes:
        pdf_path:  path to the rulebook PDF
        out_types: output path for types.json
        tables:    list of cost tables to parse
        identity_pages: book pages (1-based) containing the two-column
            "Lerneinheiten bei Spielbeginn" type tables used to derive
            each type's display `name` and, optionally, its `category`.
        category_map: PDF section/table header → canonical category
            (e.g. {"Zauberkundige Kämpfer": "Kampfzauberer"}). Only used
            when identity_pages is non-empty.
        default_category: category applied to a type detected on an
            identity page when no section header provides one. Optional —
            if left None no category is written for such types.
        spell_category: book-specific rule: for a book whose identity page
            only contains "Kampfzauberer"-type entries (e.g. Ars Armorum),
            this value is used for identity-page types that also have
            spellCosts. Combined with default_category="Kämpfer" this
            yields "Kampfzauberer" for magic-users and "Kämpfer" for the
            rest. Leave unset for books where spellCosts does not imply
            the Kampfzauberer category (Kodex/Mysterium contain pure
            Zauberer with spellCosts).
        category_overrides: type-id → category, highest priority. Applied
            last, so it wins over column headers and default/spell rules.
        description: argparse description for this book
    """
    pdf_path: str
    out_types: str
    tables: list = field(default_factory=list)
    identity_pages: list = field(default_factory=list)
    category_map: dict = field(default_factory=dict)
    default_category: str | None = None
    spell_category: str | None = None
    category_overrides: dict = field(default_factory=dict)
    description: str = ""


# Nominal split between the two body columns (document units).
_COLUMN_SPLIT = 190.0
# Font size of a category section header (e.g. "Zauberkundige Kämpfer").
_CATEGORY_SIZE = 12.0
_CATEGORY_SIZE_TOL = 1.0


# ── Column header maps ────────────────────────────────────────────────────────

# Skill group columns. Keys are the (ligature-fixed) PDF abbreviations;
# values are the canonical group names used in skills.json / groupCosts.
SKILL_HEADER_MAP = {
    "Alltag":  "Alltag",
    "Freil":   "Freiland",
    "Halbw":   "Halbwelt",
    "Kampf":   "Kampf",
    "Körper":  "Körper",
    "Sozial":  "Sozial",
    "Unterw":  "Unterwelt",
    "Waffen":  "Waffen",
    "Wissen":  "Wissen",
}

# Standard spell group columns (Arkanum).
SPELL_HEADER_MAP = {
    "Beherr":   "Beherrschen",
    "Beweg":    "Bewegen",
    "Erkenn":   "Erkennen",
    "Erschaff": "Erschaffen",
    "Formen":   "Formen",
    "Veränd":   "Verändern",
    "Zerstören": "Zerstören",
    "Wunder":   "Wundertaten",
    "Dweom":    "Dweomer",
    "Lied":     "Zauberlieder",
}

# Fight technique columns (Ars Armorum Tabelle 3).
FIGHT_HEADER_MAP = {
    "Kampfk":  "Kampfkunst",
    "Fechtk":  "Fechtkunst",
    "Schießk": "Schießkunst",
    "KiDo":    "KiDo",
}

# Custom identity maps — the PDF headers are already the canonical keys.
LED_HEADER_MAP = {
    "Kampfverse":   "Kampfverse",
    "Zauberlieder": "Zauberlieder",
    "Zauberverse":  "Zauberverse",
}

THAUMATURGIE_HEADER_MAP = {
    "Zaubersalze":    "Zaubersalze",
    "Runenstäbe":     "Runenstäbe",
    "Zaubersiegel":   "Zaubersiegel",
    "Zauberrunen":    "Zauberrunen",
    "Thaumatherapie": "Thaumatherapie",
}


# ── Token/row helpers ─────────────────────────────────────────────────────────

def _normalize_header_token(token: str) -> str:
    """Strip a trailing period so "Erschaff." and "Erschaff" both resolve."""
    return token.rstrip(".").strip()


def _normalize_type_id(raw: str) -> str:
    """Strip footnote markers and punctuation from a type ID (e.g. "Ma*" → "Ma")."""
    return raw.strip().rstrip("*†‡")


def _is_value(token: str) -> bool:
    """True if the token is an EP cost (integer) or a dash."""
    return token.isdigit() or token == "-"


def _costs_from_values(cols: list[str], values: list[str]) -> dict:
    """
    Zip column keys with row values, omitting "-" (type cannot learn the group).
    """
    costs: dict = {}
    for col, val in zip(cols, values):
        if val.isdigit():
            costs[col] = int(val)
    return costs


def parse_type_row(
    tokens: list[str],
    cols: list[str],
    blocks: int,
) -> list[tuple[str, dict]] | None:
    """
    Parse one data row of a cost matrix.

    Parameters:
        tokens: words of the line
        cols:   canonical column keys for one block
        blocks: number of independent row blocks on one line (1 or 2)

    Returns:
        List of (type_id, costs) tuples, or None if the line is not a type row.
    """
    if not tokens:
        return None

    # Footnote / legend lines (e.g. "Geldkosten: 100 GS je LE") are not rows.
    if ":" in tokens[0]:
        return None

    # ── Multi-ID row: "Er, Dr, Ma, PB, PS 120 - - - -" ──────────────────────
    if tokens[0].endswith(","):
        ids: list[str] = []
        i = 0
        while i < len(tokens) and tokens[i].endswith(","):
            ids.append(tokens[i][:-1].strip())
            i += 1
        if i >= len(tokens):
            return None
        ids.append(_normalize_type_id(tokens[i]))
        values = tokens[i + 1:]
        if len(values) != len(cols):
            return None
        costs = _costs_from_values(cols, values)
        if not costs:
            return None
        return [(tid, dict(costs)) for tid in ids]

    # ── Single-type row: "As 60 60 30 60" ────────────────────────────────────
    type_id = _normalize_type_id(tokens[0])
    if len(tokens) == len(cols) + 1:
        values = tokens[1:]
        costs = _costs_from_values(cols, values)
        if not costs:
            return None
        return [(type_id, costs)]

    # ── Two-block row: "As 60 60 30 60 Mg 90 60 90 90" ──────────────────────
    # Layout per block: one type ID followed by len(cols) values.
    if blocks > 1 and len(tokens) == blocks * (len(cols) + 1):
        step = len(cols) + 1
        entries: list[tuple[str, dict]] = []
        for b in range(blocks):
            bid = _normalize_type_id(tokens[b * step])
            bvals = tokens[b * step + 1:(b + 1) * step]
            costs = _costs_from_values(cols, bvals)
            if costs:
                entries.append((bid, costs))
        return entries or None

    return None


# ── Table parsing ─────────────────────────────────────────────────────────────

def _find_header(lines: list[dict], header_map: dict) -> tuple[int, list[str], int] | None:
    """
    Find the header line for a table and derive its canonical columns.

    Parameters:
        lines:      extracted lines of the page
        header_map: PDF abbreviation → canonical group key

    Returns:
        (line_index, canonical_cols, blocks) or None if no header found.
    """
    for idx, line in enumerate(lines):
        mapped: list[str] = []
        for token in line["text"].split():
            norm = _normalize_header_token(token)
            if not norm:
                continue
            col = header_map.get(norm)
            if col is None:
                break
            mapped.append(col)
        else:
            # All non-empty tokens matched
            if len(mapped) < 3:
                continue
            distinct = list(dict.fromkeys(mapped))
            blocks = (len(mapped) // len(distinct)) if len(mapped) % len(distinct) == 0 else 1
            return idx, distinct, blocks
    return None


def parse_table(
    pdf,
    table: TypeTableConfig,
) -> list[tuple[str, dict]]:
    """
    Parse one cost table from its page.

    Parameters:
        pdf:   open pdfplumber PDF object
        table: table descriptor

    Returns:
        List of (type_id, costs) tuples.
    """
    page = pdf.pages[table.page - 1]
    lines = extract_lines(page)

    found = _find_header(lines, table.header_map)
    if found is None:
        print(f"  WARNING: No header found for {table.field} on page {table.page}")
        return []

    header_index, cols, blocks = found
    entries: list[tuple[str, dict]] = []

    for line in lines[header_index + 1:]:
        row = parse_type_row(line["text"].split(), cols, blocks)
        if row is None:
            # First non-row line ends the table (e.g. "Geldkosten: ...")
            if entries:
                break
            continue
        entries.extend(row)

    return entries


# ── Type identities (name / category) ─────────────────────────────────────────

def _column_lines_from_page(page) -> list[dict]:
    """
    Extract lines of a two-column "Lerneinheiten bei Spielbeginn" page,
    grouped by body column.

    Rounds based on x0 (left column < _COLUMN_SPLIT, right column >= it).
    Returns a list of dicts: {col, y, size, text}, ordered by y then x0
    within each column.
    """
    words = page.extract_words(
        x_tolerance=3,
        y_tolerance=3,
        keep_blank_chars=False,
        use_text_flow=False,
        extra_attrs=["size"],
    )

    columns: dict[int, dict[float, list[dict]]] = {0: {}, 1: {}}
    for w in words:
        col   = 0 if float(w["x0"]) < _COLUMN_SPLIT else 1
        y_key = round(float(w["top"]), 0)
        columns[col].setdefault(y_key, []).append(w)

    lines = []
    for col in (0, 1):
        for y in sorted(columns[col].keys()):
            ws = sorted(columns[col][y], key=lambda w: w["x0"])
            text    = fix_ligatures(" ".join(w["text"] for w in ws))
            maxsize = max(float(w.get("size", 0)) for w in ws)
            x0      = ws[0]["x0"]
            lines.append({
                "col":      col,
                "y":        y,
                "x0":       x0,
                "size":     maxsize,
                "text":     text,
            })
    return lines


def _clean_type_name(raw: str) -> str:
    """
    Sanitize a scraped type name.

    When a type header column is interleaved with the neighboring column,
    the extracted line can carry trailing words of the previous block (e.g.
    "(In) und Uberle- Ordenskrieger (Or)"). This strips any leading words
    that wrap from the preceding entry, leaving only the actual name.

    Parameters:
        raw: scraped name (the part before "(ID)")

    Returns:
        The cleaned display name.
    """
    name = raw.strip()

    # Drop a leading parenthesised fragment, e.g. "(In) und ...".
    if name.startswith("("):
        name = re.sub(r'^\([^)]*\)\s*', '', name).strip()

    # A hyphen-ended word marks the end of a wrapped fragment from the
    # neighbouring column; keep only what follows it, e.g.
    # "und Überle- Ordenskrieger" -> "Ordenskrieger".
    parts = name.split()
    for i, tok in enumerate(parts):
        if tok.endswith("-"):
            name = " ".join(parts[i + 1:])
            break

    return name


def parse_type_identities(pdf, config, known_ids: set[str]) -> dict[str, dict]:
    """
    Parse the two-column "Lerneinheiten bei Spielbeginn" sections and derive
    each type's display name and, where available, its category.

    Type header lines of the form "Name (ID)" are recognized when the
    parenthesised token is one of `known_ids`. Section headers (e.g.
    "Kampfer", "Zauberkundige Kampfer") update the active category for the
    current column. A column without its own header inherits the category of
    its sibling column.

    Parameters:
        pdf:       open pdfplumber PDF
        config:    per-book TypeParseConfig (requires identity_pages)
        known_ids: set of already-parsed type IDs

    Returns:
        {type_id: {"name": str, "category": str?}}
    """
    found: dict[str, dict] = {}
    col_cat: dict[int, str | None] = {0: None, 1: None}
    global_cat: str | None = None

    for book_page in config.identity_pages:
        page = pdf.pages[book_page - 1]
        lines = _column_lines_from_page(page)
        # Reading order: read each body column fully top-to-bottom,
        # left column before right column. Category headers then cover
        # all subsequent types (in column order).
        lines.sort(key=lambda ln: (ln["col"], ln["y"]))

        # A section started on an earlier page can continue as a single
        # column on the next page (e.g. Kodex S. 39 left column still holds
        # the Priester types of the "Zauberer" group). Inherit the last seen
        # category for every column at each page start.
        col_cat = {0: global_cat, 1: global_cat}

        for ln in lines:
            col  = ln["col"]
            text = ln["text"].strip()

            # ── Category header line ────────────────────────────────────
            if abs(ln["size"] - _CATEGORY_SIZE) <= _CATEGORY_SIZE_TOL:
                cat = config.category_map.get(text.strip())
                if cat:
                    col_cat[col] = cat
                    global_cat = cat
                continue

            # ── Type header line: "Name (ID)" ───────────────────────────
            m = re.match(r'^(.*?)\s*\(([A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc]{1,4})\)$', text)
            if not m:
                continue
            tid = m.group(2)
            if tid not in known_ids:
                continue

            name = _clean_type_name(m.group(1))
            entry = found.setdefault(tid, {})
            entry["name"] = name
            # Only the column-header category is derived here; default /
            # spell / override resolution happens in run_types().
            category = col_cat[col] or col_cat[1 - col]
            if category:
                entry["category"] = category

    return found


def merge_types(tables_entries: list[list[tuple[str, dict]]]) -> list[dict]:
    """
    Merge entries from all tables of one book into a single type list.

    Types appearing in several tables (e.g. groupCosts + spellCosts +
    fightCosts) are combined into one entry. Result is sorted by type ID.
    """
    merged: dict[str, dict] = {}

    for table_entries, field_name in tables_entries:
        for type_id, costs in table_entries:
            entry = merged.setdefault(type_id, {"id": type_id})
            cost_map = entry.setdefault(field_name, {})
            cost_map.update(costs)

    return [merged[tid] for tid in sorted(merged)]


# ── Main / CLI ────────────────────────────────────────────────────────────────

def run_types(config: TypeParseConfig):
    """
    Run the type-table parser for a given book configuration.

    Parameters:
        config: per-book TypeParseConfig
    """
    parser = argparse.ArgumentParser(description=config.description)
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse only, print results, do not write files.")
    args = parser.parse_args()

    print(f"\nOpening: {config.pdf_path}")
    with pdfplumber.open(config.pdf_path) as pdf:
        print(f"PDF has {len(pdf.pages)} pages.")

        all_table_entries: list[tuple[list[tuple[str, dict]], str]] = []
        for table in config.tables:
            entries = parse_table(pdf, table)
            print(f"  Page {table.page:3d}  {table.field:12s}  {len(entries):3d} type rows")
            all_table_entries.append((entries, table.field))

        types = merge_types(all_table_entries)

        # Derive display name / category from the two-column
        # "Lerneinheiten bei Spielbeginn" section.
        if config.identity_pages:
            known_ids = {t["id"] for t in types}
            identities = parse_type_identities(pdf, config, known_ids)
            print(f"  Identity sections: {len(identities)} named type(s) found")
            for t in types:
                ident = identities.get(t["id"])
                if not ident:
                    continue
                if "name" in ident:
                    t["name"] = ident["name"]

                # Category resolution precedence:
                #   column header  <  default_category (maybe upgraded to
                #   spell_category when the type has spellCosts) < override.
                category = ident.get("category")
                if not category and config.default_category:
                    category = config.default_category
                    if config.spell_category and "spellCosts" in t:
                        category = config.spell_category
                tid_override = config.category_overrides.get(t["id"])
                if tid_override:
                    category = tid_override
                if category:
                    t["category"] = category

    print(f"=== Types: {len(types)} entries after merge ===")

    out_path = Path(config.out_types)
    output = {"types": types}

    if args.dry_run:
        print(f"\n=== DRY RUN — first 5 types as JSON ===")
        for t in types[:5]:
            print(_compact_primitives(json.dumps(t, ensure_ascii=False, indent=2)))
        print(f"\n[dry-run] Would write {len(types)} types to {config.out_types}")
        return

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        _compact_primitives(json.dumps(output, ensure_ascii=False, indent=2)),
        encoding="utf-8",
    )
    print(f"Written: {config.out_types}  ({len(types)} types)")
