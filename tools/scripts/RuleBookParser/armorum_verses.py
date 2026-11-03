"""
armorum_verses.py — Parse Kampfverse ("Der Almanach der Reime", Ars Armorum S. 132–138).

Kampfverse use the spell data model (S. 130f: same game data as Zauberlieder,
learned like spells). They are written as spells with spellGroup "Kampfverse",
which matches the key in type.spellCosts (Tabelle 2b).
"""

import re

from armorum_index import IndexEntry, LEARN_COST_BY_LEVEL
from pdf_entry_stream import join_lines, stream

FIRST_PAGE, LAST_PAGE = 132, 138
SOURCE = "Ars Armorum"
SPELL_GROUP = "Kampfverse"

TYPE_RE = re.compile(r"^Kampfvers der Stufe (\d+)$")
KV_MAP = {
    "AP-Verbrauch:":  "apCost",
    "Zauberdauer:":   "castingTime",
    "Wirkungsziel:":  "targetType",
    "Zielgruppe:":    "targetGroup",
    "Wirkungsdauer:": "duration",
}
SPELL_SCHOOLS = {"Beherrschen", "Bewegen", "Erkennen", "Erschaffen", "Formen", "Verändern", "Zerstören"}
ELEMENT_SEPARATOR = "l"   # ornament glyph between the two elements


def parse_verses(pdf) -> list[dict]:
    """Parse all Kampfverse into raw dicts (name, level, page, fields, desc lines)."""
    lines = stream(pdf, FIRST_PAGE, LAST_PAGE)
    verses: list[dict] = []
    cur: dict | None = None
    for k, line in enumerate(lines):
        is_title = (abs(line.size - 11.0) < 0.6 and k + 1 < len(lines)
                    and TYPE_RE.match(lines[k + 1].text))
        if is_title:
            if cur:
                verses.append(cur)
            cur = {"name": line.text, "page": line.page, "level": 0,
                   "material": None, "elements": [], "desc": []}
            continue
        if cur is None:
            continue
        m = TYPE_RE.match(line.text)
        if m and cur["level"] == 0:
            cur["level"] = int(m[1])
            continue
        if line.size >= 16:          # next chapter ("Feuerwerk und Explosivwaffen")
            verses.append(cur)
            cur = None
            continue
        words = line.text.split()
        if not cur["elements"] and words and words[0] in SPELL_SCHOOLS:
            cur["elements"] = [w for w in words[1:] if w != ELEMENT_SEPARATOR]
            continue
        if len(line.text) == 1 and line.size >= 13:   # ornament glyph line
            continue
        label = next((lbl for lbl in KV_MAP if line.text.startswith(lbl)), None)
        if label:
            cur[KV_MAP[label]] = line.text[len(label):].strip()
            continue
        if line.italic and line.text == "Instrument":
            cur["material"] = "Instrument"
            continue
        cur["desc"].append(line.text)
    if cur:
        verses.append(cur)
    return verses


def to_spell_entries(verses: list[dict]) -> tuple[list[dict], list[dict]]:
    """Convert raw verses to (spells, spellDescriptions) in the spells.json schema."""
    spells: list[dict] = []
    descriptions: list[dict] = []
    for v in verses:
        spell = {
            "id":          v["name"],
            "name":        v["name"],
            "level":       v["level"],
            "learnCost":   LEARN_COST_BY_LEVEL.get(v["level"], 0),
            # S. 130f: mit Instrument Gestenzauber, sonst Wortzauber
            "spellType":   "Gestenzauber" if v["material"] else "Wortzauber",
            "spellGroup":  SPELL_GROUP,
            "elements":    v["elements"],
            "material":    v["material"],
            "apCost":      v.get("apCost", ""),
            "castingTime": v.get("castingTime", ""),
            "range":       "",
            "targetType":  v.get("targetType", ""),
            # S. 131: wirken ausnahmslos in 15 m Umkreis
            "effectArea":  "15 m Umkreis",
            "targetGroup": v.get("targetGroup", ""),
            "duration":    v.get("duration", ""),
            # S. 131: ausnahmslos göttlichen Ursprungs
            "origin":      "göttlich",
            "source":      f"{SOURCE} S. {v['page']}",
        }
        if not (v["level"] and spell["apCost"] and spell["castingTime"] and spell["duration"]):
            spell["parseWarning"] = True
        spells.append(spell)
        descriptions.append({"id": spell["id"], "description": join_lines(v["desc"])})
    return spells, descriptions


def cross_check_verses(spells: list[dict], index: list[IndexEntry]) -> None:
    """Print differences between parsed Kampfverse and the index (S. 52)."""
    listed = {(e.name, e.level) for e in index if e.discipline == "Kampfverse"}
    parsed = {(s["name"], s["level"]) for s in spells}
    print(f"  Kampfverse: {len(spells)} parsed, {len(listed)} index rows")
    print(f"  Index only: {sorted(listed - parsed)}")
    print(f"  Not in index: {sorted(parsed - listed)}")
