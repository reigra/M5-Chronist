"""
parse_spells.py
---------------
Phase 3: Parse spell entries from the Arkanum PDF and generate:
  - data/rules/spells.json
  - data/rules/spell-descriptions.json

The parser processes pages in two independent column streams (left/right),
running a state machine per column to extract structured spell data.

Usage:
    python tools/parse_spells.py
    python tools/parse_spells.py --dry-run    # parse only, print first 20 spells
    python tools/parse_spells.py --dry-run --page 64  # test a single page
"""

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

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
PDF_PATH         = str(SCRIPT_DIR / "../../books/Das Arkanum_1402.pdf")
OUT_SPELLS       = str(SCRIPT_DIR / "../../arkanum/spells.json")
OUT_DESCRIPTIONS = str(SCRIPT_DIR / "../../arkanum/spell-descriptions.json")

# Spell sections: (first_book_page, last_book_page, derive_group_from_text, fixed_group)
SECTIONS = [
    (63,  134, True,  None),
    (135, 148, False, "Wundertat"),    # p135 contains Allheilung + start of Arm der Götter (inset box is also on this page)
    (149, 162, False, "Dweomer"),
    (163, 172, False, "Zauberlied"),   # p164 contains Das Lied des Fesselns + Das Lied des Friedens (inset box is also on this page)
]

# Pages to skip entirely — no spell content, only inset continuation text.
# p80: continuation of "Besonderes zu Illusionszaubern" inset from p79, no spells.
SKIP_COMPLETE = {80}

# Pages with known partial insets but still containing spell content.
# Spells from these pages will receive parseWarning=True for manual review.
SKIP_PARTIAL: set[int] = set()

# x-coordinate boundary between left and right columns
COL_SPLIT = 290.0

# Font size thresholds
SIZE_TITLE   = 11.0   # spell title
SIZE_BODY    = 10.0   # type line, element line body, description
SIZE_LABEL   = 9.0    # KV labels (AP-Verbrauch: etc.)
SIZE_ELEMENT = 14.0   # element arrow/separator symbols

# ── Spell group names (full expanded form, matching SPELL_GROUPS in the PWA) ──

SPELL_GROUP_NAMES = {
    "Beherrschen", "Bewegen", "Dweomer", "Erkennen", "Erschaffen",
    "Formen", "Verändern", "Wundertat", "Zauberlied", "Zerstören",
}

# Lernkosten (LE) pro Spruchstufe — aus dem Arkanum-Regelwerk
LEARN_COST_BY_LEVEL = {
    1: 1, 2: 1, 3: 2, 4: 3, 5: 5,
    6: 10, 7: 15, 8: 20, 9: 30, 10: 40,
    11: 60, 12: 90,
}

# German KV label text → JSON field name
# Note: some PDF pages extract labels without the trailing colon — both forms are listed.
KV_MAP: dict[str, str] = {
    "AP-Verbrauch:":    "apCost",
    "Zauberdauer:":     "castingTime",
    "Reichweite:":      "range",
    "Wirkungsziel:":    "targetType",
    "Wirkungsbereich:": "effectArea",
    "Wirkungsdauer:":   "duration",
    "Ursprung:":        "origin",
    # Without trailing colon (some PDF extractions omit it)
    "Ursprung":         "origin",
}

# Regex for the spell type line
# Note: one PDF entry has a typo "der der Stufe" — the {1,2} handles this.
TYPE_RE = re.compile(
    r"^(Gestenzauber|Wortzauber|Gedankenzauber|Zauberlied)\s+(?:der\s+){1,2}Stufe\s+(\d+)",
    re.IGNORECASE
)

# ── Ligature normalization ────────────────────────────────────────────────────

# Some PDFs encode fi/fl/ff/ffi/ffl as single Unicode ligature characters.
_UNICODE_LIGATURES = str.maketrans({
    '\ufb00': 'ff',
    '\ufb01': 'fi',
    '\ufb02': 'fl',
    '\ufb03': 'ffi',
    '\ufb04': 'ffl',
    '\ufb05': 'st',
    '\ufb06': 'st',
})

# When a ligature glyph is split across two word tokens a spurious space appears:
#   "Feuerfi nger" → "Feuerfinger",  "Aufl ösung" → "Auflösung"
# The pattern matches the ligature fragment followed by a space and a lowercase letter.
_LIGATURE_SPLIT_RE = re.compile(r'(fi|fl|ff|ffi|ffl) (?=[a-z\u00e4\u00f6\u00fc\u00df])')


def fix_ligatures(text: str) -> str:
    """
    Normalize PDF ligature artifacts in extracted text.
    Applies to all extracted line text — spell names, KV fields, and descriptions.
    """
    text = text.translate(_UNICODE_LIGATURES)
    text = _LIGATURE_SPLIT_RE.sub(r'\1', text)
    return text


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class Word:
    """A single word extracted from the PDF with position and font info."""
    text: str
    x0: float
    top: float
    size: float


@dataclass
class Line:
    """A group of words at the same vertical position in one column."""
    y: float
    words: list  # List[Word]

    @property
    def text(self) -> str:
        """Full text of the line, words sorted left to right, with ligatures normalized."""
        raw = " ".join(w.text for w in sorted(self.words, key=lambda w: w.x0))
        return fix_ligatures(raw)

    @property
    def max_size(self) -> float:
        return max((w.size for w in self.words), default=0.0)

    @property
    def is_title(self) -> bool:
        """Spell title lines are at ~11pt font size."""
        return abs(self.max_size - SIZE_TITLE) < 0.6

    @property
    def is_element_line(self) -> bool:
        """Element lines contain 14pt arrow symbols mixed with 10pt text."""
        return any(abs(w.size - SIZE_ELEMENT) < 0.6 for w in self.words)

    @property
    def has_content_words(self) -> bool:
        """True if the line has any non-14pt words (actual text content)."""
        return any(abs(w.size - SIZE_ELEMENT) >= 0.6 for w in self.words)

    @property
    def kv_label(self) -> Optional[str]:
        """Returns the KV JSON field name if this line starts with a known label."""
        for w in self.words:
            if w.text in KV_MAP:
                return KV_MAP[w.text]
        return None

    @property
    def is_letter_spaced(self) -> bool:
        """
        Detects decorative inset box text where each character is a separate word.
        e.g. 'h e i n b a r'  → most words are single characters.
        """
        if len(self.words) < 5:
            return False
        single_chars = sum(1 for w in self.words if len(w.text) == 1)
        return (single_chars / len(self.words)) > 0.6


@dataclass
class SpellData:
    """All data for one parsed spell entry."""
    name: str = ""
    level: int = 0
    spell_type: str = ""
    spell_group: str = ""
    elements: list = field(default_factory=list)
    material: Optional[str] = None
    ap_cost: str = ""
    casting_time: str = ""
    range_val: str = ""
    target_type: str = ""
    effect_area: str = ""
    duration: str = ""
    origin: str = ""
    description: str = ""
    source: str = ""
    parse_warning: bool = False

    def is_complete(self) -> bool:
        """A spell is complete if all required fields are present."""
        required = [self.name, self.spell_type, self.level,
                    self.ap_cost, self.casting_time]
        return all(required)

    def to_spell_entry(self) -> dict:
        """Convert to the spells.json schema format."""
        entry = {
            "id":               self.name,
            "name":             self.name,
            "level":            self.level,
            "learnCost":        LEARN_COST_BY_LEVEL.get(self.level, 0),
            "spellType":        self.spell_type,
            "spellGroup":       self.spell_group,
            "elements":         self.elements,
            "material":         self.material,
            "apCost":           self.ap_cost,
            "castingTime":      self.casting_time,
            "range":            self.range_val,
            "targetType":       self.target_type,
            "effectArea":       self.effect_area,
            "duration":         self.duration,
            "origin":           self.origin,
            "shortDescription": "",
            "source":           self.source,
        }
        if self.parse_warning:
            entry["parseWarning"] = True
        return entry

    def to_description_entry(self) -> dict:
        """Convert to the spell-descriptions.json schema format."""
        return {
            "spellId":     self.name,
            "description": self.description.strip(),
        }


# ── PDF helpers ───────────────────────────────────────────────────────────────

def extract_words(page) -> list:
    """
    Extract all Word objects from a pdfplumber page.
    Returns a flat list of Word objects with position and font size.
    """
    raw = page.extract_words(
        x_tolerance=3,
        y_tolerance=3,
        keep_blank_chars=False,
        use_text_flow=False,
        extra_attrs=["size"],
    )
    return [
        Word(
            text=w["text"],
            x0=float(w["x0"]),
            top=float(w["top"]),
            size=float(w.get("size", SIZE_BODY)),
        )
        for w in raw
    ]


def split_columns(words: list) -> tuple:
    """
    Split words into left column (x < COL_SPLIT) and right column (x >= COL_SPLIT).
    Column processing is independent to avoid y-coordinate interleaving issues.
    """
    left  = [w for w in words if w.x0 < COL_SPLIT]
    right = [w for w in words if w.x0 >= COL_SPLIT]
    return left, right


def group_into_lines(words: list, y_tolerance: float = 4.0) -> list:
    """
    Group Word objects into Line objects by proximity of their top y-coordinate.
    Words within y_tolerance of each other are considered the same line.
    Returns a list of Line objects sorted by ascending y.
    """
    if not words:
        return []

    sorted_words = sorted(words, key=lambda w: w.top)
    lines: list[Line] = []
    current_y = sorted_words[0].top
    current_words: list[Word] = []

    for word in sorted_words:
        if abs(word.top - current_y) <= y_tolerance:
            current_words.append(word)
        else:
            lines.append(Line(y=current_y, words=list(current_words)))
            current_y = word.top
            current_words = [word]

    if current_words:
        lines.append(Line(y=current_y, words=list(current_words)))

    return lines


def parse_element_line(line: Line) -> tuple:
    """
    Parse the group/element line (contains 14pt arrow symbols and 10pt content).
    Returns (group_name, element1, element2).
    All three can be None if the line cannot be parsed.

    Structure: [GroupName] [→] [Element1] [→] [Element2]
    The 14pt characters are the arrow separators; 10pt words are the content.
    """
    content_words = [
        w.text for w in sorted(line.words, key=lambda w: w.x0)
        if abs(w.size - SIZE_ELEMENT) >= 0.6
    ]

    if not content_words:
        return None, None, None

    group_name = content_words[0] if content_words else None
    elements   = content_words[1:]
    el1        = elements[0] if len(elements) > 0 else None
    el2        = elements[1] if len(elements) > 1 else None

    return group_name, el1, el2


def get_kv_value(line: Line) -> str:
    """
    Extract the value portion of a KV line (all words that are not KV labels).
    """
    value_words = [
        w.text for w in sorted(line.words, key=lambda w: w.x0)
        if w.text not in KV_MAP
    ]
    return " ".join(value_words).strip()


# ── State machine parser ──────────────────────────────────────────────────────

class ColumnParser:
    """
    State machine that processes a sequence of Line objects from one PDF column
    and extracts SpellData objects.

    States:
        SEEKING     - looking for a spell title (11pt line)
        FOUND_TITLE - title found, expecting the type line next
        FOUND_TYPE  - type parsed, expecting material (optional) or element line
        IN_KV       - inside the key-value block
        IN_DESC     - reading description text after the KV block
    """

    SEEKING     = "SEEKING"
    FOUND_TITLE = "FOUND_TITLE"
    FOUND_TYPE  = "FOUND_TYPE"
    IN_KV       = "IN_KV"
    IN_DESC     = "IN_DESC"

    def __init__(self, fixed_group: Optional[str] = None, warn_all: bool = False):
        """
        Parameters:
            fixed_group: if set, all spells in this parser use this spellGroup
                         (used for Wunder/Dweom./Lied sections)
            warn_all:    if True, all spells get parseWarning=True
                         (used for partial-inset pages)
        """
        self.fixed_group  = fixed_group
        self.warn_all     = warn_all
        self.state        = self.SEEKING
        self.current: Optional[SpellData] = None
        self.pending_kv   = None   # field name waiting for its value line
        self.completed: list[SpellData] = []

    def _finish_current(self):
        """Finalize the current spell and add it to completed list."""
        if self.current is None:
            return
        if not self.current.is_complete():
            self.current.parse_warning = True
        if self.warn_all:
            self.current.parse_warning = True
        if self.fixed_group and not self.current.spell_group:
            self.current.spell_group = self.fixed_group
        self.completed.append(self.current)
        self.current  = None
        self.pending_kv = None

    def _start_spell(self, title: str, source_page: int):
        """Begin collecting data for a new spell."""
        self.current    = SpellData()
        self.current.name   = title
        self.current.source = f"Arkanum S. {source_page}"
        if self.fixed_group:
            self.current.spell_group = self.fixed_group
        self.state      = self.FOUND_TITLE
        self.pending_kv = None

    def _set_kv_field(self, field_name: str, value: str):
        """Set a KV field on the current spell."""
        if self.current is None:
            return
        field_attr = {
            "apCost":      "ap_cost",
            "castingTime": "casting_time",
            "range":       "range_val",
            "targetType":  "target_type",
            "effectArea":  "effect_area",
            "duration":    "duration",
            "origin":      "origin",
        }.get(field_name)
        if field_attr:
            setattr(self.current, field_attr, value)

    def feed_line(self, line: Line, source_page: int):
        """Process one line through the state machine."""

        # Skip decorative inset box text (letter-spaced characters)
        if line.is_letter_spaced:
            return

        text = line.text.strip()
        if not text:
            return

        # ── SEEKING ───────────────────────────────────────────────────────────
        if self.state == self.SEEKING:
            if line.is_title:
                self._start_spell(text, source_page)

        # ── FOUND_TITLE ───────────────────────────────────────────────────────
        elif self.state == self.FOUND_TITLE:
            m = TYPE_RE.search(text)
            if m:
                self.current.spell_type = m.group(1)
                self.current.level      = int(m.group(2))
                self.state = self.FOUND_TYPE
            elif line.is_title:
                # Two titles in a row (e.g., section header) — restart
                self._finish_current()
                self._start_spell(text, source_page)
            else:
                # Unexpected line: not a type line (could be intro text, stat block)
                # Abort this spell candidate and go back to seeking
                self._finish_current()
                self.state = self.SEEKING

        # ── FOUND_TYPE ────────────────────────────────────────────────────────
        elif self.state == self.FOUND_TYPE:
            if line.is_title:
                self._finish_current()
                self._start_spell(text, source_page)

            elif line.is_element_line and line.has_content_words:
                # Parse the group name and elements from the element line
                group, el1, el2 = parse_element_line(line)
                if not self.fixed_group:
                    self.current.spell_group = group or ""
                if el1:
                    self.current.elements.append(el1)
                if el2:
                    self.current.elements.append(el2)
                self.state = self.IN_KV

            elif line.is_element_line and not line.has_content_words:
                # 14pt-only line (standalone arrow symbol) — skip it
                pass

            elif line.kv_label:
                # KV block started without an element line (e.g., some Wunder entries)
                self.state = self.IN_KV
                self._process_kv_line(line, source_page)

            else:
                # Treat as material line (e.g., "Zunder (1 SS)", "Waffe aus Holz")
                # But only if it looks like a short material description
                # Try to detect element lines without 14pt symbols (fallback)
                found_group = False
                for group_name in SPELL_GROUP_NAMES:
                    if text.startswith(group_name):
                        if not self.fixed_group:
                            self.current.spell_group = group_name
                        parts = text.split()
                        group_word_count = len(group_name.split())
                        remaining = parts[group_word_count:]
                        self.current.elements = remaining[:2]
                        self.state = self.IN_KV
                        found_group = True
                        break
                if not found_group:
                    # It's a material line
                    if self.current.material is None:
                        self.current.material = text

        # ── IN_KV ─────────────────────────────────────────────────────────────
        elif self.state == self.IN_KV:
            if line.is_title:
                self._finish_current()
                self._start_spell(text, source_page)
                return

            self._process_kv_line(line, source_page)

        # ── IN_DESC ───────────────────────────────────────────────────────────
        elif self.state == self.IN_DESC:
            if line.is_title:
                self._finish_current()
                self._start_spell(text, source_page)
                return

            if line.kv_label:
                # KV label in description: likely parsing error or unusual layout
                # Skip to avoid corrupting description
                return
            # Skip decorative inset text: consistently ~9.1–9.3pt vs body text at 10pt.
            # Short inset lines (< 5 words) bypass is_letter_spaced, so we filter by font size.
            if line.max_size < 9.8:
                return
            if self.current:
                sep = " " if self.current.description else ""
                self.current.description += sep + text

    def _process_kv_line(self, line: Line, source_page: int):
        """Handle a line in the KV block — may contain label, value, or both."""
        label_field = line.kv_label

        if label_field:
            value = get_kv_value(line)
            if value:
                # Label and value on the same line
                self._set_kv_field(label_field, value)
                self.pending_kv = None
                if label_field == "origin":
                    self.state = self.IN_DESC
            else:
                # Label only — value will come on the next line
                self.pending_kv = label_field

        elif self.pending_kv:
            # This line is the value for the previous label
            self._set_kv_field(self.pending_kv, text := line.text.strip())
            if self.pending_kv == "origin":
                self.state = self.IN_DESC
            self.pending_kv = None

        elif self.current and self.current.duration:
            # No KV label, no pending KV, but duration is already set.
            # This means Ursprung is absent (e.g. Lied spells).
            # The line is the start of the description.
            self.state = self.IN_DESC
            sep = " " if self.current.description else ""
            self.current.description += sep + line.text.strip()

    def finalize(self) -> list:
        """Flush the last in-progress spell and return all completed spells."""
        self._finish_current()
        return list(self.completed)


# ── Main processing ───────────────────────────────────────────────────────────

def process_section(pdf, section: tuple, single_page: Optional[int] = None) -> list:
    """
    Process all pages in a section and return a list of SpellData objects.

    Parameters:
        pdf:         open pdfplumber PDF object
        section:     (start_page, end_page, group_from_text, fixed_group)
        single_page: if set, only process this one page (for testing)
    """
    start_page, end_page, group_from_text, fixed_group = section
    total_pages = len(pdf.pages)
    results: list[SpellData] = []

    print(f"  Section pages {start_page}–{end_page} "
          f"({'group from text' if group_from_text else fixed_group})")

    page_range = range(start_page, end_page + 1)
    if single_page is not None:
        page_range = [single_page]

    # Single parser for both columns: text flows left-col → right-col → next-page left-col.
    # Using two independent parsers would break spells that start at the bottom of the left
    # column and continue at the top of the right column on the same page.
    parser = ColumnParser(fixed_group=fixed_group)

    for book_page in page_range:
        pdf_index = book_page - 1  # 0-based; no offset needed for this PDF

        if book_page in SKIP_COMPLETE:
            print(f"    Page {book_page}: skipped (known problematic inset page)")
            # Flush parser so carry-over state does not bleed across the gap
            results.extend(parser.finalize())
            parser = ColumnParser(fixed_group=fixed_group)
            continue

        if pdf_index >= total_pages:
            print(f"    Page {book_page}: out of PDF range, stopping section.")
            break

        warn_page = book_page in SKIP_PARTIAL
        if warn_page:
            print(f"    Page {book_page}: partial inset — spells will have parseWarning")
            parser.warn_all = True
        else:
            parser.warn_all = False

        page = pdf.pages[pdf_index]
        words = extract_words(page)
        left_words, right_words = split_columns(words)
        left_lines  = group_into_lines(left_words)
        right_lines = group_into_lines(right_words)

        # Feed left column first, then right column — this matches the reading order.
        for line in left_lines:
            parser.feed_line(line, book_page)
        for line in right_lines:
            parser.feed_line(line, book_page)

    # Flush remaining state at end of section
    results.extend(parser.finalize())
    return results


def process_pdf(dry_run: bool = False, single_page: Optional[int] = None):
    """
    Main entry point: parse all sections and write output JSON files.

    Parameters:
        dry_run:     if True, print parsed data but do not write files
        single_page: if set, only process this page number (for testing)
    """
    all_spells: list[SpellData] = []

    print(f"Opening: {PDF_PATH}")
    with pdfplumber.open(PDF_PATH) as pdf:
        print(f"PDF has {len(pdf.pages)} pages.")

        for section in SECTIONS:
            start_page = section[0]
            # Skip sections that don't contain the test page
            if single_page is not None and not (section[0] <= single_page <= section[1]):
                continue
            spells = process_section(pdf, section, single_page=single_page)
            all_spells.extend(spells)
            print(f"    → {len(spells)} spells extracted from this section.")

    # Filter out spells with no name (parsing artifacts)
    all_spells = [s for s in all_spells if s.name.strip()]

    warnings   = [s for s in all_spells if s.parse_warning]
    print(f"\nTotal: {len(all_spells)} spells, {len(warnings)} with parseWarning.")

    if warnings:
        print("Spells needing manual review:")
        for s in warnings:
            print(f"  - {s.name!r:40s}  {s.source}")

    if dry_run:
        print("\n--- DRY RUN (first 20 spells) ---")
        for s in all_spells[:20]:
            print(json.dumps(s.to_spell_entry(), ensure_ascii=False, indent=2))
        return

    # Write output files
    spells_json = {"spells": [s.to_spell_entry() for s in all_spells]}
    desc_json   = {"spellDescriptions": [s.to_description_entry() for s in all_spells]}

    Path(OUT_SPELLS).write_text(
        json.dumps(spells_json, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    Path(OUT_DESCRIPTIONS).write_text(
        json.dumps(desc_json, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\nWritten: {OUT_SPELLS}")
    print(f"Written: {OUT_DESCRIPTIONS}")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Parse Arkanum PDF spell entries into JSON files."
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Parse but do not write files. Prints first 20 spells.",
    )
    parser.add_argument(
        "--page", type=int, default=None,
        help="Process only this single book page number (for testing).",
    )
    args = parser.parse_args()
    process_pdf(dry_run=args.dry_run, single_page=args.page)


if __name__ == "__main__":
    main()
