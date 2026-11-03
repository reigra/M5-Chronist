# Ars Armorum: Kampftechniken & Kampfverse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Kampftechniken (Kampfkunst, Fechtkunst, Schießkunst, KiDo) and the Kampfverse from *Ars Armorum* into rule JSON, and let characters learn them in the app — techniques on a new "Kampftechniken" page, Kampfverse on the existing spell page — with the same normal/reward cost rules as spells.

**Architecture:** The Python parser gets three new modules (list index, technique entries, Kampfverse entries) built on a shared reading-order line stream; `parse_armorum.py` now writes `techniques.json`, `technique-descriptions.json`, `spells.json`, `spell-descriptions.json` and combines everything into `tools/rules/armorum.json`. In the app, Kampfverse are plain `Spell`s with `spellGroup: "Kampfverse"` (costs come from the already-parsed `type.spellCosts.Kampfverse`), so `SpellsView` needs only cosmetic changes. Techniques get a new `Technique` type, a `RulesData.techniques` section, `Character.techniques`, cost logic in `AdvancementService` (LE × `type.fightCosts[discipline]`), prerequisite/rank evaluation in a new `TechniqueService`, and a new lazy `TechniquesView`.

**Principle — no game rules in the app:** every rule value (EP/LE, LE per Stufe, gold per LE, skill prerequisites, KiDo rank thresholds, restriction labels) comes from imported rule data. The parser exports the prose rules of the book as a `techniqueRules` section; the app only evaluates them generically. The only app-side logic is the existing reward-mode halving.

**Tech Stack:** Python 3 + pdfplumber (run via `uv`), Vue 3 + TypeScript (strict, `noUnusedLocals`), Vite. No test framework exists: verification = parser cross-check against the book's own index list, `npx vue-tsc -b`, `npm run build`, and a manual browser check.

---

## Book analysis (Ars Armorum, PDF page = book page)

| Content | Pages | Notes |
|---|---|---|
| Learning rules for techniques & Kampfverse | 42, 44 | "werden nach denselben Regeln gelernt wie Zaubersprüche"; LE by Stufe: 1→1, 2→1, 3→2, 4→3, 5→5, 6→10, 7→15, 8→20, 9→30, 10→40 |
| Tabelle 2b (EP/LE Kampfverse) | 44 | Ba 60, Sk 30 — **already parsed** into `types[].spellCosts.Kampfverse` |
| Tabelle 3 (EP/LE Kampftechniken) | 44 | per type: Kampfk./Fechtk./Schießk./KiDo, `ZAU` row = all Zauberer (120) — **already parsed** into `types[].fightCosts` |
| Gold | 44 | 100 GS je LE (same as spells) |
| Prerequisites | 8, 12, 15, 17, 21 | Kampfkunst / Schießkunst / KiDo skill learned; Fechtkunst needs Fechten+12 (no Gs bonus) |
| KiDo ranks | 21 | S = Stufe 1–3, E = 4–6, M = 7+. Eingeweihter: ≥6 S-techniques and KiDo ≥ +14 (incl. Leiteigenschaft bonus); Meister: KiDo ≥ +18 and ≥4 E-techniques |
| "Liste der Kampftechniken" (index) | 51–52 | 4/3 text columns; discipline headers "`<X> Stufe`", bold sub-headers Angriff/Verteidigung/Finten/Geist/Leib; 219 techniques + 28 Kampfverse |
| Kampfkunst entries | 55–76 | 18pt section headers: Angriffstechniken, Verteidigungstechniken, Finten, Geistestechniken |
| Schießkunst entries | 76–80 | header Schusstechniken |
| Fechtkunst entries | 80–86 | header Fechttechniken, no weapons line |
| KiDo entries | 90–108 | headers KiDo-Angriffstechniken / -Verteidigungstechniken / -Finten / -Leibestechniken; summary boxes at x≈300 must be skipped |
| KiDo-Stile | 108–112 | style → allowed S/E/M technique lists (**out of scope**, see end) |
| Kampfverse ("Almanach der Reime") | 132–138 | same layout as Arkanum spells: 11pt title, "Kampfvers der Stufe N", optional italic "Instrument", ornament, "Schule El1 l El2", bold `Label: value` lines (no Ursprung, new `Zielgruppe`) |
| PP rule | 115 | PP go to the skills Kampfkunst/KiDo/Schießkunst (only crit. successes) — techniques themselves have **no PP** |

Technique entry layout (all 10pt):

```
<bold>  Name [(Übersetzung)] [EP0] [Variante]        e.g. "AraschiTe (Sturmhand) EP0 Attackieren"
        Stufe N[ / S|E|M] X AP [G|H|B|I…]           e.g. "Stufe 8 / M 4 AP G"
<ital>  Waffengruppen                                (Kampfkunst, Schießkunst only)
        rot/–/– beide                                (KiDo only: colors + kind)
        description …
```

A prototype of the parsers (run during planning) gave: **219 technique entries, 27 Kampfverse**, and exactly these book inconsistencies, which the plan handles explicitly:

- Index spelling errors: `Ling Hia`→`LingHia`, `YukiGamura`→`YukiGamaru`, `Cuthalions Konter`→`Cúthalions Konter`.
- Entry heading error: `KaguTobu` → `KagoTobu` (box p. 91 and index agree on KagoTobu).
- `Schwingenkeule` (Kampfkunst/Angriff, Stufe 2) is in the index but has no entry → emitted from the index with `parseWarning: true`.
- `TiKen` (KiDo/Leib, p. 107) has an entry but is missing from the index → kept.
- `Kampf im Dunkeln`: index Stufe 3, entry Stufe 2 → entry wins, warning printed.
- `Der Vers des Trotzes` appears twice in the index (3 and 7); the only entry is Stufe 7.
- `Der heilende Vers`: index Stufe 5, entry (p. 133) Stufe 8 → entry wins.
- Names repeat across disciplines (`Wegducken`, `Arnalts Adius` in Kampfkunst **and** Fechtkunst) → technique ids are `"<discipline>:<name>"`.
- Skill "KiDo" is printed as `Kido` on p. 47, while Mogadil uses `KiDo` → two separate skills after merge. Fixed with a parser name fix (no character migration needed — no saved character uses it yet).
- `types.json` contains a `ZAU` row without `isMeta`/`category`, so the 120-EP row never reaches Zauberer types. Fixed in the type parser.

## File map

Parser (`tools/scripts/RuleBookParser/`):
- Create `pdf_entry_stream.py` — reading-order `StreamLine`s with font info, `join_lines()` de-hyphenation.
- Create `armorum_index.py` — parses p. 51–52, `LEARN_COST_BY_LEVEL`.
- Create `armorum_techniques.py` — technique entries + cross-check.
- Create `armorum_verses.py` — Kampfverse entries + cross-check.
- `parse_armorum.py` holds `TECHNIQUE_RULES` (prose rules of the book as data) and writes them to `technique-rules.json`.
- Modify `pdf_skills_common.py` — optional `name_fixes`.
- Modify `pdf_types_common.py` — optional `meta_types`.
- Modify `parse_armorum.py` — wire everything, write meta, combine.
- Modify `tools/scripts/download_parse_rules_gui.py` — run the Armorum parser.

App (`src/`):
- Create `types/Technique.ts` (incl. `TechniqueRules`), `services/TechniqueService.ts` (generic evaluation of `techniqueRules`), `views/TechniquesView.vue`.
- Modify `types/Spell.ts`, `types/Character.ts`, `types/Rules.ts`, `services/RulesStorage.ts`, `services/AdvancementService.ts`, `services/CharacterService.ts`, `services/CharacterValidator.ts`, `services/SheetSkillService.ts`, `router/index.ts`, `constants/ui.ts`, `views/SpellsView.vue`, `views/CharacterView.vue`, `views/AdvancementView.vue`, `views/CharacterEditView.vue`, `help/index.md`.
- Docs: `docs/data-schema.md`, `docs/rewards.md`.

Generated files (`tools/armorum/*.json`, `tools/rules/*.json`) are **never edited by hand** — only regenerated.

All parser commands run from the repo root with:

```bash
uv run --with pdfplumber python tools/scripts/RuleBookParser/parse_armorum.py [--dry-run]
```

---

## Phase A — Parser

### Task 1: Fix `KiDo` skill id and `ZAU` meta type

**Files:**
- Modify: `tools/scripts/RuleBookParser/pdf_skills_common.py` (imports, `SkillParseConfig`, `run()`)
- Modify: `tools/scripts/RuleBookParser/pdf_types_common.py` (`TypeParseConfig`, `run_types()`)
- Modify: `tools/scripts/RuleBookParser/parse_armorum.py` (`CONFIG`, `TYPE_CONFIG`)

- [ ] **Step 1: Confirm the current defects**

Run: `grep -n '"id": "Kido"\|"id": "ZAU"' tools/armorum/skills.json tools/armorum/types.json`
Expected: one hit each (`"Kido"`, `"ZAU"` without `isMeta`).

- [ ] **Step 2: Add `name_fixes` to `SkillParseConfig`**

In `pdf_skills_common.py` change `from dataclasses import dataclass` to `from dataclasses import dataclass, field`, then extend the dataclass (after `description: str`):

```python
    description: str
    # Skill id/name corrections applied after parsing (book typo → canonical id)
    name_fixes: dict = field(default_factory=dict)
```

Add `name_fixes:   skill id corrections (printed name → canonical id)` to the class docstring attributes.

In `run()`, directly after `skill_list = build_skill_list(instances, adv_map, spell_level_costs, shield_parry_costs)` insert:

```python
        for sk in skill_list:
            fixed = config.name_fixes.get(sk["id"])
            if fixed:
                sk["id"] = sk["name"] = fixed
```

- [ ] **Step 3: Add `meta_types` to `TypeParseConfig`**

In `pdf_types_common.py`, add to the `TypeParseConfig` dataclass (next to `category_overrides`):

```python
    # type-id → fields merged into that entry (e.g. mark ZAU as meta type)
    meta_types: dict = field(default_factory=dict)
```

Document it in the docstring: `meta_types: type-id → extra fields (e.g. {"ZAU": {"isMeta": True, "category": "Zauberer"}}); applied last.`

In `run_types()`, directly before `print(f"=== Types: {len(types)} entries after merge ===")` insert:

```python
    for t in types:
        extra = config.meta_types.get(t["id"])
        if extra:
            t.update(extra)
```

- [ ] **Step 4: Configure Ars Armorum**

In `parse_armorum.py` add to `CONFIG = SkillParseConfig(...)`:

```python
    # S. 47 druckt "Kido"; kanonisch (S. 17, Mogadil) ist "KiDo"
    name_fixes={"Kido": "KiDo"},
```

and to `TYPE_CONFIG = TypeParseConfig(...)`:

```python
    # Tabelle 3, Zeile ZAU: gilt für alle Zauberer (RulesStorage wendet Meta-Typen per Kategorie an)
    meta_types={"ZAU": {"isMeta": True, "category": "Zauberer"}},
```

- [ ] **Step 5: Regenerate and verify**

Run: `uv run --with pdfplumber python tools/scripts/RuleBookParser/parse_armorum.py`
Then: `grep -n '"id": "KiDo"\|"id": "Kido"' tools/armorum/skills.json; grep -n -A3 '"id": "ZAU"' tools/armorum/types.json`
Expected: only `"KiDo"`; ZAU entry contains `"isMeta": true` and `"category": "Zauberer"`.

- [ ] **Step 6: Commit**

```bash
git add tools/scripts/RuleBookParser/pdf_skills_common.py tools/scripts/RuleBookParser/pdf_types_common.py tools/scripts/RuleBookParser/parse_armorum.py
git commit -m "fix(parser): KiDo skill id and ZAU meta type for Ars Armorum"
```

---

### Task 2: Shared reading-order line stream

**Files:**
- Create: `tools/scripts/RuleBookParser/pdf_entry_stream.py`

- [ ] **Step 1: Write the module**

```python
"""
pdf_entry_stream.py — Reading-order line stream for two-column rulebook pages.

Turns pdfplumber words into StreamLine objects (text plus font info) in
reading order: left column top→bottom, then right column, page by page.
Used by the Ars Armorum technique and Kampfvers parsers.
"""

from dataclasses import dataclass

from pdf_skills_common import fix_ligatures

COL_SPLIT = 290.0    # x boundary between the two text columns
Y_TOLERANCE = 3.0    # words whose top differs less than this form one line


@dataclass
class StreamLine:
    """One text line of one column with its dominant font attributes."""
    page: int
    column: int
    top: float
    x0: float
    text: str
    size: float      # largest font size on the line
    bold: bool       # first word uses a bold font
    italic: bool     # first word uses an italic font


def _make_line(page_no: int, column: int, words: list[dict]) -> StreamLine:
    """Build a StreamLine from the words of one visual line."""
    words = sorted(words, key=lambda w: w["x0"])
    font = words[0].get("fontname", "")
    return StreamLine(
        page=page_no,
        column=column,
        top=float(words[0]["top"]),
        x0=float(words[0]["x0"]),
        text=fix_ligatures(" ".join(w["text"] for w in words)).strip(),
        size=max(float(w.get("size", 0.0)) for w in words),
        bold="Bold" in font,
        italic="Italic" in font,
    )


def page_lines(pdf, page_no: int) -> list[StreamLine]:
    """
    Return the lines of one book page (1-based) in reading order.

    Duplicate overlay glyphs are removed (dedupe_chars), words are split
    into two columns at COL_SPLIT and grouped by their top coordinate.
    Page numbers (18pt digits) are dropped.
    """
    page = pdf.pages[page_no - 1].dedupe_chars()
    words = page.extract_words(
        x_tolerance=3, y_tolerance=3, keep_blank_chars=False,
        use_text_flow=False, extra_attrs=["size", "fontname"],
    )
    result: list[StreamLine] = []
    columns = (
        [w for w in words if w["x0"] < COL_SPLIT],
        [w for w in words if w["x0"] >= COL_SPLIT],
    )
    for column, col_words in enumerate(columns):
        col_words.sort(key=lambda w: (w["top"], w["x0"]))
        group: list[dict] = []
        for w in col_words:
            if group and abs(w["top"] - group[0]["top"]) > Y_TOLERANCE:
                result.append(_make_line(page_no, column, group))
                group = []
            group.append(w)
        if group:
            result.append(_make_line(page_no, column, group))
    return [l for l in result if l.text and not (l.size >= 16 and l.text.isdigit())]


def stream(pdf, first_page: int, last_page: int) -> list[StreamLine]:
    """Concatenate page_lines() for an inclusive book page range."""
    lines: list[StreamLine] = []
    for page_no in range(first_page, last_page + 1):
        lines.extend(page_lines(pdf, page_no))
    return lines


def join_lines(texts: list[str]) -> str:
    """
    Join wrapped text lines into one paragraph string.

    A trailing hyphen followed by a lowercase continuation is treated as
    a word break ("Ge-" + "lingt" → "Gelingt"); "KiDo-" + "Kämpfer" keeps it.
    """
    out = ""
    for t in texts:
        if out.endswith("-") and t[:1].islower():
            out = out[:-1] + t
        else:
            out = f"{out} {t}" if out else t
    return out
```

- [ ] **Step 2: Smoke test**

Run:
```bash
uv run --with pdfplumber python -c "import sys; sys.path.insert(0,'tools/scripts/RuleBookParser'); import pdfplumber; from pdf_entry_stream import page_lines; pdf=pdfplumber.open('tools/books/Ars Armorum.pdf'); [print(l.size,l.bold,l.italic,l.text) for l in page_lines(pdf,132)[:5]]"
```
Expected (first lines):
```
11.0 True False Der ablenkende Vers
10.0 False False Kampfvers der Stufe 3
14.0 False False M
14.0 False False Beherrschen Luft l Feuer
10.0 True False AP-Verbrauch: 2
```

- [ ] **Step 3: Commit**

```bash
git add tools/scripts/RuleBookParser/pdf_entry_stream.py
git commit -m "feat(parser): reading-order line stream for rulebook entries"
```

---

### Task 3: Technique index (Liste der Kampftechniken)

**Files:**
- Create: `tools/scripts/RuleBookParser/armorum_index.py`

- [ ] **Step 1: Write the module**

```python
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
```

- [ ] **Step 2: Verify counts**

Run:
```bash
uv run --with pdfplumber python -c "import sys; sys.path.insert(0,'tools/scripts/RuleBookParser'); import pdfplumber, collections; from armorum_index import parse_index; e=parse_index(pdfplumber.open('tools/books/Ars Armorum.pdf')); print(len(e), collections.Counter(x.discipline for x in e))"
```
Expected: `247` total — `Kampfverse: 28`, the remaining 219 split over Kampfkunst, Schießkunst, Fechtkunst, KiDo.

- [ ] **Step 3: Commit**

```bash
git add tools/scripts/RuleBookParser/armorum_index.py
git commit -m "feat(parser): parse Ars Armorum technique index"
```

---

### Task 4: Technique entries

**Files:**
- Create: `tools/scripts/RuleBookParser/armorum_techniques.py`

- [ ] **Step 1: Write the module**

```python
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
```

- [ ] **Step 2: Run the cross-check**

Run:
```bash
uv run --with pdfplumber python -c "import sys; sys.path.insert(0,'tools/scripts/RuleBookParser'); import pdfplumber; from armorum_index import parse_index; from armorum_techniques import parse_technique_entries, complete_from_index; pdf=pdfplumber.open('tools/books/Ars Armorum.pdf'); t,d=parse_technique_entries(pdf); ok=complete_from_index(t,d,parse_index(pdf)); print(len(t), ok)"
```
Expected:
```
  Techniques: 219 parsed, 219 in index
  Index only (added with parseWarning): [('Kampfkunst', 'Schwingenkeule')]
  Not in index (kept): [('KiDo', 'TiKen')]
  Level/form differences (entry wins): [(('Kampfkunst', 'Kampf im Dunkeln'), 3, 2)]
220 True
```
If `UNEXPECTED` lines appear, dump the page layout with `page_lines()` for the reported page and adjust the regex/fix maps — do not add an entry to `KNOWN_DEVIATIONS` without checking the book.

- [ ] **Step 3: Spot-check three entries**

Run:
```bash
uv run --with pdfplumber python -c "import sys,json; sys.path.insert(0,'tools/scripts/RuleBookParser'); import pdfplumber; from armorum_techniques import parse_technique_entries; t,d=parse_technique_entries(pdfplumber.open('tools/books/Ars Armorum.pdf')); [print(json.dumps(x,ensure_ascii=False)) for x in t if x['name'] in ('Aderlasser','AraschiTe','Abstand wahren','YoroYoschi')]"
```
Expected (fields):
- `Aderlasser`: Kampfkunst/Angriff, variant `Attackieren`, level 1, learnCost 1, apCost `"1"`, ep0 true, weapons `"Stichwaffen mit Schneide, Einhandschwerter"`.
- `AraschiTe`: KiDo/Angriff, translation `Sturmhand`, rank `M`, level 8, learnCost 20, restrictions `["G"]`, colors `["rot"]`, kind `beide`.
- `Abstand wahren`: Fechtkunst/Fecht, level 2, no `weapons`.
- `YoroYoschi`: KiDo/Leib, variant `Bewegen`, rank `S`.

- [ ] **Step 4: Commit**

```bash
git add tools/scripts/RuleBookParser/armorum_techniques.py
git commit -m "feat(parser): parse Ars Armorum Kampftechniken"
```

---

### Task 5: Kampfverse entries

**Files:**
- Create: `tools/scripts/RuleBookParser/armorum_verses.py`

- [ ] **Step 1: Write the module**

```python
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
```

- [ ] **Step 2: Verify**

Run:
```bash
uv run --with pdfplumber python -c "import sys; sys.path.insert(0,'tools/scripts/RuleBookParser'); import pdfplumber; from armorum_index import parse_index; from armorum_verses import *; pdf=pdfplumber.open('tools/books/Ars Armorum.pdf'); s,d=to_spell_entries(parse_verses(pdf)); cross_check_verses(s,parse_index(pdf)); print([x['name'] for x in s if x.get('parseWarning') or not x['elements']]); print(s[0])"
```
Expected:
```
  Kampfverse: 27 parsed, 28 index rows
  Index only: [('Der Vers des Trotzes', 3)]
  Not in index: []
[]
```
and the first spell `Der ablenkende Vers` with level 3, `elements: ['Luft', 'Feuer']`, `material: None`, `spellType: 'Wortzauber'`, `apCost: '2'`, `targetGroup: 'Gegner'`, `duration: '30 sec'`.

- [ ] **Step 3: Commit**

```bash
git add tools/scripts/RuleBookParser/armorum_verses.py
git commit -m "feat(parser): parse Ars Armorum Kampfverse as spells"
```

---

### Task 6: Wire `parse_armorum.py`, combine, GUI

**Files:**
- Modify: `tools/scripts/RuleBookParser/parse_armorum.py`
- Modify: `tools/scripts/download_parse_rules_gui.py` (after the Arkanum step, ~line 200)

- [ ] **Step 1: Extend `parse_armorum.py`**

Update the module docstring to list the new outputs (`techniques.json`, `technique-descriptions.json`, `technique-rules.json`, `spells.json`, `spell-descriptions.json`, `meta.json`, `../rules/armorum.json`). Add imports below the existing ones:

```python
import json

import pdfplumber

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
```

Add this function before `if __name__ == "__main__":`:

```python
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
```

Replace the main block:

```python
if __name__ == "__main__":
    run(CONFIG)
    run_types(TYPE_CONFIG)
    run_entries(dry_run="--dry-run" in sys.argv)
```

- [ ] **Step 2: Run the full parser**

Run: `uv run --with pdfplumber python tools/scripts/RuleBookParser/parse_armorum.py`
Then:
```bash
node -e "const d=require('./tools/rules/armorum.json'); console.log(Object.keys(d), d.metadata.version, d.techniques.length, d.techniqueDescriptions.length, d.spells.length, d.spellDescriptions.length, d.techniqueRules.disciplines.length)"
```
Expected: `[ 'metadata', 'skills', 'spellDescriptions', 'spells', 'techniqueDescriptions', 'techniqueRules', 'techniques', 'types' ]`, the imprint version (e.g. `2023; 1. Auflage`), then `220 220 27 27 4`.

- [ ] **Step 3: Add the Armorum step to the GUI pipeline**

In `download_parse_rules_gui.py`, directly after the Arkanum block (after the `dialog.append("\n")` that follows `"✓ tools/rules/arkanum.json\n"`), insert:

```python
            # --- Ars Armorum PDF Parsing ---
            dialog.append("=== Schritt 6b/7: Ars Armorum PDF parsen ===\n\n")
            armorum_script = os.path.join(TOOLS_DIR, "scripts", "RuleBookParser", "parse_armorum.py")
            armorum_pdf = os.path.join(TOOLS_DIR, "books", "Ars Armorum.pdf")
            armorum_ok = False
            if os.path.isfile(armorum_pdf):
                armorum_result = subprocess.run(
                    [sys.executable, armorum_script],
                    capture_output=True, text=True, cwd=project_dir,
                )
                armorum_ok = armorum_result.returncode == 0
                dialog.append(armorum_result.stdout[-4000:])
                if not armorum_ok and armorum_result.stderr.strip():
                    dialog.append(f"  Details: {armorum_result.stderr.strip()}\n")
            if armorum_ok:
                dialog.append("✓ tools/rules/armorum.json\n")
            else:
                dialog.append("! Ars-Armorum-PDF nicht gefunden oder Fehler im Parser – übersprungen\n")
            dialog.append("\n")
```

and in the summary block after `dialog.append(f"  - arkanum.json\n")`'s `if`:

```python
            if armorum_ok:
                dialog.append(f"  - armorum.json\n")
```

- [ ] **Step 4: Commit**

```bash
git add tools/scripts/RuleBookParser/parse_armorum.py tools/scripts/download_parse_rules_gui.py
git commit -m "feat(parser): write Armorum techniques/Kampfverse and combine rulebook"
```

---

## Phase B — App

### Task 7: Types and rules merge

**Files:**
- Create: `src/types/Technique.ts`
- Modify: `src/types/Spell.ts`, `src/types/Character.ts`, `src/types/Rules.ts`, `src/services/RulesStorage.ts:554-600`

- [ ] **Step 1: Create `src/types/Technique.ts`**

```ts
/**
 * Technique — eine Kampftechnik (z.B. aus Ars Armorum).
 * All game rules (costs, prerequisites, ranks) come from imported rule data.
 */
export interface Technique {
  /** Unique identifier: "<discipline>:<name>" (names repeat across disciplines) */
  id: string
  /** Display name (KiDo: kanthanischer Name) */
  name: string
  /** Discipline id, e.g. "Kampfkunst"; key into CharacterType.fightCosts and TechniqueRules.disciplines */
  discipline: string
  /** Angriff | Verteidigung | Finte | Geist | Schuss | Fecht | Leib */
  form: string
  /** Variante, e.g. "Attackieren", "Anstürmen", "Ausweichen" */
  variant?: string
  /** Stufe (1–10) */
  level: number
  /** Lerneinheiten (LE) */
  learnCost: number
  /** AP-Verbrauch */
  apCost: string
  /** EP0: no EP for using the technique */
  ep0: boolean
  /** Gegner-Einschränkungen (codes, labels in TechniqueRules.restrictionNames) */
  restrictions: string[]
  /** Waffengruppen */
  weapons?: string
  /** Übersetzung des Namens (KiDo) */
  translation?: string
  /** Rank id within the discipline (KiDo: S | E | M), see TechniqueDisciplineRule.ranks */
  rank?: string
  /** Erlaubte Schulfarben (KiDo) */
  colors?: string[]
  /** Art der Technik: sanft | hart | beide (KiDo) */
  kind?: string
  /** Source reference, e.g. "Ars Armorum S. 55" */
  source: string
  /** Parser could not read the full entry */
  parseWarning?: boolean
}

/**
 * TechniqueDescription — full description text for a technique.
 */
export interface TechniqueDescription {
  /** Matches Technique.id */
  id: string
  /** Full descriptive text */
  description: string
}

/**
 * TechniqueRankRule — one rank of a discipline (e.g. KiDo Schüler/Eingeweihter/Meister).
 * Ranks are ordered; a rank is reached when all its conditions and those of the previous ranks hold.
 */
export interface TechniqueRankRule {
  /** Rank id, matches Technique.rank */
  id: string
  /** Display name */
  name: string
  /** Minimum value of the discipline skill */
  minSkillValue?: number
  /** True: minSkillValue includes the Fertigkeitsbonus of the skill's linked property */
  includeBonus?: boolean
  /** Number of learned techniques of a given rank required */
  requiredTechniques?: { rank: string; count: number }
}

/**
 * TechniqueDisciplineRule — prerequisites of one discipline.
 */
export interface TechniqueDisciplineRule {
  /** Discipline id, matches Technique.discipline */
  id: string
  /** Skill that must be learned */
  skillId: string
  /** Minimum skill value (0 = learned is enough); without property bonus */
  minValue: number
  /** Optional ordered ranks restricting which techniques can be learned */
  ranks?: TechniqueRankRule[]
}

/**
 * TechniqueRules — rule data for learning techniques.
 */
export interface TechniqueRules {
  /** Lehrgeld je LE */
  goldPerLe: number
  /** Restriction code → label (e.g. "G" → "Größe") */
  restrictionNames?: Record<string, string>
  /** Disciplines in display order */
  disciplines: TechniqueDisciplineRule[]
}
```

- [ ] **Step 2: `Spell.targetGroup`**

In `src/types/Spell.ts`, after `effectArea: string`:

```ts
  /** Kampfverse: betroffene Personen (Gefährten | Verbündete | Gegner) */
  targetGroup?: string
```

- [ ] **Step 3: `Character.techniques`**

In `src/types/Character.ts`, after the `CharacterSpell` interface:

```ts
/**
 * CharacterTechnique — a Kampftechnik as it is stored on a character.
 */
export interface CharacterTechnique {
  /** Matches Technique.id from the rules data */
  techniqueId: string
}
```

and in `Character`, after `spells: CharacterSpell[]`:

```ts
  /** Kampftechniken; optional for older saves */
  techniques?: CharacterTechnique[]
```

- [ ] **Step 4: Rules types**

In `src/types/Rules.ts` add `import type { Technique, TechniqueDescription, TechniqueRules } from './Technique'`; in `RulebookData` after `spellDescriptions?`:

```ts
  techniques?: Technique[]
  techniqueDescriptions?: TechniqueDescription[]
  techniqueRules?: TechniqueRules
```

and in `RulesData` after `spellDescriptions: SpellDescription[]`:

```ts
  techniques: Technique[]
  techniqueDescriptions: TechniqueDescription[]
  techniqueRules?: TechniqueRules
```

- [ ] **Step 5: Merge in `RulesStorage.loadActive()`**

In the `rules` initializer add after `spellDescriptions: [],`:

```ts
      techniques:            [],
      techniqueDescriptions: [],
```

in the merge loop after the `spellDescriptions` line:

```ts
      if (src.techniques)            this.mergeById(rules.techniques,            src.techniques)
      if (src.techniqueDescriptions) this.mergeById(rules.techniqueDescriptions, src.techniqueDescriptions)
```

and after the `skillRules` first-wins loop:

```ts
    // Merge techniqueRules: take the first (highest priority) techniqueRules found
    for (const entry of active) {
      if (entry.data.techniqueRules && !rules.techniqueRules) {
        rules.techniqueRules = entry.data.techniqueRules
      }
    }
```

Update the AGENTS.md sentence "`skillRules`, `costColumns`, `costPatterns`, and `gradThresholds` are whole-object first-wins." to include `techniqueRules`.

- [ ] **Step 6: Typecheck**

Run: `npx vue-tsc -b`
Expected: no errors. (If another place builds a `RulesData` literal, tsc reports it — add the two empty arrays there too.)

- [ ] **Step 7: Commit**

```bash
git add src/types src/services/RulesStorage.ts AGENTS.md
git commit -m "feat: technique types and rules merge"
```

---

### Task 8: Cost and prerequisite logic (data-driven)

**Files:**
- Modify: `src/services/AdvancementService.ts`, `src/services/SheetSkillService.ts:20`, `src/services/CharacterService.ts`
- Create: `src/services/TechniqueService.ts`

The app contains **no** technique rules: EP/LE come from `type.fightCosts`, LE from `technique.learnCost`, gold/LE, prerequisites and ranks from `rules.techniqueRules`. Only the generic reward halving (`applyMode`) is app logic.

- [ ] **Step 1: `AdvancementService.techniqueLearnCost`**

Add imports `import type { Technique, TechniqueRules } from '../types/Technique'`, the result type next to `SpellLearnCost`:

```ts
/** Result of a technique learn cost calculation. */
export interface TechniqueLearnCost {
  /** EP to pay (halved and rounded up in reward mode). */
  epCost: number
  /** Teacher's gold fee (0 in reward mode). */
  goldCost: number
  /** EP per LE from type.fightCosts. */
  epPerLe: number
}
```

and the method after `spellLearnCost`:

```ts
  /**
   * Calculate EP and gold cost to learn a technique.
   *
   * EP = LE × type.fightCosts[discipline]; gold = LE × techniqueRules.goldPerLe
   * (0 if no rule data). Reward mode halves the EP and waives gold.
   *
   * @param technique - The technique to learn.
   * @param type      - The character's type.
   * @param rules     - Technique rule data from the loaded rules (optional).
   * @param mode      - Cost mode.
   * @returns The costs, or null if the type has no cost for the discipline.
   */
  techniqueLearnCost(technique: Technique, type: CharacterType, rules: TechniqueRules | undefined, mode: AdvancementMode = 'normal'): TechniqueLearnCost | null {
    const epPerLe = type.fightCosts?.[technique.discipline]
    if (epPerLe === undefined) return null
    const le = technique.learnCost
    return {
      epCost: this.applyMode(le * epPerLe, mode),
      goldCost: mode === 'reward' ? 0 : le * (rules?.goldPerLe ?? 0),
      epPerLe,
    }
  }
```

Update the class JSDoc paragraph on reward mode: "Steigern, Zauber und Techniken lernen kosten die Hälfte an EP".

- [ ] **Step 2: Export `fertigkeitsbonus`**

In `src/services/SheetSkillService.ts` change `function fertigkeitsbonus(v: number): number {` to `export function fertigkeitsbonus(v: number): number {`.

- [ ] **Step 3: `canLearnTechniques` in `CharacterService.ts`**

After `isCaster`:

```ts
/**
 * Check whether a character type has costs for techniques (fightCosts).
 *
 * @param type - The character type to check (or undefined).
 * @returns True if the type has at least one fightCosts entry.
 */
export function canLearnTechniques(type: CharacterType | undefined): boolean {
  const fc = type?.fightCosts
  return !!fc && Object.keys(fc).length > 0
}
```

- [ ] **Step 4: Create `src/services/TechniqueService.ts`**

```ts
import type { Character } from '../types/Character'
import type { Skill } from '../types/Skill'
import type { Technique, TechniqueDisciplineRule, TechniqueRankRule } from '../types/Technique'
import { fertigkeitsbonus } from './SheetSkillService'

/**
 * TechniqueService — evaluates technique prerequisites and ranks.
 * Pure functions; all rules come from TechniqueRules in the loaded rule data.
 */
export class TechniqueService {
  /**
   * Check the skill prerequisite of a discipline.
   *
   * @param character - The character.
   * @param rule      - Discipline rule from techniqueRules.
   * @returns The rule if its prerequisite is not met, otherwise null.
   */
  disciplineBlocker(character: Character, rule: TechniqueDisciplineRule): TechniqueDisciplineRule | null {
    const cs = character.skills.find(s => s.skillId === rule.skillId)
    return !cs || cs.value < rule.minValue ? rule : null
  }

  /**
   * Highest rank of a discipline the character has reached.
   * Ranks are checked in order; the first unmet rank stops the search.
   *
   * @param character  - The character.
   * @param rule       - Discipline rule with ranks.
   * @param techniques - All techniques from the rules.
   * @param skills     - All skills from the rules (for the linked property).
   * @returns The reached rank, or null if the discipline has no ranks.
   */
  currentRank(character: Character, rule: TechniqueDisciplineRule, techniques: Technique[], skills: Skill[]): TechniqueRankRule | null {
    const ranks = rule.ranks ?? []
    if (ranks.length === 0) return null
    const cs = character.skills.find(s => s.skillId === rule.skillId)
    const linked = skills.find(s => s.id === rule.skillId)?.linkedProperty as keyof Character['properties'] | undefined
    const bonus = linked && character.properties[linked] !== undefined ? fertigkeitsbonus(character.properties[linked]) : 0
    const learned = new Set((character.techniques ?? []).map(t => t.techniqueId))
    const countOf = (rank: string) =>
      techniques.filter(t => t.discipline === rule.id && t.rank === rank && learned.has(t.id)).length

    let reached = ranks[0]
    for (const rank of ranks.slice(1)) {
      if (rank.minSkillValue !== undefined) {
        if (!cs) break
        const value = cs.value + (rank.includeBonus ? bonus : 0)
        if (value < rank.minSkillValue) break
      }
      if (rank.requiredTechniques && countOf(rank.requiredTechniques.rank) < rank.requiredTechniques.count) break
      reached = rank
    }
    return reached
  }

  /**
   * True if the character's rank allows the technique.
   * Techniques without rank, or disciplines without ranks, are always allowed.
   *
   * @param technique - The technique to check.
   * @param rule      - Discipline rule (may be undefined).
   * @param reached   - Result of currentRank().
   */
  rankAllowed(technique: Technique, rule: TechniqueDisciplineRule | undefined, reached: TechniqueRankRule | null): boolean {
    const ranks = rule?.ranks ?? []
    if (!technique.rank || ranks.length === 0 || !reached) return true
    const idx = ranks.findIndex(r => r.id === technique.rank)
    return idx < 0 || idx <= ranks.findIndex(r => r.id === reached.id)
  }
}

/** Shared singleton — use this throughout the app. */
export const techniqueService = new TechniqueService()
```

- [ ] **Step 5: Typecheck**

Run: `npx vue-tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/services
git commit -m "feat: data-driven technique learn costs, prerequisites and ranks"
```

---

### Task 9: UI strings and route

**Files:**
- Modify: `src/constants/ui.ts`, `src/router/index.ts`

- [ ] **Step 1: Add strings** (UI texts only — no rule values)

In `ui.ts`, after `spells: 'Zaubersprüche',`:

```ts
  techniques: 'Kampftechniken',
```

Add `'Kampfverse': 'Kampfverse',` to `spellGroupNames`, and a new block after the SpellsView block (`spellOverviewView`):

```ts
  // ── Kampftechniken-Ansicht (TechniquesView) ───────────────────────────────────
  spellTargetGroup:      'Zielgruppe:',
  techNoCosts:           'Für diesen Charaktertyp sind keine Lernkosten für Kampftechniken hinterlegt (Regelwerk importieren).',
  techKnown:             'Bekannte Kampftechniken',
  techLearnNew:          'Neue Kampftechnik lernen',
  techEmptyLearned:      'Noch keine Kampftechniken gelernt.',
  techEmptyLearnable:    'Keine weiteren Techniken dieser Kampfkunst verfügbar.',
  techColDiscipline:     'Kampfkunst',
  techColForm:           'Form',
  techColAp:             'AP',
  techColRank:           'Rang',
  techReqMissing:        'Voraussetzung fehlt:',
  techEpPerLe:           'EP je LE:',
  techCurrentRank:       'Rang:',
  techRankNeeds:         'benötigt',
  techRankTechniques:    'Techniken des Rangs',
  techRemove:            'Entfernen',
  techRemoveConfirm:     'Technik entfernen? EP und Gold werden nicht erstattet.',
  techEp0:               'EP0 – keine eigenen EP für den Einsatz',
  techWeapons:           'Waffen:',
  techRestrictions:      'Einschränkungen:',
  techVariant:           'Variante:',
  techColors:            'Farben:',
  techKind:              'Art:',
  techParseWarning:      'Eintrag unvollständig – bitte im Regelwerk nachschlagen.',
  techErrEp:             'Nicht genug EP.',
  techErrGold:           'Nicht genug Gold.',
  techErrSave:           'Speichern fehlgeschlagen.',
```

- [ ] **Step 2: Lazy route**

In `src/router/index.ts`, after the `spells` route:

```ts
    {
      path: '/character/:id/techniques',
      name: 'techniques',
      component: () => import('../views/TechniquesView.vue'),
    },
```

(The view file is created in Task 10; commit both together.)

---

### Task 10: `TechniquesView`

**Files:**
- Create: `src/views/TechniquesView.vue`

- [ ] **Step 1: Write the view**

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { characterLoadService } from '../services/CharacterLoadService'
import { characterStorage } from '../services/CharacterStorage'
import { computeGrad } from '../services/GradUtils'
import { canLearnTechniques } from '../services/CharacterService'
import { advancementService } from '../services/AdvancementService'
import { techniqueService } from '../services/TechniqueService'
import AdvancementModeToggle from '../components/AdvancementModeToggle.vue'
import { UI } from '../constants/ui'
import { useNotifications } from '../composables/useNotifications'
import { useAdvancementMode } from '../composables/useAdvancementMode'
import type { AdvancementMode } from '../types/Advancement'
import type { Character } from '../types/Character'
import type { RulesData } from '../types/Rules'
import type { Technique } from '../types/Technique'

// ── State ─────────────────────────────────────────────────────────────────────

const route = useRoute()
const router = useRouter()

const character = ref<Character | null>(null)
const rules = ref<RulesData | null>(null)
const loading = ref(true)
const loadError = ref(false)
const { error } = useNotifications()
/** Page-level cost mode (Normal / Belohnung), shared with AdvancementView and SpellsView. */
const { advancementMode: pageMode } = useAdvancementMode()

/** The technique the player wants to learn — awaiting confirmation. */
interface PendingTechniqueAction {
  technique: Technique
  mode: AdvancementMode
  epCost: number
  goldCost: number
  epToPayWithGold: number
  maxGoldEp: number
}
const pendingAction = ref<PendingTechniqueAction | null>(null)

/** Technique whose detail popup is open. */
const infoTechnique = ref<{ technique: Technique; description: string } | null>(null)

/** Discipline id shown in the "learn" table. */
const activeDiscipline = ref('')

// ── Computed ──────────────────────────────────────────────────────────────────

const grad = computed(() => (character.value ? computeGrad(character.value.totalEs) : 0))

const charType = computed(() => {
  const c = character.value
  const r = rules.value
  if (!c || !r) return null
  return r.types.find(t => t.id === c.typeId) ?? null
})

const techniqueRules = computed(() => rules.value?.techniqueRules)

/** True if the type has fightCosts (can learn techniques). */
const canLearn = computed(() => canLearnTechniques(charType.value ?? undefined))

/** Disciplines with a cost for the type: rule order first, then remaining fightCosts keys. */
const disciplines = computed<string[]>(() => {
  const fc = charType.value?.fightCosts ?? {}
  const ordered = (techniqueRules.value?.disciplines ?? []).map(d => d.id).filter(id => fc[id] !== undefined)
  return [...ordered, ...Object.keys(fc).filter(id => !ordered.includes(id))]
})

/** Rule entry of the active discipline (may be missing). */
const disciplineRule = computed(() => techniqueRules.value?.disciplines.find(d => d.id === activeDiscipline.value))

/** Rank id → display name for a discipline. */
function rankName(discipline: string, rank: string | undefined): string {
  if (!rank) return ''
  const rule = techniqueRules.value?.disciplines.find(d => d.id === discipline)
  return rule?.ranks?.find(r => r.id === rank)?.name ?? rank
}

const learnedIds = computed(() => new Set((character.value?.techniques ?? []).map(t => t.techniqueId)))

/** Learned techniques, sorted by discipline, level, name. */
const learnedRows = computed(() => {
  const c = character.value
  const r = rules.value
  if (!c || !r) return []
  return (c.techniques ?? [])
    .map(ct => {
      const t = r.techniques.find(x => x.id === ct.techniqueId)
      return {
        id: ct.techniqueId,
        name: t?.name ?? ct.techniqueId,
        level: t?.level ?? 0,
        discipline: t?.discipline ?? '—',
        form: t?.form ?? '—',
        apCost: t?.apCost ?? '',
      }
    })
    .sort((a, b) =>
      a.discipline.localeCompare(b.discipline, 'de') || a.level - b.level || a.name.localeCompare(b.name, 'de'))
})

/** Unmet skill prerequisite of the active discipline, or null. */
const blocker = computed(() =>
  character.value && disciplineRule.value ? techniqueService.disciplineBlocker(character.value, disciplineRule.value) : null,
)

/** Reached rank in the active discipline (null if the discipline has no ranks). */
const reachedRank = computed(() => {
  const c = character.value
  const r = rules.value
  const rule = disciplineRule.value
  return c && r && rule ? techniqueService.currentRank(c, rule, r.techniques, r.skills) : null
})

/** EP per LE of the active discipline. */
const epPerLe = computed(() => charType.value?.fightCosts?.[activeDiscipline.value])

/** Techniques of the active discipline that are not learned yet, with cost and learnability. */
const learnableRows = computed(() => {
  const c = character.value
  const r = rules.value
  const type = charType.value
  const mode = pageMode.value
  if (!c || !r || !type) return []
  return r.techniques
    .filter(t => t.discipline === activeDiscipline.value && !learnedIds.value.has(t.id))
    .map(t => {
      const cost = advancementService.techniqueLearnCost(t, type, techniqueRules.value, mode)
      const rankOk = techniqueService.rankAllowed(t, disciplineRule.value, reachedRank.value)
      const epCost = cost?.epCost ?? 0
      const goldCost = cost?.goldCost ?? 0
      // Belohnung: kein EP-Ersatz durch Gold, daher nur EP prüfen
      const canAfford = c.availableEp >= epCost || (
        mode === 'normal' && c.availableEp >= Math.ceil(epCost / 2) && (c.gold ?? 0) >= goldCost
      )
      return { technique: t, epCost, rankOk, canLearn: !!cost && rankOk && !blocker.value && canAfford }
    })
    .sort((a, b) => a.technique.level - b.technique.level || a.technique.name.localeCompare(b.technique.name, 'de'))
})

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Build a "learn technique" action for the given cost mode.
 * @param technique - The technique the player selected.
 * @param mode      - Cost mode (Normal / Belohnung).
 * @returns The pending action, or null if the type has no cost for it.
 */
function buildLearnAction(technique: Technique, mode: AdvancementMode): PendingTechniqueAction | null {
  const type = charType.value
  if (!type) return null
  const cost = advancementService.techniqueLearnCost(technique, type, techniqueRules.value, mode)
  if (!cost) return null
  return {
    technique,
    mode,
    epCost: cost.epCost,
    goldCost: cost.goldCost,
    epToPayWithGold: 0,
    maxGoldEp: advancementService.maxGoldEp(cost.epCost, mode),
  }
}

/** Stage a technique to learn with the page mode — shows the confirmation modal. */
function requestLearn(technique: Technique): void {
  const action = buildLearnAction(technique, pageMode.value)
  if (action) pendingAction.value = action
}

/** Switch the cost mode of the staged action (modal toggle only). */
function switchPendingMode(mode: AdvancementMode): void {
  const action = pendingAction.value
  if (!action || action.mode === mode) return
  const rebuilt = buildLearnAction(action.technique, mode)
  if (rebuilt) pendingAction.value = rebuilt
}

/** Limit the EP-to-gold replacement to the allowed maximum. */
function clampEpGold(action: PendingTechniqueAction): void {
  if (action.epToPayWithGold > action.maxGoldEp) action.epToPayWithGold = action.maxGoldEp
}

/** Save a new character state and show errors as notifications. */
async function persist(updated: Character): Promise<void> {
  try {
    await characterStorage.save(updated)
    character.value = updated
  } catch (e) {
    error(e instanceof Error ? e.message : UI.techErrSave)
  }
}

/** Confirm the staged learn: deduct EP and gold, add the technique, save. */
async function confirmLearn(): Promise<void> {
  const action = pendingAction.value
  const char = character.value
  pendingAction.value = null
  if (!action || !char) return

  const epToPayWithGold = action.mode === 'reward' ? 0 : action.epToPayWithGold
  const epToDeduct = action.epCost - epToPayWithGold
  if (char.availableEp < epToDeduct) { error(UI.techErrEp); return }
  const epReplacementGold = epToPayWithGold * 10
  if ((char.gold ?? 0) < action.goldCost + epReplacementGold) { error(UI.techErrGold); return }

  await persist({
    ...char,
    techniques: [...(char.techniques ?? []), { techniqueId: action.technique.id }],
    availableEp: char.availableEp - epToDeduct,
    gold: (char.gold ?? 0) - action.goldCost - epReplacementGold,
    updatedAt: new Date().toISOString(),
  })
}

/** Remove a learned technique (no refund) after confirmation. */
async function removeTechnique(techniqueId: string): Promise<void> {
  const char = character.value
  if (!char || !window.confirm(UI.techRemoveConfirm)) return
  await persist({
    ...char,
    techniques: (char.techniques ?? []).filter(t => t.techniqueId !== techniqueId),
    updatedAt: new Date().toISOString(),
  })
}

/** Show the detail popup for a technique id. */
function showInfo(techniqueId: string): void {
  const r = rules.value
  const technique = r?.techniques.find(t => t.id === techniqueId)
  if (!r || !technique) return
  const description = r.techniqueDescriptions.find(d => d.id === techniqueId)?.description ?? ''
  infoTechnique.value = { technique, description }
}

/** Restriction codes → labels from the rule data (code itself as fallback). */
function restrictionLabels(codes: string[]): string {
  const names = techniqueRules.value?.restrictionNames ?? {}
  return codes.map(c => names[c] ?? c).join(', ')
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  try {
    const id = route.params.id as string
    const result = await characterLoadService.load(id)
    if (!result.character) {
      loadError.value = true
      error(`Character "${id}" not found.`, null)
      return
    }
    rules.value = result.rules
    character.value = result.character
    if (disciplines.value.length > 0) activeDiscipline.value = disciplines.value[0]
  } catch (e) {
    loadError.value = true
    error(e instanceof Error ? e.message : 'Failed to load data.', null)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="techniques-page">
    <div v-if="loading" class="status">{{ UI.loading }}</div>
    <div v-else-if="loadError" class="status error">{{ UI.failedToLoad }}</div>

    <template v-else-if="character">
      <!-- ── Header ── -->
      <header class="char-header">
        <div class="char-header-top">
          <div class="char-header-title">
            <h1>{{ character.name }}</h1>
            <span class="grad-badge">{{ UI.labelGrad }} {{ grad }}</span>
          </div>
          <nav class="sheet-nav">
            <button type="button" class="btn-nav" @click="router.push({ name: 'character-sheet', params: { id: character.id } })">{{ UI.navSheet }}</button>
            <button type="button" class="btn-nav" @click="router.push({ name: 'advancement', params: { id: character.id } })">{{ UI.navAdvancement }}</button>
            <button type="button" class="btn-nav" @click="router.push({ name: 'character-edit', params: { id: character.id } })">{{ UI.navEdit }}</button>
          </nav>
        </div>
        <div class="ep-balance-row">
          <p class="ep-balance">
            {{ UI.epAvailable }} <strong>{{ character.availableEp }}</strong>
            / {{ character.totalEs }} {{ UI.esTotal }}
            &nbsp;| {{ UI.labelGold }} <strong>{{ character.gold ?? 0 }}</strong>
          </p>
          <AdvancementModeToggle v-if="canLearn" v-model="pageMode" />
        </div>
      </header>

      <p v-if="!canLearn" class="empty-hint">{{ UI.techNoCosts }}</p>

      <template v-else>
        <!-- ── Confirmation modal ── -->
        <div v-if="pendingAction !== null" class="modal-overlay" @click.self="pendingAction = null">
          <div class="modal-box">
            <div class="modal-mode-row">
              <AdvancementModeToggle :model-value="pendingAction.mode" @update:model-value="switchPendingMode" />
            </div>
            <p>
              {{ UI.confirmLearnPfx }} <strong>{{ pendingAction.technique.name }}</strong>
              ({{ UI.colLevel }} {{ pendingAction.technique.level }}, {{ pendingAction.technique.discipline }})
              {{ UI.confirmFor }} <strong>{{ pendingAction.epCost }} {{ UI.unitEp }}</strong>?
            </p>
            <label class="gold-cost-row">
              {{ UI.advGoldLearnCost }}
              <input v-model.number="pendingAction.goldCost" type="number" min="0" class="gs-input" />
            </label>
            <template v-if="pendingAction.mode === 'normal'">
              <label class="gold-cost-row">
                {{ UI.advGoldEpReplacement }}
                <input v-model.number="pendingAction.epToPayWithGold" type="number" min="0" :max="pendingAction.maxGoldEp" class="gs-input" @input="clampEpGold(pendingAction)" />
                <span class="gold-hint">(max. {{ pendingAction.maxGoldEp * 10 }} GS = {{ pendingAction.maxGoldEp }} EP)</span>
              </label>
              <p class="ep-breakdown">
                {{ UI.advGoldEpReplaced }} {{ pendingAction.epToPayWithGold }} {{ UI.unitEp }}
                &nbsp;({{ pendingAction.epToPayWithGold * 10 }} GS) &nbsp;|&nbsp;
                {{ UI.spellsEpAfter }} {{ character.availableEp - (pendingAction.epCost - pendingAction.epToPayWithGold) }} {{ UI.unitEp }}
              </p>
            </template>
            <p v-else class="ep-breakdown">
              {{ UI.spellsEpAfter }} {{ character.availableEp - pendingAction.epCost }} {{ UI.unitEp }}
            </p>
            <div class="confirmation-buttons">
              <button
                class="btn-confirm"
                :disabled="(character.gold ?? 0) < pendingAction.goldCost + pendingAction.epToPayWithGold * 10"
                @click="confirmLearn"
              >{{ UI.confirm }}</button>
              <button class="btn-cancel" @click="pendingAction = null">{{ UI.cancel }}</button>
            </div>
          </div>
        </div>

        <!-- ── Info modal ── -->
        <div v-if="infoTechnique !== null" class="modal-overlay" @click.self="infoTechnique = null">
          <div class="modal-box modal-wide">
            <h3>
              {{ infoTechnique.technique.name }}
              <span v-if="infoTechnique.technique.translation" class="translation">({{ infoTechnique.technique.translation }})</span>
            </h3>
            <div class="info-layout">
              <div class="info-props">
                <p>{{ infoTechnique.technique.discipline }} · {{ infoTechnique.technique.form }}</p>
                <p>
                  <span class="detail-label">{{ UI.colLevel }}</span> {{ infoTechnique.technique.level }}
                  <template v-if="infoTechnique.technique.rank"> / {{ rankName(infoTechnique.technique.discipline, infoTechnique.technique.rank) }}</template>
                </p>
                <p><span class="detail-label">{{ UI.techColAp }}</span> {{ infoTechnique.technique.apCost }}</p>
                <p v-if="infoTechnique.technique.variant"><span class="detail-label">{{ UI.techVariant }}</span> {{ infoTechnique.technique.variant }}</p>
                <p v-if="infoTechnique.technique.weapons"><span class="detail-label">{{ UI.techWeapons }}</span> {{ infoTechnique.technique.weapons }}</p>
                <p v-if="infoTechnique.technique.restrictions.length > 0">
                  <span class="detail-label">{{ UI.techRestrictions }}</span> {{ restrictionLabels(infoTechnique.technique.restrictions) }}
                </p>
                <p v-if="infoTechnique.technique.colors && infoTechnique.technique.colors.length > 0">
                  <span class="detail-label">{{ UI.techColors }}</span> {{ infoTechnique.technique.colors.join(', ') }}
                </p>
                <p v-if="infoTechnique.technique.kind"><span class="detail-label">{{ UI.techKind }}</span> {{ infoTechnique.technique.kind }}</p>
                <p v-if="infoTechnique.technique.ep0" class="hint">{{ UI.techEp0 }}</p>
                <p v-if="infoTechnique.technique.parseWarning" class="warning">{{ UI.techParseWarning }}</p>
                <p><span class="detail-label">Quelle:</span> {{ infoTechnique.technique.source }}</p>
              </div>
              <div v-if="infoTechnique.description" class="info-desc">{{ infoTechnique.description }}</div>
            </div>
            <div class="confirmation-buttons">
              <button class="btn-cancel" @click="infoTechnique = null">{{ UI.close }}</button>
            </div>
          </div>
        </div>

        <!-- ── Learned techniques ── -->
        <section>
          <h2>{{ UI.techKnown }}</h2>
          <table v-if="learnedRows.length > 0" class="tech-table">
            <thead>
              <tr>
                <th>{{ UI.colLevel }}</th>
                <th>{{ UI.labelName }}</th>
                <th></th>
                <th>{{ UI.techColDiscipline }}</th>
                <th>{{ UI.techColForm }}</th>
                <th>{{ UI.techColAp }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in learnedRows" :key="row.id">
                <td class="col-level">{{ row.level }}</td>
                <td>{{ row.name }}</td>
                <td><button class="btn-info" @click="showInfo(row.id)">{{ UI.spellDetailView }}</button></td>
                <td>{{ row.discipline }}</td>
                <td>{{ row.form }}</td>
                <td>{{ row.apCost }}</td>
                <td><button class="btn-info" @click="removeTechnique(row.id)">{{ UI.techRemove }}</button></td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty-hint">{{ UI.techEmptyLearned }}</p>
        </section>

        <!-- ── Learn new technique ── -->
        <section>
          <h2>{{ UI.techLearnNew }}</h2>
          <div class="discipline-tabs">
            <button
              v-for="d in disciplines"
              :key="d"
              type="button"
              class="tab"
              :class="{ 'tab--active': d === activeDiscipline }"
              @click="activeDiscipline = d"
            >{{ d }}</button>
          </div>
          <p class="discipline-info">
            {{ UI.techEpPerLe }} <strong>{{ epPerLe ?? '—' }}</strong>
            <template v-if="reachedRank">
              &nbsp;| {{ UI.techCurrentRank }} <strong>{{ reachedRank.name }}</strong>
            </template>
          </p>
          <ul v-if="disciplineRule?.ranks && disciplineRule.ranks.length > 1" class="rank-list">
            <template v-for="rank in disciplineRule.ranks" :key="rank.id">
              <li v-if="rank.minSkillValue !== undefined || rank.requiredTechniques">
                {{ rank.name }} {{ UI.techRankNeeds }}
                <template v-if="rank.minSkillValue !== undefined">{{ disciplineRule.skillId }}+{{ rank.minSkillValue }}</template>
                <template v-if="rank.requiredTechniques">
                  , {{ rank.requiredTechniques.count }} {{ UI.techRankTechniques }} {{ rankName(disciplineRule.id, rank.requiredTechniques.rank) }}
                </template>
              </li>
            </template>
          </ul>
          <p v-if="blocker" class="warning">
            {{ UI.techReqMissing }} {{ blocker.skillId }}<template v-if="blocker.minValue > 0">+{{ blocker.minValue }}</template>
          </p>
          <table v-if="learnableRows.length > 0" class="tech-table">
            <thead>
              <tr>
                <th>{{ UI.colLevel }}</th>
                <th v-if="reachedRank">{{ UI.techColRank }}</th>
                <th>{{ UI.labelName }}</th>
                <th></th>
                <th>{{ UI.techColForm }}</th>
                <th>{{ UI.techColAp }}</th>
                <th>{{ UI.colCost }}<span v-if="pageMode === 'reward'" class="reward-marker"> {{ UI.advCostRewardMarker }}</span></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in learnableRows" :key="row.technique.id" :class="{ 'row-locked': !row.rankOk }">
                <td class="col-level">{{ row.technique.level }}</td>
                <td v-if="reachedRank">{{ row.technique.rank ?? '' }}</td>
                <td>{{ row.technique.name }}</td>
                <td><button class="btn-info" @click="showInfo(row.technique.id)">{{ UI.spellDetailView }}</button></td>
                <td>{{ row.technique.form }}<template v-if="row.technique.variant"> ({{ row.technique.variant }})</template></td>
                <td>{{ row.technique.apCost }}</td>
                <td>{{ row.epCost }} {{ UI.unitEp }}</td>
                <td>
                  <button :disabled="!row.canLearn || pendingAction !== null" @click="requestLearn(row.technique)">
                    {{ UI.learnBtn }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty-hint">{{ UI.techEmptyLearnable }}</p>
        </section>
      </template>
    </template>
  </main>
</template>

<style scoped>
.techniques-page { max-width: 900px; margin: 0 auto; padding: 1.5rem; font-family: sans-serif; }
.status { color: #555; }
.status.error { color: #c00; }
.char-header { margin-bottom: 1.5rem; }
.char-header-top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.char-header-title { display: flex; align-items: center; gap: 0.75rem; }
.char-header-title h1 { margin: 0; }
.grad-badge { background: #2a4a7a; color: #fff; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.85em; font-weight: 600; white-space: nowrap; }
.sheet-nav { display: flex; align-items: center; gap: 0.5rem; }
.ep-balance-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; flex-wrap: wrap; margin-top: 0.4rem; }
.ep-balance { margin: 0; color: #444; }
section { margin-bottom: 2rem; }
section h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin: 0 0 0.75rem; }
.tech-table { width: 100%; border-collapse: collapse; }
.tech-table th, .tech-table td { text-align: left; padding: 0.35rem 0.6rem; border-bottom: 1px solid #eee; font-size: 0.9em; }
.tech-table th { background: #f0f0f0; }
.col-level { text-align: center; width: 3.5rem; }
.row-locked td { color: #999; }
.empty-hint { color: #888; font-size: 0.9em; font-style: italic; }
.warning { color: #a05a00; font-size: 0.9em; }
.hint { color: #666; font-size: 0.85em; font-style: italic; }
.discipline-tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.tab { padding: 0.3rem 0.8rem; border: 1px solid #bbb; border-radius: 3px; background: #f5f5f5; cursor: pointer; }
.tab--active { background: #2a4a7a; border-color: #2a4a7a; color: #fff; }
.discipline-info { font-size: 0.9em; color: #444; margin: 0 0 0.5rem; }
.rank-list { font-size: 0.85em; color: #666; margin: 0 0 0.5rem; padding-left: 1.2rem; }
.reward-marker { color: #8a7400; font-size: 0.85em; font-weight: 400; text-transform: none; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-box { background: #fffbe6; border: 1px solid #e6c800; border-radius: 6px; padding: 1.5rem 1.75rem; max-width: 480px; width: 90%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25); }
.modal-box p { margin: 0 0 0.75rem; }
.modal-wide { max-width: 700px; }
.modal-mode-row { display: flex; justify-content: flex-end; margin-bottom: 0.75rem; }
.gold-cost-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; font-size: 0.9em; color: #555; }
.gs-input { width: 5rem; padding: 0.25rem 0.4rem; border: 1px solid #aaa; border-radius: 3px; font-size: 1rem; text-align: right; }
.gold-hint { font-size: 0.8em; color: #888; }
.ep-breakdown { font-size: 0.9em; color: #444; margin-top: 0.25rem; }
.confirmation-buttons { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.translation { font-weight: 400; color: #666; font-size: 0.85em; }
.info-layout { display: flex; gap: 1.5rem; margin-bottom: 1rem; flex: 1; min-height: 0; overflow: hidden; }
.info-props { flex: 0 0 auto; min-width: 240px; max-width: 280px; }
.info-props p { margin: 0.15rem 0; font-size: 0.85em; line-height: 1.4; }
.info-desc { flex: 1; font-size: 0.9em; line-height: 1.5; color: #444; white-space: pre-wrap; overflow-y: auto; min-height: 0; }
.detail-label { font-weight: 600; color: #555; display: inline-block; min-width: 6rem; }
.btn-info { padding: 0.2rem 0.5rem; background: #f5f5f5; border: 1px solid #bbb; border-radius: 3px; cursor: pointer; font-size: 0.8em; }
.btn-info:hover { background: #e8e8e8; }
@media (max-width: 600px) {
  .info-layout { flex-direction: column; overflow-y: auto; }
  .info-props { max-width: none; }
}
</style>
```

- [ ] **Step 2: Typecheck**

Run: `npx vue-tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/constants/ui.ts src/router/index.ts src/views/TechniquesView.vue
git commit -m "feat: Kampftechniken page"
```

---

### Task 11: Wiring — navigation, sheet, edit view, validator, Kampfverse display

**Files:**
- Modify: `src/views/CharacterView.vue` (imports ~line 10, computed near `spellRows` ~line 173, nav ~line 459, section after spells ~line 765)
- Modify: `src/views/AdvancementView.vue:589`
- Modify: `src/views/SpellsView.vue` (nav ~line 325, info modal ~line 405)
- Modify: `src/views/CharacterEditView.vue:463-468`
- Modify: `src/services/CharacterValidator.ts:33, 716`

- [ ] **Step 1: CharacterView — nav link and sheet section**

Change the import to `import { isCaster as checkCaster, canLearnTechniques, resolveName } from '../services/CharacterService'`. Add after the `isCaster` computed:

```ts
/** True if the character's type has fightCosts (can learn Kampftechniken). */
const hasTechniques = computed(() => {
  const c = character.value; const r = rules.value
  if (!c || !r) return false
  return canLearnTechniques(r.types.find(x => x.id === c.typeId))
})

/** Learned Kampftechniken for the sheet, sorted by discipline, level, name. */
const techniqueRows = computed(() => {
  const c = character.value; const r = rules.value
  if (!c || !r) return []
  return (c.techniques ?? [])
    .map(ct => {
      const t = r.techniques.find(x => x.id === ct.techniqueId)
      return { id: ct.techniqueId, name: t?.name ?? ct.techniqueId, level: t?.level ?? 0, discipline: t?.discipline ?? '—', apCost: t?.apCost ?? '' }
    })
    .sort((a, b) => a.discipline.localeCompare(b.discipline, 'de') || a.level - b.level || a.name.localeCompare(b.name, 'de'))
})
```

In the nav, after the spells `router-link`:

```html
          <router-link
            v-if="hasTechniques && !isUnsupportedType"
            :to="{ name: 'techniques', params: { id: character.id } }"
            class="btn-nav"
          >{{ UI.techniques }}</router-link>
```

After the closing `</section>` of the spells card:

```html
      <!-- ── Kampftechniken ── -->
      <section v-if="techniqueRows.length > 0" class="card">
        <div class="section-header">
          <h2>{{ UI.techniques }}</h2>
        </div>
        <table class="skill-table">
          <thead>
            <tr>
              <th>{{ UI.colLevel }}</th>
              <th>{{ UI.labelName }}</th>
              <th>{{ UI.techColDiscipline }}</th>
              <th>{{ UI.techColAp }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in techniqueRows" :key="row.id">
              <td>{{ row.level }}</td>
              <td>{{ row.name }}</td>
              <td>{{ row.discipline }}</td>
              <td>{{ row.apCost }}</td>
            </tr>
          </tbody>
        </table>
      </section>
```

- [ ] **Step 2: AdvancementView and SpellsView nav buttons**

In `AdvancementView.vue`, after the spells nav button (line ~589):

```html
            <button v-if="charType?.fightCosts && Object.keys(charType.fightCosts).length > 0" type="button" class="btn-nav" @click="router.push({ name: 'techniques', params: { id: character.id } })">{{ UI.techniques }}</button>
```

In `SpellsView.vue`, after the `navAdvancement` button in the header nav:

```html
            <button v-if="charType?.fightCosts && Object.keys(charType.fightCosts).length > 0" type="button" class="btn-nav" @click="router.push({ name: 'techniques', params: { id: character.id } })">{{ UI.techniques }}</button>
```

- [ ] **Step 3: SpellsView — show Zielgruppe, hide empty fields for Kampfverse**

In the spell info modal (`spell-info-details`), replace the `Reichweite`, `Wirkungsbereich` and `Ursprung` lines with:

```html
                  <p v-if="infoSpellRow.spell.range"><span class="detail-label">Reichweite:</span> {{ infoSpellRow.spell.range }}</p>
                  <p><span class="detail-label">Wirkungsziel:</span> {{ infoSpellRow.spell.targetType }}</p>
                  <p v-if="infoSpellRow.spell.effectArea"><span class="detail-label">Wirkungsbereich:</span> {{ infoSpellRow.spell.effectArea }}</p>
                  <p v-if="infoSpellRow.spell.targetGroup"><span class="detail-label">{{ UI.spellTargetGroup }}</span> {{ infoSpellRow.spell.targetGroup }}</p>
                  <p><span class="detail-label">Wirkungsdauer:</span> {{ infoSpellRow.spell.duration }}</p>
                  <p v-if="infoSpellRow.spell.origin"><span class="detail-label">Ursprung:</span> {{ infoSpellRow.spell.origin }}</p>
```

(keep the existing `Wirkungsziel`/`Wirkungsdauer` lines only once — the block above replaces lines 402–406 completely).

- [ ] **Step 4: CharacterEditView — keep techniques on save**

In `save()`, inside `if (existing) { … }` after `character.inventory = existing.inventory`:

```ts
        character.techniques = existing.techniques
```

- [ ] **Step 5: Validator — unknown techniques**

In `CharacterValidator.validate()`, after `this.validateCategoryD(character, rules, issues)`:

```ts
    // Kampftechniken
    this.validateTechniques(character, rules, issues)
```

Add after `validateCategoryD`:

```ts
  // ── Kampftechniken ─────────────────────────────────────────────────────────

  private validateTechniques(character: Character, rules: RulesData, issues: ValidationIssue[]): void {
    for (const ct of character.techniques ?? []) {
      if (!rules.techniques.some(t => t.id === ct.techniqueId)) {
        issues.push({
          path: `techniques.${ct.techniqueId}`,
          severity: 'warning',
          code: 'UNKNOWN_TECHNIQUE',
          message: `Kampftechnik "${ct.techniqueId}" nicht im Regelwerk gefunden`,
          actual: ct.techniqueId,
        })
      }
    }
  }
```

- [ ] **Step 6: Typecheck and build**

Run: `npm run build`
Expected: build succeeds; `dist/assets/` contains a separate `TechniquesView-*.js` chunk (route stays lazy).

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: wire Kampftechniken into sheet, navigation, edit and validation"
```

---

### Task 12: Docs and help

**Files:**
- Modify: `docs/data-schema.md`, `docs/rewards.md`, `src/help/index.md`

- [ ] **Step 1: `docs/data-schema.md`**

- In the `RulebookData` structure example (after `"spellDescriptions": [...],`) add `"techniques": [...],` and `"techniqueDescriptions": [...],`; same in the `RulesData` example.
- In the `spells` field table add a row: `| targetGroup | string *(optional)* | Kampfverse: Gefährten / Verbündete / Gegner |`, and note under the section: "Kampfverse (Ars Armorum) are spells with `spellGroup: "Kampfverse"`, `effectArea: "15 m Umkreis"`, `origin: "göttlich"`."
- New section after `spellDescriptions`:

````markdown
### `techniques` — Kampftechniken (`Technique`)

```json
{
  "id": "KiDo:AraschiTe",
  "name": "AraschiTe",
  "discipline": "KiDo",
  "form": "Angriff",
  "variant": "Attackieren",
  "level": 8,
  "learnCost": 20,
  "apCost": "4",
  "ep0": true,
  "restrictions": ["G"],
  "translation": "Sturmhand",
  "rank": "M",
  "colors": ["rot"],
  "kind": "beide",
  "source": "Ars Armorum S. 90"
}
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | `string` | `"<discipline>:<name>"` — Namen wiederholen sich zwischen Kampfkünsten |
| `discipline` | `string` | z.B. `Kampfkunst`, `Fechtkunst`, `Schießkunst`, `KiDo` — Schlüssel in `type.fightCosts` und `techniqueRules.disciplines` |
| `form` | `string` | `Angriff`, `Verteidigung`, `Finte`, `Geist`, `Schuss`, `Fecht`, `Leib` |
| `variant` | `string` *(optional)* | z.B. `Attackieren`, `Anstürmen`, `Ausweichen` |
| `level` / `learnCost` | `number` | Stufe und LE (1,1,2,3,5,10,15,20,30,40) |
| `apCost` | `string` | AP-Verbrauch |
| `ep0` | `boolean` | EP0-Kennzeichnung |
| `restrictions` | `string[]` | Gegner-Einschränkungen `G`, `H`, `B`, `I` |
| `weapons` | `string` *(optional)* | Waffengruppen (Kampfkunst, Schießkunst) |
| `translation`, `colors`, `kind` | *(optional)* | KiDo: Übersetzung, Schulfarben, sanft/hart/beide |
| `rank` | `string` *(optional)* | Rang-ID innerhalb der Kampfkunst (KiDo: `S`/`E`/`M`), siehe `techniqueRules` |
| `parseWarning` | `boolean` *(optional)* | Eintrag unvollständig geparst |

### `techniqueDescriptions` — Volltext (`TechniqueDescription`)

`{ "id": "<Technique.id>", "description": "…" }`

### `techniqueRules` — Lernregeln für Techniken (`TechniqueRules`)

Whole-object first-wins (like `skillRules`). Die App enthält keine dieser Regeln selbst.

```json
{
  "goldPerLe": 100,
  "restrictionNames": { "G": "Größe", "H": "humanoider Körperbau", "B": "hochbeiniger Körperbau", "I": "menschliche Intelligenz" },
  "disciplines": [
    { "id": "Kampfkunst", "skillId": "Kampfkunst", "minValue": 0 },
    { "id": "Fechtkunst", "skillId": "Fechten", "minValue": 12 },
    { "id": "KiDo", "skillId": "KiDo", "minValue": 0, "ranks": [
      { "id": "S", "name": "Schüler" },
      { "id": "E", "name": "Eingeweihter", "minSkillValue": 14, "includeBonus": true, "requiredTechniques": { "rank": "S", "count": 6 } }
    ] }
  ]
}
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `goldPerLe` | `number` | Lehrgeld je LE |
| `restrictionNames` | `object` *(optional)* | Code → Bezeichnung der Gegner-Einschränkungen |
| `disciplines[].skillId` / `minValue` | `string` / `number` | Fertigkeit, die gelernt sein muss, und Mindestwert (ohne Leiteigenschaftsbonus) |
| `disciplines[].ranks` | `array` *(optional)* | Geordnete Ränge; ein Rang gilt, wenn er und alle vorherigen erfüllt sind. `minSkillValue` (+ `includeBonus` = mit Fertigkeitsbonus der Leiteigenschaft), `requiredTechniques` = Anzahl gelernter Techniken eines Rangs |
````

- In the Character section add `"techniques": [{ "techniqueId": "Kampfkunst:Aderlasser" }]` to the example and a sub-section:

```markdown
### `techniques` — Erlernte Kampftechniken *(optional)*

| Feld | Typ | Beschreibung |
|---|---|---|
| `techniqueId` | `string` | Referenz auf `Technique.id`. Techniken haben keine PP. |
```

- [ ] **Step 2: `docs/rewards.md`**

Add a table row after "Learn spell":

```markdown
| Learn Kampftechnik (Ars Armorum) | full EP + 100 GS per LE | **½ EP**, **0 GS** |
```

- [ ] **Step 3: Help topic**

In `src/help/index.md` add `- [Wie lerne ich Kampftechniken?](#wie-lerne-ich-kampftechniken)` to the table of contents (after "Wie steigere ich Fertigkeiten?") and a section before "Wie verwalte ich Regelwerke?":

```markdown
## Wie lerne ich Kampftechniken?

Mit dem Regelwerk **Ars Armorum** erscheint für Typen mit Lernkosten für Kampftechniken der Button **Kampftechniken**.

- Wähle oben die Kampfkunst (Kampfkunst, Fechtkunst, Schießkunst, KiDo). Angezeigt werden die EP je LE deines Typs.
- Voraussetzungen (z.B. welche Fertigkeit gelernt sein muss) kommen aus dem importierten Regelwerk und werden über der Tabelle angezeigt, wenn sie fehlen.
- Hat eine Kampfkunst Ränge (z.B. KiDo), siehst du deinen aktuellen Rang und was für den nächsten Rang nötig ist. Techniken höherer Ränge sind ausgegraut.
- Die Kosten: LE der Technik × EP je LE deines Typs, dazu das Lehrgeld laut Regelwerk. Mit **Belohnung** zahlst du die halben EP und kein Gold.
- **Kampfverse** der Skalden und Barden lernst du wie Zaubersprüche auf der Seite **Zaubersprüche**.
```

- [ ] **Step 4: Commit**

```bash
git add docs/data-schema.md docs/rewards.md src/help/index.md
git commit -m "docs: Kampftechniken data schema, reward rule and help"
```

---

### Task 13: End-to-end verification

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 2: Manual check in the dev server** (`npm run dev`)

1. Rules page: import `tools/rules/armorum.json` (plus Kodex/Arkanum as usual). No merge-conflict warnings for `KiDo` in the console.
2. Create a **Waffenmeister (Wm)** with Kampfkunst learned and ≥ 100 EP, 200 GS. Sheet shows **Kampftechniken** button.
3. Tab *Kampfkunst*: EP je LE = 30. `Aderlasser` (Stufe 1) costs 30 EP; learn in normal mode → EP −30, Gold −100. Toggle *Belohnung* on a Stufe-3 technique (2 LE): 30 EP, 0 GS.
4. Tab *Fechtkunst* with Fechten < 12: warning "Voraussetzung fehlt: Fechten+12" (value from `techniqueRules`), all learn buttons disabled.
4b. Rule-free check: `grep -n "Fechten" src/services/TechniqueService.ts src/views/TechniquesView.vue` finds nothing (all rule values come from `techniqueRules`).
5. **KiDoka (KD)** with KiDo learned: tab *KiDo* shows rank *Schüler*; E/M rows greyed out; EP je LE = 30.
6. **Skalde (Sk)**: spell page lists Kampfverse; `Der Reim der Gelassenheit` (Stufe 1) costs 30 EP; info modal shows Zielgruppe, no empty Reichweite/Ursprung.
7. **Magier (Ma)**: Kampftechniken page shows 120 EP je LE (ZAU meta row applied).
8. Edit and save a character with techniques → techniques still present. Sheet lists them.

- [ ] **Step 3: Final commit** (only if verification required fixes)

---

## Out of scope (follow-ups)

- **KiDo-Stile** (S. 108–112): restricting KiDo techniques to the character's school style (and the "half cost to replace a technique" rule). Needs a `kidoStyles` section parsed from p. 108–112 and `Character.kidoStyleId`. Until then the GM is responsible for style compliance.
- Kampfwüter/Waffenmeister get Kampfkunst for free at weapon +12; KiDoka gets KiDo free after TaiTschi+12 and waffenloser Kampf+12 (S. 42) — currently the player adds the skill manually.
- Weapon prerequisites per technique (Angriff+12 with a matching weapon group, Schild+5) — shown as text only.
- Elf surcharge (+6 EP je LE) — not applied for spells either.
- LaTeX export of techniques.
````
