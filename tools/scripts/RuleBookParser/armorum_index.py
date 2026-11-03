"""
armorum_index.py — Parse "Liste der Kampftechniken" (Ars Armorum S. 51f).

The list names every technique and Kampfvers with discipline, form and
Stufe. The entry parsers use it as a cross-check and to fill gaps.
"""

import re
from dataclasses import dataclass

from pdf_skills_common import fix_ligatures

# Lerneinheiten je Stufe für Kampftechniken und Kampfverse (S. 44)
LEARN_COST_BY_LEVEL = {1: 1, 2: 1, 3: 2, 4: 3, 5: 5, 6: 10, 7: 15, 8: 20, 9: 30, 10: 40}

# Book page → x boundaries between the list columns
INDEX_PAGES = {51: [170.0, 300.0, 430.0], 52: [170.0, 300.0]}

DISCIPLINES = {"Kampfkunst", "Schießkunst", "Fechtkunst", "KiDo", "Kampfverse"}
# Bold sub-headers in the list → canonical form
FORMS = {"Angriff": "Angriff", "Verteidigung": "Verteidigung", "Finten": "Finte",
         "Geist": "Geist", "Leib": "Leib"}
# Disciplines without sub-headers
DEFAULT_FORM = {"Schießkunst": "Schuss", "Fechtkunst": "Fecht", "Kampfverse": ""}

# Spelling errors in the list → spelling of the entry heading
NAME_FIXES = {
    "Ling Hia": "LingHia",
    "YukiGamura": "YukiGamaru",
    "Cuthalions Konter": "Cúthalions Konter",
}

_ENTRY_RE = re.compile(r"^(?P<name>.+?)\s+(?P<level>\d{1,2})$")
_Y_TOLERANCE = 3.0


@dataclass(frozen=True)
class IndexEntry:
    """One row of the technique list."""
    discipline: str
    form: str
    name: str
    level: int


def _group_lines(words: list[dict]) -> list[list[dict]]:
    """Group words (sorted by top) into visual lines."""
    lines: list[list[dict]] = []
    group: list[dict] = []
    for w in words:
        if group and abs(w["top"] - group[0]["top"]) > _Y_TOLERANCE:
            lines.append(group)
            group = []
        group.append(w)
    if group:
        lines.append(group)
    return [sorted(g, key=lambda w: w["x0"]) for g in lines]


def parse_index(pdf) -> list[IndexEntry]:
    """
    Parse the technique list on pages 51–52.

    Columns are read in order; the current discipline/form carries over
    from one column (and page) to the next.
    """
    entries: list[IndexEntry] = []
    discipline: str | None = None
    form = ""
    for page_no, bounds in INDEX_PAGES.items():
        words = pdf.pages[page_no - 1].extract_words(extra_attrs=["size", "fontname"])
        edges = [0.0, *bounds, 10_000.0]
        for c in range(len(edges) - 1):
            col = sorted(
                (w for w in words if edges[c] <= w["x0"] < edges[c + 1] and w["size"] < 16),
                key=lambda w: (w["top"], w["x0"]),
            )
            for line in _group_lines(col):
                text = fix_ligatures(" ".join(w["text"] for w in line)).strip()
                if text.endswith(" Stufe"):
                    head = text[: -len(" Stufe")]
                    discipline = head if head in DISCIPLINES else None
                    form = DEFAULT_FORM.get(discipline or "", "")
                    continue
                if text in FORMS and "Bold" in line[0].get("fontname", ""):
                    form = FORMS[text]
                    continue
                m = _ENTRY_RE.match(text)
                if discipline and m:
                    name = NAME_FIXES.get(m["name"], m["name"])
                    entries.append(IndexEntry(discipline, form, name, int(m["level"])))
    return entries
