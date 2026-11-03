"""
armorum_techniques.py — Parse Kampftechniken from Ars Armorum (S. 54–108).

Covers Kampfkunst (Angriff, Verteidigung, Finten, Geist), Schießkunst,
Fechtkunst and KiDo. Each entry starts with a bold heading followed by a
"Stufe …" line; 18pt section headings determine discipline and form.
Result entries are cross-checked against the technique list (S. 51f).
"""

import re

from armorum_index import IndexEntry, LEARN_COST_BY_LEVEL
from pdf_entry_stream import StreamLine, join_lines, stream

FIRST_PAGE, LAST_PAGE = 54, 108
SOURCE = "Ars Armorum"

# 18pt section heading → (discipline, form). Any other heading ends a section.
SECTION_HEADERS = {
    "Angriffstechniken":           ("Kampfkunst", "Angriff"),
    "Verteidigungstechniken":      ("Kampfkunst", "Verteidigung"),
    "Finten":                      ("Kampfkunst", "Finte"),
    "Geistestechniken":            ("Kampfkunst", "Geist"),
    "Schusstechniken":             ("Schießkunst", "Schuss"),
    "Fechttechniken":              ("Fechtkunst", "Fecht"),
    "KiDo-Angriffstechniken":      ("KiDo", "Angriff"),
    "KiDo-Verteidigungstechniken": ("KiDo", "Verteidigung"),
    "KiDo-Finten":                 ("KiDo", "Finte"),
    "KiDo-Leibestechniken":        ("KiDo", "Leib"),
}

VARIANTS = ["Anstürmen", "Attackieren", "Entwaffnen", "Anspringen", "Werfen",
            "Ausweichen", "Blockieren", "Bewegen", "Kontrollieren", "Kontrolle", "Finte"]

# Heading typos → name used in the index and the KiDo boxes
ENTRY_NAME_FIXES = {"KaguTobu": "KagoTobu"}

STUFE_RE = re.compile(
    r"^Stufe\s+(?P<level>\d+)(?:\s*/\s*(?P<rank>[SEM]))?\s+(?P<ap>\d+)\s+AP"
    r"(?:\s+(?P<restr>[GHBI]+))?\s*$"
)
TITLE_RE = re.compile(
    r"^(?P<name>.+?)(?:\s+\((?P<translation>[^)]*)\))?(?P<ep0>\s+EP0)?"
    r"(?:\s+(?P<variant>" + "|".join(VARIANTS) + r"))?$"
)
KIDO_COLOR_RE = re.compile(r"^(?P<colors>[^\s/]+/[^\s/]+/[^\s/]+)\s+(?P<kind>sanft|hart|beide)$")
# Lines of the KiDo summary boxes, e.g. "S DokujaOschi Stoß der Giftschlange rot/gelb/weiß"
KIDO_BOX_RE = re.compile(r"^[SEM]\s+\S+\s.*\b(rot|gelb|weiß)(/(rot|gelb|weiß|–))*$")


def _is_noise(line: StreamLine) -> bool:
    """Lines of KiDo summary boxes (12pt italic sub-headers, rows, 10pt box titles)."""
    if 11.5 <= line.size < 16 and line.italic:
        return True
    if KIDO_BOX_RE.match(line.text):
        return True
    return line.text in SECTION_HEADERS and line.size < 16


def _is_heading(line: StreamLine) -> bool:
    """18pt section heading (single-letter drop caps excluded)."""
    return line.size >= 16 and len(line.text) > 3


def _entry_starts(lines: list[StreamLine]) -> list[tuple[int, int]]:
    """
    Return (title_index, stufe_index) pairs.

    Wrapped headings span two lines: "YoroYoschi (Schwankendes Schilf) Bewe-"
    + "gen", or "YukiGamaru (Wirbelnder Schnee)" + "Bewegen".
    """
    starts: list[tuple[int, int]] = []
    for k, line in enumerate(lines):
        if not STUFE_RE.match(line.text) or k == 0:
            continue
        prev = lines[k - 1]
        if prev.bold:
            starts.append((k - 1, k))
        elif k > 1 and lines[k - 2].bold and len(prev.text.split()) <= 2:
            starts.append((k - 2, k))
        else:
            print(f"  WARNING: Stufe line without heading on p. {line.page}: {line.text!r}")
    return starts


def _title_text(lines: list[StreamLine], t: int, k: int) -> str:
    """Heading text, joining a wrapped second line."""
    if t == k - 1:
        return lines[t].text
    first, second = lines[t].text, lines[t + 1].text
    return first[:-1] + second if first.endswith("-") else f"{first} {second}"


def _build_entry(section: tuple[str, str], title: str, stufe: re.Match,
                 body: list[StreamLine], page: int) -> tuple[dict, dict]:
    """Create the technique and its description entry."""
    discipline, form = section
    m = TITLE_RE.match(title)
    name = ENTRY_NAME_FIXES.get(m["name"], m["name"])
    level = int(stufe["level"])
    tech: dict = {
        "id": f"{discipline}:{name}",
        "name": name,
        "discipline": discipline,
        "form": form,
        "level": level,
        "learnCost": LEARN_COST_BY_LEVEL.get(level, 0),
        "apCost": stufe["ap"],
        "ep0": bool(m["ep0"]),
        "restrictions": list(stufe["restr"] or ""),
        "source": f"{SOURCE} S. {page}",
    }
    variant = m["variant"]
    if variant and variant not in ("Finte", "Kontrolle"):
        tech["variant"] = variant
    elif variant == "Kontrolle":
        tech["variant"] = "Kontrollieren"
    if m["translation"]:
        tech["translation"] = m["translation"]
    if stufe["rank"]:
        tech["rank"] = stufe["rank"]

    texts = [l.text for l in body]
    if texts and discipline in ("Kampfkunst", "Schießkunst") and body[0].italic:
        tech["weapons"] = texts.pop(0)
    if texts and discipline == "KiDo":
        cm = KIDO_COLOR_RE.match(texts[0])
        if cm:
            tech["colors"] = [c for c in cm["colors"].split("/") if c not in ("–", "-")]
            tech["kind"] = cm["kind"]
            texts.pop(0)
    return tech, {"id": tech["id"], "description": join_lines(texts)}


def parse_technique_entries(pdf) -> tuple[list[dict], list[dict]]:
    """Parse all technique entries; returns (techniques, descriptions)."""
    lines = [l for l in stream(pdf, FIRST_PAGE, LAST_PAGE) if not _is_noise(l)]
    headings = [i for i, l in enumerate(lines) if _is_heading(l)]
    starts = _entry_starts(lines)

    techniques: list[dict] = []
    descriptions: list[dict] = []
    for n, (t, k) in enumerate(starts):
        previous_headings = [h for h in headings if h < t]
        if not previous_headings:
            continue
        section = SECTION_HEADERS.get(lines[previous_headings[-1]].text)
        if section is None:
            print(f"  WARNING: entry outside a technique section on p. {lines[t].page}: {lines[t].text!r}")
            continue
        next_start = starts[n + 1][0] if n + 1 < len(starts) else len(lines)
        next_heading = next((h for h in headings if h > k), len(lines))
        body = lines[k + 1: min(next_start, next_heading)]
        tech, desc = _build_entry(section, _title_text(lines, t, k),
                                  STUFE_RE.match(lines[k].text), body, lines[t].page)
        techniques.append(tech)
        descriptions.append(desc)
    return techniques, descriptions


def complete_from_index(techniques: list[dict], descriptions: list[dict],
                        index: list[IndexEntry]) -> bool:
    """
    Cross-check parsed techniques against the index (in place).

    Index-only techniques are added with parseWarning; level mismatches keep
    the entry value. Prints a report and returns True if nothing unexpected
    was found (known book errors are listed in KNOWN_DEVIATIONS).
    """
    listed = {(e.discipline, e.name): e for e in index if e.discipline != "Kampfverse"}
    parsed = {(t["discipline"], t["name"]): t for t in techniques}

    missing = sorted(set(listed) - set(parsed))
    unlisted = sorted(set(parsed) - set(listed))
    level_diff = sorted(
        (key, listed[key].level, parsed[key]["level"])
        for key in set(listed) & set(parsed)
        if listed[key].level != parsed[key]["level"] or listed[key].form != parsed[key]["form"]
    )

    for discipline, name in missing:
        e = listed[(discipline, name)]
        tech = {
            "id": f"{discipline}:{name}", "name": name, "discipline": discipline,
            "form": e.form, "level": e.level, "learnCost": LEARN_COST_BY_LEVEL.get(e.level, 0),
            "apCost": "", "ep0": False, "restrictions": [],
            "source": f"{SOURCE} S. 51", "parseWarning": True,
        }
        techniques.append(tech)
        descriptions.append({"id": tech["id"], "description": ""})

    print(f"  Techniques: {len(parsed)} parsed, {len(listed)} in index")
    print(f"  Index only (added with parseWarning): {missing}")
    print(f"  Not in index (kept): {unlisted}")
    print(f"  Level/form differences (entry wins): {level_diff}")

    unexpected = (set(missing) - KNOWN_DEVIATIONS["index_only"]) | \
                 (set(unlisted) - KNOWN_DEVIATIONS["unlisted"]) | \
                 ({d[0] for d in level_diff} - KNOWN_DEVIATIONS["level"])
    if unexpected:
        print(f"  UNEXPECTED deviations: {sorted(unexpected)}")
    return not unexpected


# Book errors verified by hand (see plan 2026-11-03-ars-armorum-kampftechniken.md)
KNOWN_DEVIATIONS = {
    "index_only": {("Kampfkunst", "Schwingenkeule")},
    "unlisted":   {("KiDo", "TiKen")},
    "level":      {("Kampfkunst", "Kampf im Dunkeln")},
}
