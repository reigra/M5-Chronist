"""
Parse Mogadil Lerntabellen PDF into skills JSON.

JSON structure for PWA lookup of region-based skill costs:

    costColumns: ["As", "Ba", "Bb", ...]  — 63 column names, shared across all skills
    costPatterns: [[...], [...], ...]      — 23 unique 63-value arrays

    Each skill references its pattern by index:
      skill.costPatternId = 0..22

    PWA lookup:
      const colMap = new Map(costColumns.map((name, i) => [name, i]))
      const pattern = costPatterns[skill.costPatternId]  // 63-element array
      const colIdx = colMap.get("As")                     // column index
      const value = pattern[colIdx]                       // cost for this skill/column

    Three values are stored not here but in advancementCosts / baseValue / learnCost
    derived from the LE/TE table on page 1 (see extract_advancement_costs).
"""

import json
import os
import re
import subprocess
import sys

from helpers import get_app_version

try:
    import pdfplumber
except ImportError:
    print('pdfplumber nicht gefunden — installiere automatisch ...')
    cmd = [sys.executable, '-m', 'pip', 'install', 'pdfplumber', '-q', '--no-warn-script-location']
    try:
        subprocess.check_call(cmd)
    except subprocess.CalledProcessError:
        cmd.append('--break-system-packages')
        subprocess.check_call(cmd)
    import pdfplumber

SKILL_NAME_CORRECTIONS = {
    'Kampf ohne Waffen': 'Waffenloser Kampf',
    'Schreiben:Sprache': 'Schreiben',
    'Sprechen:Sprache': 'Sprechen',
}

SOURCE_MAP: dict[str, str] = {
    'ARK': 'Das Arkanum',
    'ARS': 'Ars Armorum',
    'Era': 'Cuanscadan - Tor nach Erainn',
    'Esc': 'Die Pyramiden von Eschar',
    'KOD': 'Der Kodex',
    'KTP': 'KanThaiPan - Unter dem Schirm des Jadekaisers',
    'Küs': 'Das Spiel der großen Häuser',
    'MAN': 'Das Manual',
    'Mor': 'Moravod - Tor zur Anderswelt',
    'MYS': 'Das Mysterium',
    'Raw': 'Das Erbe der Löwensöhne',
    'Wae': 'Waeland - Die Krieger des Nordens',
    'ZwQ': 'Die Meister von Feuer und Stein',
}

# Category → ResBk/ResBg propertyBonuses mapping.
# Mirrors the ZAU/KAE derivation in parse_EVA_kodex.py:
#   KAE=true           → ResBk +1        (Kämpfer + KampfZauberer)
#   ZAU=true, !KAE     → ResBk +2, ResBg +2  (Zauberer)
CATEGORY_BONUSES: dict[str, list[dict]] = {
    'Kämpfer':        [{'id': 'ResBk', 'value': 1, 'mode': 'add'}],
    'KampfZauberer':  [{'id': 'ResBk', 'value': 1, 'mode': 'add'}],
    'Zauberer':       [{'id': 'ResBk', 'value': 2, 'mode': 'add'},
                        {'id': 'ResBg', 'value': 2, 'mode': 'add'}],
}

# AP-Gain-Bonus pro Kategorie (für Gradaufstiegs-Popup).
# Wird nach _derive_category() auf type['apGain'] gesetzt.
CATEGORY_AP_GAIN: dict[str, int] = { 'Kämpfer': 2, 'KampfZauberer': 2, 'Zauberer': 1 }
AP_GAIN_OVERRIDES: dict[str, int]  = { 'Kr': 3, 'Ba': 3, 'Wä': 3 }

# M5-Gradaufstiegs-Regeln (hartcodierte Spielkonstante, identisch zu parse_EVA_kodex.py).
# Wird in den universalRules-Output geschrieben.
M5_GRADUP_RULES = {
    'apDice': '1W3',
    'propertyGainDice': '1W3',
    'propertyMaxValue': 100,
    'propertyGainTable': [
        { 'range': [1, 50],   'property': None },
        { 'range': [51, 55],  'property': 'Wk' },
        { 'range': [56, 60],  'property': 'pA' },
        { 'range': [61, 65],  'property': 'Au' },
        { 'range': [66, 70],  'property': 'St' },
        { 'range': [71, 75],  'property': 'Gs' },
        { 'range': [76, 80],  'property': 'Gw' },
        { 'range': [81, 85],  'property': 'Ko' },
        { 'range': [86, 90],  'property': 'In' },
        { 'range': [91, 95],  'property': 'Zt' },
        { 'range': [96, 100], 'property': 'free' },
    ]
}

# Hardcoded overrides for types misclassified by the heuristic below.
# PS (Priester Streiter) has Waffen cost 30 but is a pure Zauberer.
CATEGORY_OVERRIDES: dict[str, str] = {
    'PS': 'Zauberer',
}

PDF_DIR = os.path.join(os.path.dirname(__file__), '..', 'Mogadil')
_MOGADIL_FILES = [f for f in os.listdir(PDF_DIR) if f.startswith('Lerntabellen_') and f.endswith('.pdf')]
if not _MOGADIL_FILES:
    raise FileNotFoundError(f'No Lerntabellen_*.pdf found in {PDF_DIR}')
_MOGADIL_FILES.sort(reverse=True)
PDF_PATH = os.path.join(PDF_DIR, _MOGADIL_FILES[0])
OUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'rules', 'mogadil.json')


def extract_version(pdf_path: str) -> str:
    basename = os.path.basename(pdf_path)
    m = re.search(r'(\d+)_(\d+)_(\d+)', basename)
    if m:
        return f'{m.group(1)}.{m.group(2)}.{m.group(3)}'
    return 'unknown'


def _cell(text):
    """Normalize a cell value from pdfplumber (None → '')."""
    return '' if text is None else str(text).strip()


def _split_letter(prop: str, letter: str):
    """If letter is empty but prop ends with a single letter, split it.

    Pdfplumber sometimes merges 'In' and 'F' into 'In F'.
    """
    if not letter and ' ' in prop:
        parts = prop.rsplit(' ', 1)
        if len(parts[1]) == 1 or parts[1] in ('P-Z',):
            prop = parts[0]
            letter = parts[1]
    return prop, letter


def _fix_merged_cells(row: list):
    """Pdfplumber merges adjacent cost cells in some tables (e.g. '20 20').

    Split such cells and redistribute into None-filled neighbour cells.
    """
    out = []
    i = 0
    while i < len(row):
        cell = _cell(row[i])
        if ' ' in cell and all(p.isdigit() for p in cell.split()):
            parts = cell.split()
            out.extend(parts)
            if i + 1 < len(row) and _cell(row[i + 1]) == '':
                i += 1
        else:
            out.append(cell)
        i += 1
    return out


def _resolve_source(source_raw: str) -> str:
    """Replace known abbreviations in a "Quelle / Bemerkung" cell with full book names.

    "KOD S.101"                        → "Der Kodex S.101"
    "ARK Das Arkanum"                  → "Das Arkanum"  (already has full name)
    "Mor S.132, Era S.42, Esc S.133"  → "Moravod - Tor zur Anderswelt S.132, Cuanscadan - Tor nach Erainn S.42, Die Pyramiden von Eschar S.133"
    """
    if not source_raw:
        return ''
    # Replace abbreviations only when they appear as whole words (word boundaries)
    result = source_raw
    for abbr, full in sorted(SOURCE_MAP.items(), key=lambda x: -len(x[0])):
        result = re.sub(rf'\b{re.escape(abbr)}\b', full, result)
    return result


def _derive_category(type_id: str, spell_costs: dict | None, waffen_cost: int | None) -> str:
    """Determine the character type category (Kämpfer/KampfZauberer/Zauberer).

    Derivation rules:
      1. Hardcoded override in CATEGORY_OVERRIDES wins first.
      2. No spellCosts → Kämpfer.
      3. spellCosts present + Waffen cost >= 40 → Zauberer.
      4. Otherwise → KampfZauberer.

    Returns the category string.
    """
    if type_id in CATEGORY_OVERRIDES:
        return CATEGORY_OVERRIDES[type_id]

    if not spell_costs:
        return 'Kämpfer'

    effective_waffen = waffen_cost if waffen_cost is not None else 0
    if effective_waffen >= 40:
        return 'Zauberer'

    return 'KampfZauberer'


def _int_cell(text):
    """Parse a cell value as int, or None if not parseable."""
    s = _cell(text)
    try:
        return int(s)
    except ValueError:
        return None


def _parse_advancement_row(row: list, col_headers: list) -> dict | None:
    """Parse one LE/TE row into {baseValue, learnCost, costs} or None."""
    letter = _cell(row[0])
    if not letter or len(letter) > 2:
        return None

    paren_col = None
    paren_value = None
    for c in range(1, len(row)):
        cell = _cell(row[c])
        m = re.search(r'\((\d+)\)', cell)
        if m:
            paren_col = c
            paren_value = int(m.group(1))
            break

    if paren_col is None:
        return None

    header_idx = paren_col - 1
    if header_idx >= len(col_headers) or col_headers[header_idx] is None:
        return None

    base_value = col_headers[header_idx]
    learn_cost = paren_value // 3

    advancement_costs = []
    for c in range(paren_col + 1, len(row)):
        cell = _cell(row[c])
        if not cell:
            continue
        try:
            advancement_costs.append(int(cell))
        except ValueError:
            pass

    return {
        'baseValue': base_value,
        'learnCost': learn_cost,
        'costs': advancement_costs,
    }


def extract_grad_table(pdf_path: str) -> tuple[list[dict], list[dict]]:
    """Parse the ES/Grad/Abw/Res/Zau table from page 1.

    Returns (gradThresholds, gradSkills):
      gradThresholds — [{grad, minEs}, ...] for ES→Grad mapping
      gradSkills     — [{name, gradValues: [{grad, fw}]}, ...] for Abwehr, Resistenz, Zaubern
    """
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        tables = page.extract_tables()

    grad_table = None
    for table in tables:
        if not table:
            continue
        first = _cell(table[0][0]) if table[0] else ''
        if first == 'ES':
            grad_table = table
            break

    if grad_table is None:
        print('ERROR: ES/Grad table not found on page 1')
        sys.exit(1)

    grad_thresholds: list[dict] = []
    abw_values: list[dict] = []
    res_values: list[dict] = []
    zau_values: list[dict] = []

    for row in grad_table[1:]:
        if not row or len(row) < 5:
            continue
        es_str = _cell(row[0])
        grad_str = _cell(row[1])
        abw_str = _cell(row[2])
        res_str = _cell(row[3])
        zau_str = _cell(row[4])

        if not es_str or not grad_str or not abw_str or not res_str or not zau_str:
            continue

        # Handle German-style number formatting (e.g. "1.000" → 1000)
        try:
            es_val = int(es_str.replace('.', ''))
            grad_val = int(grad_str)
            abw_val = int(abw_str)
            res_val = int(res_str)
            zau_val = int(zau_str)
        except ValueError:
            continue

        grad_thresholds.append({'grad': grad_val, 'minEs': es_val})
        abw_values.append({'grad': grad_val, 'fw': abw_val})
        res_values.append({'grad': grad_val, 'fw': res_val})
        zau_values.append({'grad': grad_val, 'fw': zau_val})

    def _keep_transitions(entries: list[dict]) -> list[dict]:
        """Filter to only entries where the fw value changes (transitions).

        The first entry is always kept; subsequent entries are kept only
        when their fw differs from the previous kept entry.
        """
        result: list[dict] = []
        last_fw = None
        for e in entries:
            if last_fw is None or e['fw'] != last_fw:
                result.append(e)
                last_fw = e['fw']
        return result

    grad_skills: list[dict] = []
    for name, values in [('Abwehr', abw_values), ('Resistenz', res_values), ('Zaubern', zau_values)]:
        grad_skills.append({
            'name': name,
            'gradValues': _keep_transitions(values),
        })

    return grad_thresholds, grad_skills


def extract_advancement_costs(pdf_path: str) -> dict[str, dict]:
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        tables = page.extract_tables()

    # ---- Main LE/TE table (A-L, W-Z) ----
    cost_table = None
    for table in tables:
        if not table:
            continue
        first = _cell(table[0][0]) if table[0] else ''
        if first == 'LE/TE':
            cost_table = table
            break

    if cost_table is None:
        print('ERROR: advancement cost table (LE/TE) not found on page 1')
        print(f'  Found {len(tables)} table(s) on page 1')
        sys.exit(1)

    col_headers = []
    for c in range(1, len(cost_table[0])):
        h = _cell(cost_table[0][c])
        try:
            col_headers.append(int(h.replace('+', '')))
        except ValueError:
            col_headers.append(None)

    result = {}
    for r in range(1, len(cost_table)):
        row = cost_table[r]
        letter = _cell(row[0])
        if not letter or len(letter) > 2:
            continue
        parsed = _parse_advancement_row(row, col_headers)
        if parsed:
            result[letter] = parsed
        else:
            print(f'  WARN: no parenthesized value found in row "{letter}", skipping')

    # ---- TE table (P/M, S) ----
    te_table = None
    for table in tables:
        if not table or not table[0]:
            continue
        first = _cell(table[0][0])
        if first == 'TE' and len(table[0]) > 1 and _cell(table[0][1]) == '+1':
            te_table = table
            break

    if te_table is not None and len(te_table) >= 3:
        te_headers = []
        for c in range(1, len(te_table[0])):
            h = _cell(te_table[0][c])
            try:
                te_headers.append(int(h.replace('+', '')))
            except ValueError:
                te_headers.append(None)

        # P/M row — paren column is always col 1 in this table.
        # pdfplumber does NOT capture cost cells in P/M's row; they appear
        # in the S row below because of PDF layout.  Use those as fallback.
        pm_row = te_table[1]
        pm_paren = None
        for c in range(1, len(pm_row)):
            cell = _cell(pm_row[c])
            m = re.search(r'\((\d+)\)', cell)
            if m:
                pm_paren = int(m.group(1))
                break

        if pm_paren is not None and len(te_headers) > 0 and te_headers[0] is not None:
            pm_base = te_headers[0]
            pm_learn = pm_paren // 3
            pm_costs: list[int] = []
            # costs live in the S row (index 2), cols 2+ in the TE table
            s_row = te_table[2]
            for c in range(2, len(s_row)):
                cell = _cell(s_row[c])
                if not cell:
                    continue
                try:
                    pm_costs.append(int(cell))
                except ValueError:
                    pass
            result['P/M'] = {
                'baseValue': pm_base,
                'learnCost': pm_learn,
                'costs': pm_costs,
            }

        # S row
        s_raw = _parse_advancement_row(te_table[2], te_headers)
        if s_raw:
            result['S'] = s_raw

    return result


def _clean_type_name(raw: str) -> str:
    """Strip trailing parenthetical notes from a type name (e.g. 'Bestienjäger (As/Hx, ehem.To)' → 'Bestienjäger')."""
    return re.sub(r'\s*\([^)]*\)\s*$', '', raw).strip()


def extract_type_names(pdf_path: str, cost_columns: list[str], log=print) -> list[dict]:
    """Extract type abbreviation→name mapping from footers on even PDF pages (4, 6, 8, 10).

    The footer on each even page lists the type names corresponding to the table columns on that page.
    Entries may include an explicit abbreviation prefix (e.g. 'Bb Barbar') or just a plain name (e.g. 'Assassine').
    Parenthetical notes like '(Kr/Hl)' are stripped from the name.
    """
    with pdfplumber.open(pdf_path) as pdf:
        types_by_id: dict[str, str] = {}

        for page_num in range(3, len(pdf.pages), 2):  # 0-indexed: 3=page 4, 5=page 6, ...
            if page_num >= len(pdf.pages):
                break
            page = pdf.pages[page_num]
            text = page.extract_text()
            if not text:
                continue

            lines = [l.strip() for l in text.strip().split('\n') if l.strip()]

            # Column abbreviations for this page (from the 'Fertigkeiten' table header).
            # Filter out non-abbreviation metadata like 'Quelle', '/', 'Bemerkung'.
            col_set = set(cost_columns)
            page_columns: list[str] = []
            for line in lines:
                if line.startswith('Fertigkeiten '):
                    page_columns = [c for c in line.split()[1:] if c in col_set]
                    break
            if not page_columns:
                log(f'  WARN: no Fertigkeiten header on page {page_num + 1}')
                continue

            # Footer lines: text after the 'Kampftechniken' line, before version/hinweis.
            # Kampftechniken data rows (Kampfkunst, Fechtkunst, Schießkunst, KiDo) contain digits — skip them.
            footer_lines: list[str] = []
            capture = False
            for line in lines:
                if line.startswith('Kampftechniken'):
                    capture = True
                    continue
                if capture:
                    if line.startswith('Mogadil, Version') or line.startswith('Hinweis:'):
                        continue
                    if re.search(r'\d', line):
                        continue
                    footer_lines.append(line)

            # Split entries on commas, but NOT commas inside parentheses
            raw_entries: list[str] = []
            for line in footer_lines:
                parts = re.split(r',\s*(?![^()]*\))', line)
                for p in parts:
                    p = p.strip()
                    if p:
                        raw_entries.append(p)

            remaining = list(page_columns)

            # Phase 1: entries with explicit abbreviation prefix (e.g. "Bb Barbar")
            pending: list[str] = []
            for entry in raw_entries:
                matched = False
                for abbr in sorted(remaining, key=len, reverse=True):
                    if entry.startswith(abbr + ' '):
                        name = _clean_type_name(entry[len(abbr):].strip())
                        if name:
                            types_by_id[abbr] = name
                            remaining.remove(abbr)
                            matched = True
                            break
                if not matched:
                    pending.append(entry)

            # Phase 2: plain names that start with a remaining abbreviation (e.g. "Waldläufer" → "Wa")
            still_pending: list[str] = []
            for entry in pending:
                matched = False
                for abbr in sorted(remaining, key=len, reverse=True):
                    if entry.startswith(abbr):
                        types_by_id[abbr] = _clean_type_name(entry)
                        remaining.remove(abbr)
                        matched = True
                        break
                if not matched:
                    still_pending.append(entry)

            # Phase 3: sequential fallback for remaining names
            for name in still_pending:
                if not remaining:
                    break
                abbr = remaining.pop(0)
                types_by_id[abbr] = _clean_type_name(name)

            if remaining:
                log(f'  WARN: page {page_num + 1}: {len(remaining)} unmapped column(s): {", ".join(remaining)}')

    # Reorder to match cost_columns
    result: list[dict] = []
    for col in cost_columns:
        if col in types_by_id:
            result.append({'id': col, 'name': types_by_id[col]})
        else:
            log(f'  WARN: no type name found for abbreviation "{col}"')

    return result


def _parse_group_cost(s: str) -> int | None:
    """Parse a cost value from a table cell. Handles '120*', '120°'."""
    s = s.strip().rstrip('*°')
    try:
        return int(s)
    except ValueError:
        return None


def extract_type_costs(pdf_path: str, cost_columns: list[str], log=print) -> tuple[dict[str, dict[str, int]], dict[str, dict[str, int]]]:
    """Extract Zaubersprüche into spellCosts and Kampftechniken into fightCosts per type.

    Returns (spell_costs, fight_costs) where each is
      { type_id: { group_name: cost, ... }, ... }
    Only includes rows that have at least one cost value.
    """
    col_set = set(cost_columns)
    spell_costs: dict[str, dict[str, int]] = {}
    fight_costs: dict[str, dict[str, int]] = {}

    with pdfplumber.open(pdf_path) as pdf:
        for page_num in range(3, len(pdf.pages), 2):
            if page_num >= len(pdf.pages):
                break
            page = pdf.pages[page_num]
            tables = page.extract_tables()

            fertig_table = None
            kt_table = None
            zaub_table = None
            for table in tables:
                if not table or not table[0]:
                    continue
                h0 = _cell(table[0][0])
                if h0 == 'Fertigkeiten':
                    fertig_table = table
                elif h0 == 'Kampftechniken':
                    kt_table = table
                elif h0.startswith('Zaubersprü'):
                    zaub_table = table

            # Column abbreviations for this page (from Kampftechniken header, fallback Fertigkeiten header)
            page_columns: list[str] = []
            if kt_table:
                page_columns = [_cell(c) for c in kt_table[0][1:] if _cell(c) in col_set]
            if not page_columns and fertig_table:
                page_columns = [_cell(c) for c in fertig_table[0][3:] if _cell(c) in col_set]
            if not page_columns:
                continue

            n_cols = len(page_columns)

            # ---- Zaubersprüche section (inside Fertigkeiten table) → spellCosts ----
            if fertig_table:
                zaub_start = None
                for ri, row in enumerate(fertig_table):
                    if row and row[0] and _cell(row[0]).startswith('Zaubersprü'):
                        zaub_start = ri + 1
                        break

                if zaub_start:
                    for ri in range(zaub_start, len(fertig_table)):
                        row = fertig_table[ri]
                        name = _cell(row[0]) if row else ''
                        if not name or name.startswith('*'):
                            continue

                        cost_cells = row[3:3 + n_cols] if row else []
                        if not any(c is not None for c in cost_cells):
                            continue

                        for ci, cell in enumerate(cost_cells):
                            if cell is None:
                                continue
                            cost_str = _cell(cell)
                            if not cost_str:
                                continue
                            cost = _parse_group_cost(cost_str)
                            if cost is None or cost <= 0:
                                continue
                            type_id = page_columns[ci]
                            if type_id not in spell_costs:
                                spell_costs[type_id] = {}
                            spell_costs[type_id][name] = cost

            # ---- Zaubersprüche as separate table (5.8.3+) → spellCosts ----
            if zaub_table is not None and len(zaub_table) > 1:
                for ri in range(1, len(zaub_table)):
                    row = zaub_table[ri]
                    name = _cell(row[0]) if row else ''
                    if not name or name.startswith('*'):
                        continue

                    cost_cells = row[1:1 + n_cols] if row else []
                    if not any(c is not None for c in cost_cells):
                        continue

                    for ci, cell in enumerate(cost_cells):
                        if cell is None:
                            continue
                        cost_str = _cell(cell)
                        if not cost_str:
                            continue
                        cost = _parse_group_cost(cost_str)
                        if cost is None or cost <= 0:
                            continue
                        type_id = page_columns[ci]
                        if type_id not in spell_costs:
                            spell_costs[type_id] = {}
                        spell_costs[type_id][name] = cost

            # ---- Kampftechniken table → fightCosts ----
            if kt_table and len(kt_table) > 1:
                kt_header = [_cell(c) for c in kt_table[0][1:]]
                col_map: list[tuple[int, str]] = []
                for ci, abbr in enumerate(kt_header):
                    if abbr in col_set:
                        col_map.append((ci, abbr))

                for ri in range(1, len(kt_table)):
                    row = kt_table[ri]
                    name = _cell(row[0]) if row else ''
                    if not name:
                        continue

                    for data_ci, type_id in col_map:
                        cell = row[data_ci + 1] if data_ci + 1 < len(row) else None
                        if cell is None:
                            continue
                        cost_str = _cell(cell)
                        if not cost_str:
                            continue
                        try:
                            cost = int(cost_str)
                        except ValueError:
                            continue
                        if cost <= 0:
                            continue
                        if type_id not in fight_costs:
                            fight_costs[type_id] = {}
                        fight_costs[type_id][name] = cost

    return spell_costs, fight_costs


def extract_fertigkeiten_tables(pdf_path: str):
    with pdfplumber.open(pdf_path) as pdf:
        pages = pdf.pages[2:10]
        all_raw_tables = []
        for page in pages:
            all_raw_tables.extend(page.extract_tables())

    fertig_tables = []
    for table in all_raw_tables:
        if not table or not table[0]:
            continue
        if len(table[0]) >= 6 and _cell(table[0][0]) == 'Fertigkeiten':
            fertig_tables.append(table)

    if not fertig_tables:
        print('ERROR: no Fertigkeiten tables found on pages 3-10')
        sys.exit(1)

    all_cost_headers: list[str] = []
    merged: list[dict] = []

    for block_idx in range(0, len(fertig_tables), 2):
        main_t = fertig_tables[block_idx]
        cont_t = fertig_tables[block_idx + 1]

        raw_headers = [_cell(h) for h in main_t[0][3:]]
        cost_headers = [h for h in raw_headers if h and h != 'Quelle / Bemerkung']
        all_cost_headers.extend(cost_headers)
        n_cost = len(cost_headers)

        def _extract(table_data) -> list[dict]:
            rows = []
            for i in range(1, len(table_data)):
                row = _fix_merged_cells(table_data[i])
                name = _cell(row[0])
                prop = _cell(row[1])
                letter = _cell(row[2])
                prop, letter = _split_letter(prop, letter)
                if not name or not prop or not letter:
                    continue
                costs = [_cell(row[c]) for c in range(3, min(3 + n_cost, len(row)))]
                while len(costs) < n_cost:
                    costs.append('')
                entry: dict = {
                    'name': name,
                    'property': prop,
                    'letter': letter,
                    'costs': costs,
                }
                # Capture "Quelle / Bemerkung" cell when present (last block only)
                if len(row) > 3 + n_cost:
                    entry['source_raw'] = _cell(row[3 + n_cost])
                rows.append(entry)
            return rows

        block_rows = _extract(main_t)
        block_rows.extend(_extract(cont_t))

        if block_idx == 0:
            merged = block_rows
        else:
            for idx, (m, b) in enumerate(zip(merged, block_rows)):
                if m['name'] != b['name']:
                    print(f'  WARN: skill mismatch at {idx}: "{m["name"]}" vs "{b["name"]}"')
                m['costs'].extend(b['costs'])
                # Carry over source from the last block (which has the Quelle column)
                if b.get('source_raw'):
                    m['source_raw'] = b['source_raw']

    # ---- Collect standalone Waffen tables (5.8.3+) ----
    waffen_tables = []
    for table in all_raw_tables:
        if not table or not table[0]:
            continue
        if _cell(table[0][0]) == 'Waffen':
            waffen_tables.append(table)

    if waffen_tables:
        all_waffen_costs: list[str] = []
        waffen_prop = ''
        waffen_letter = ''
        for table in waffen_tables:
            row = _fix_merged_cells(table[0])
            waffen_prop = _cell(row[1])
            waffen_letter = _cell(row[2])
            waffen_prop, waffen_letter = _split_letter(waffen_prop, waffen_letter)
            for c in range(3, len(row)):
                cell = _cell(row[c])
                m = re.match(r'^(\d+)', cell)
                if m:
                    all_waffen_costs.append(m.group(1))
                elif cell and cell[0] == '(':
                    continue
        while len(all_waffen_costs) < len(all_cost_headers):
            all_waffen_costs.append('')
        all_waffen_costs = all_waffen_costs[:len(all_cost_headers)]

        waffen_entry: dict = {
            'name': 'Waffen',
            'property': waffen_prop,
            'letter': waffen_letter,
            'costs': all_waffen_costs,
        }
        last_cell = _cell(waffen_tables[-1][0][-1]) if waffen_tables[-1][0] else ''
        if last_cell and not last_cell[0].isdigit() and '(' not in last_cell:
            waffen_entry['source_raw'] = last_cell
        merged.append(waffen_entry)

    for m in merged:
        if len(m['costs']) != len(all_cost_headers):
            print(f'  WARN: skill "{m["name"]}" has {len(m["costs"])} cost values, expected {len(all_cost_headers)}')

    return all_cost_headers, merged


def build_cost_patterns(rows: list[dict], cost_columns: list[str]):
    seen = {}
    patterns = []

    for r in rows:
        key = tuple(int(v) if v.isdigit() else 0 for v in r['costs'])
        if key not in seen:
            seen[key] = len(patterns)
            patterns.append(list(key))

    return patterns, seen


def _compact_arrays(json_str: str) -> str:
    """Collapse specific JSON arrays to single lines.

    - costColumns, advancementCosts, groups, values (flat arrays) -> one line
    - costPatterns (nested) -> each inner array on one line
    """
    def _compact_flat(m):
        inner = re.sub(r'[\r\n]+\s*', ' ', m.group(2).strip())
        return m.group(1) + inner + m.group(3)

    json_str = re.sub(
        r'("(?:costColumns|advancementCosts|groups|values)":\s*\[)([^\[\]]*?)(\])',
        _compact_flat,
        json_str,
    )

    start = json_str.find('"costPatterns"')
    if start != -1:
        colon = json_str.index(':', start)
        arr_start = json_str.index('[', colon)
        depth = 0
        arr_end = arr_start
        for i in range(arr_start, len(json_str)):
            if json_str[i] == '[':
                depth += 1
            elif json_str[i] == ']':
                depth -= 1
                if depth == 0:
                    arr_end = i + 1
                    break
        inner = json_str[arr_start:arr_end]
        inner = re.sub(r'\[([^\[\]]*)\]', lambda x: '[' + re.sub(r'\s+', ' ', x.group(1).strip()) + ']', inner)
        json_str = json_str[:arr_start] + inner + json_str[arr_end:]

    return json_str


def extract_weapon_skills(pdf_path: str) -> dict[str, list[str]]:
    """Parse the 'Lernen und Steigern von Waffenfertigkeiten' section on page 1.

    Returns {letter: [weapon_name, ...]} mapping.
    """
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        text = page.extract_text()

    lines = [l.strip() for l in text.split('\n') if l.strip()]

    # Find the start of the weapon skills section
    start = None
    for i, line in enumerate(lines):
        if 'Waffenfertigkeiten' in line:
            start = i
            break
    if start is None:
        print('  WARN: Waffenfertigkeiten section not found on page 1')
        return {}

    # Collect raw lines until the next section.
    # Continuation lines without a colon are kept ONLY if they contain a comma
    # (weapon names wrapping across lines).
    raw: list[list[str]] = []  # each entry is [letter, [segments...]]
    current_letter = None
    for line in lines[start + 1:]:
        m = re.match(r'^([A-Z](?:/[A-Z])?):\s*(.*)', line)
        if m:
            letter = m.group(1)
            rest = m.group(2)
            raw.append([letter, [rest]])
            current_letter = letter
        elif current_letter is not None and raw and ',' in line:
            raw[-1][1].append(line)
        elif current_letter is not None and raw and not line[0].isalpha():
            # Wurf-range continuation (e.g. "81 - 85 Konstitution") — skip
            pass
        else:
            break  # reached next section or non-weapon heading

    # Strip Wurf-table data from each segment independently,
    # then join and split into weapon names.
    _wurf = re.compile(r'\d+\s*-\s*\d+\s+\S+(?:\s+\S+)*')

    def _clean_rest(text: str) -> str:
        """Remove Wurf ranges and parenthetical notes."""
        text = _wurf.sub('', text)
        text = re.sub(r'\s*\([^)]*\)\s*', ' ', text)
        return text.strip()

    result: dict[str, list[str]] = {}
    for letter, segments in raw:
        combined = ' '.join(_clean_rest(s) for s in segments)
        weapons = [w.strip() for w in combined.split(',') if w.strip()]
        if weapons:
            result[letter] = weapons
        else:
            print(f'  WARN: no weapons found for letter "{letter}" in "{combined}"')

    return result


def parse_mogadil_document(pdf_path: str, out_path: str, log=print) -> dict:
    """Parse the Mogadil Lerntabellen PDF and write the output JSON.

    Returns the full output dict (skills, costColumns, costPatterns, metadata).
    """
    version = extract_version(pdf_path)
    log(f'Version: {version}')

    log('Parsing advancement cost table (page 1)...')
    cost_lookup = extract_advancement_costs(pdf_path)
    log(f'  Found {len(cost_lookup)} cost categories: {", ".join(sorted(cost_lookup.keys()))}')

    log('Parsing ES/Grad/Abw/Res/Zau table (page 1)...')
    grad_thresholds, grad_skills = extract_grad_table(pdf_path)
    log(f'  Found {len(grad_thresholds)} grad thresholds (Grad 1–{grad_thresholds[-1]["grad"]})')
    for gs in grad_skills:
        log(f'  Skill "{gs["name"]}" with {len(gs["gradValues"])} grad entries')

    log('Parsing Fertigkeiten tables (pages 3-10)...')
    cost_columns, all_rows = extract_fertigkeiten_tables(pdf_path)
    log(f'  Found {len(all_rows)} skills across {len(cost_columns)} cost columns')

    log('Extracting type names from page footers...')
    types = extract_type_names(pdf_path, cost_columns, log)
    log(f'  Found {len(types)} / {len(cost_columns)} type names')

    log('Extracting spell costs (Zaubersprüche) and fight costs (Kampftechniken)...')
    spell_costs, fight_costs = extract_type_costs(pdf_path, cost_columns, log)
    log(f'  spellCosts for {sum(1 for v in spell_costs.values() if v)} types')
    log(f'  fightCosts for {sum(1 for v in fight_costs.values() if v)} types')

    # Merge spellCosts/fightCosts into types; add any types missing a name (e.g. "Vo").
    # Rebuild in cost_columns order.
    types_by_id = {t['id']: t for t in types}
    for type_id, costs in spell_costs.items():
        if type_id in types_by_id:
            types_by_id[type_id]['spellCosts'] = dict(sorted(costs.items()))
        else:
            types_by_id[type_id] = {'id': type_id, 'spellCosts': dict(sorted(costs.items()))}
    for type_id, costs in fight_costs.items():
        if type_id in types_by_id:
            types_by_id[type_id]['fightCosts'] = dict(sorted(costs.items()))
        else:
            target = types_by_id.get(type_id)
            if target:
                target['fightCosts'] = dict(sorted(costs.items()))
            else:
                types_by_id[type_id] = {'id': type_id, 'fightCosts': dict(sorted(costs.items()))}
    types = [types_by_id[col] for col in cost_columns if col in types_by_id]

    # Extract per-type Waffen costs from the "Waffen" entry in all_rows
    # (available before the skills loop below).
    waffen_costs_by_type: dict[str, int] = {}
    for r in all_rows:
        if r['name'] == 'Waffen':
            for idx, cost_str in enumerate(r['costs']):
                if idx < len(cost_columns):
                    try:
                        waffen_costs_by_type[cost_columns[idx]] = int(cost_str) if cost_str.strip().isdigit() else 0
                    except (ValueError, IndexError):
                        pass
            break

    # Derive category and propertyBonuses (ResBk/ResBg) for each type
    for t in types:
        cat = _derive_category(t['id'], t.get('spellCosts'), waffen_costs_by_type.get(t['id']))
        t['category'] = cat
        t['propertyBonuses'] = CATEGORY_BONUSES[cat]

        # apGain: Override → Kategorie → 0
        type_id = t['id']
        if type_id in AP_GAIN_OVERRIDES:
            bonus = AP_GAIN_OVERRIDES[type_id]
        else:
            bonus = CATEGORY_AP_GAIN.get(cat, 0)
        t['apGain'] = { 'lowGradBonus': bonus }

    log('  Category distribution: '
        f'{sum(1 for t in types if t["category"] == "Kämpfer")} Kämpfer, '
        f'{sum(1 for t in types if t["category"] == "KampfZauberer")} KampfZauberer, '
        f'{sum(1 for t in types if t["category"] == "Zauberer")} Zauberer')

    log('Finding unique cost patterns...')
    cost_patterns, pattern_map = build_cost_patterns(all_rows, cost_columns)
    log(f'  {len(cost_patterns)} unique patterns (vs {len(all_rows)} x {len(cost_columns)} = {len(all_rows) * len(cost_columns)} raw values)')

    log('Building skills...')
    skills = []
    skipped = 0
    waffen_pattern_id = None
    waffen_property = None  # default, overridden if "Waffen" entry exists
    for r in all_rows:
        if r['name'] == 'Waffen':
            key = tuple(int(v) if v.isdigit() else 0 for v in r['costs'])
            waffen_pattern_id = pattern_map.get(key)
            waffen_property = None  # r['property']
            log(f'  Found "Waffen" entry, patternId={waffen_pattern_id}, property={waffen_property}')
            continue

        lookup = cost_lookup.get(r['letter'])
        if lookup is None:
            log(f'  WARN: unknown cost category "{r["letter"]}" for skill "{r["name"]}", skipping')
            skipped += 1
            continue

        key = tuple(int(v) if v.isdigit() else 0 for v in r['costs'])
        pattern_id = pattern_map[key]

        skill_name = SKILL_NAME_CORRECTIONS.get(r['name'], r['name'])
        source_raw = r.get('source_raw', '')
        source = _resolve_source(source_raw) if source_raw else ''
        skills.append({
            'id': skill_name,
            'name': skill_name,
            'typ': 'Fertigkeit',
            'learnCost': lookup['learnCost'],
            'advancementCosts': lookup['costs'],
            'baseValue': lookup['baseValue'],
            'maxValue': 18,
            **({'linkedProperty': r['property']} if r['property'] else {}),
            'costPatternId': pattern_id,
            'source': source,
        })

    # Add weapon skills from the "Lernen und Steigern von Waffenfertigkeiten" section
    if waffen_pattern_id is not None:
        wpn_skills = extract_weapon_skills(pdf_path)
        if wpn_skills:
            log(f'  Adding {sum(len(v) for v in wpn_skills.values())} weapon skills...')
            for letter, names in sorted(wpn_skills.items()):
                lookup = cost_lookup.get(letter)
                if lookup is None:
                    log(f'  WARN: no advancement costs for weapon letter "{letter}", skipping')
                    skipped += len(names)
                    continue
                for name in names:
                    wpn_name = SKILL_NAME_CORRECTIONS.get(name, name)
                    max_val = lookup['baseValue'] + len(lookup['costs'])
                    skills.append({
                        'id': wpn_name,
                        'name': wpn_name,
                        'typ': 'Waffenfertigkeit',
                        'learnCost': lookup['learnCost'],
                        'advancementCosts': lookup['costs'],
                        'baseValue': lookup['baseValue'],
                        'maxValue': max_val,
                        **({'linkedProperty': waffen_property} if waffen_property else {}),
                        'costPatternId': waffen_pattern_id,
                    })
    else:
        log('  WARN: no "Waffen" entry found, weapon skills will be skipped')

    # Add grade-dependent skills (Abwehr, Resistenz, Zaubern) from the ES/Grad table
    bonus_key_map = {'Abwehr': 'AbB', 'Resistenz': None, 'Zaubern': 'ZauB'}
    for gs in grad_skills:
        name = gs['name']
        grad_vals = gs['gradValues']
        skills.append({
            'id': name,
            'name': name,
            'typ': 'angeboreneFertigkeit',
            'learnCost': 0,
            'advancementCosts': [],
            'baseValue': grad_vals[0]['fw'],
            'maxValue': grad_vals[-1]['fw'],
            **({'bonusKey': bonus_key_map[name]} if bonus_key_map.get(name) else {}),
            'gradValues': grad_vals,
        })

    _umlaut_sort = str.maketrans({'ä': 'a', 'ö': 'o', 'ü': 'u', 'Ä': 'A', 'Ö': 'O', 'Ü': 'U', 'ß': 'ss'})
    skills.sort(key=lambda s: s['name'].translate(_umlaut_sort).casefold())

    output = {
        'metadata': {
            'id': 'mogadil-lerntabellen',
            'title': 'Mogadil Lerntabellen',
            'version': version,
            'scriptVersion': get_app_version(),
            'priority': 0,
        },
        'gradThresholds': grad_thresholds,
        'costColumns': cost_columns,
        'costPatterns': cost_patterns,
        'types': types,
        'skills': skills,
        'universalRules': {
            'gradUpRules': M5_GRADUP_RULES,
        },
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    json_str = json.dumps(output, ensure_ascii=False, indent=2)
    json_str = _compact_arrays(json_str)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(json_str)

    log(f'\nDone. {len(skills)} skills written to {out_path}')
    if skipped:
        log(f'  ({skipped} skills skipped due to unknown cost category)')

    return output


def main():
    import sys
    args = sys.argv[1:]
    if len(args) >= 2:
        pdf_path = args[0]
        out_path = args[1]
    elif len(args) == 1:
        pdf_path = args[0]
        out_path = OUT_PATH
    else:
        pdf_path = PDF_PATH
        out_path = OUT_PATH
    parse_mogadil_document(pdf_path, out_path)


if __name__ == '__main__':
    main()
