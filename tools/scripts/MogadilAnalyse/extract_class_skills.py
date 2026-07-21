"""
Extract skill tables per class from the Mogadil Lerntabellen PDF.

Outputs a JSON file with:
  - classColumns: ordered list of class abbreviations
  - classes: each class with id, name, category, spellCosts, fightCosts
  - skills: each skill with name, property, letter, learnCost, baseValue,
    advancementCosts, source, and costs (classId -> raw cost mapping)

The costs dictionary makes cross-class comparisons easy:
  "Which classes have cost ≤ 5 for this skill?"
"""

import json
import os
import re
import subprocess
import sys

# Allow imports from tools/scripts/ (helpers.py lives there)
_SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'scripts')
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

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

# ── Paths ──────────────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(__file__)
PDF_DIR = os.path.join(SCRIPT_DIR, '..')
_MOGADIL_FILES = [f for f in os.listdir(PDF_DIR) if f.startswith('Lerntabellen_') and f.endswith('.pdf')]
if not _MOGADIL_FILES:
    raise FileNotFoundError(f'No Lerntabellen_*.pdf found in {PDF_DIR}')
_MOGADIL_FILES.sort(reverse=True)
PDF_PATH = os.path.join(PDF_DIR, _MOGADIL_FILES[0])
OUT_PATH = os.path.join(SCRIPT_DIR, 'output', 'class_skills.json')

# ── Corrections & mappings (from parse_Mogadil.py) ─────────────────────────────

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

CATEGORY_BONUSES: dict[str, list[dict]] = {
    'Kämpfer':       [{'id': 'ResBk', 'value': 1, 'mode': 'add'}],
    'KampfZauberer': [{'id': 'ResBk', 'value': 1, 'mode': 'add'}],
    'Zauberer':      [{'id': 'ResBk', 'value': 2, 'mode': 'add'},
                      {'id': 'ResBg', 'value': 2, 'mode': 'add'}],
}

CATEGORY_AP_GAIN: dict[str, int] = {'Kämpfer': 2, 'KampfZauberer': 2, 'Zauberer': 1}
AP_GAIN_OVERRIDES: dict[str, int] = {'Kr': 3, 'Ba': 3, 'Wä': 3}

CATEGORY_OVERRIDES: dict[str, str] = {
    'PS': 'Zauberer',
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def _cell(text):
    return '' if text is None else str(text).strip()


def _split_letter(prop: str, letter: str):
    """If letter is empty but prop ends with a single letter, split it."""
    if not letter and ' ' in prop:
        parts = prop.rsplit(' ', 1)
        if len(parts[1]) == 1 or parts[1] in ('P-Z',):
            prop = parts[0]
            letter = parts[1]
    return prop, letter


def _fix_merged_cells(row: list):
    """Split adjacent merged cost cells (e.g. '20 20' -> ['20', '20'])."""
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
    """Replace known abbreviations in a source cell with full book names."""
    if not source_raw:
        return ''
    result = source_raw
    for abbr, full in sorted(SOURCE_MAP.items(), key=lambda x: -len(x[0])):
        result = re.sub(rf'\b{re.escape(abbr)}\b', full, result)
    return result


def _clean_type_name(raw: str) -> str:
    """Strip trailing parenthetical notes from a type name."""
    return re.sub(r'\s*\([^)]*\)\s*$', '', raw).strip()


def _int_cell(text):
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


def _derive_category(type_id: str, spell_costs: dict | None, waffen_cost: int | None) -> str:
    """Determine the character type category (Kämpfer/KampfZauberer/Zauberer)."""
    if type_id in CATEGORY_OVERRIDES:
        return CATEGORY_OVERRIDES[type_id]
    if not spell_costs:
        return 'Kämpfer'
    effective_waffen = waffen_cost if waffen_cost is not None else 0
    if effective_waffen >= 40:
        return 'Zauberer'
    return 'KampfZauberer'


def _parse_group_cost(s: str) -> int | None:
    """Parse a cost value from a table cell. Handles '120*', '120°'."""
    s = s.strip().rstrip('*°')
    try:
        return int(s)
    except ValueError:
        return None


# ── Extraction functions ───────────────────────────────────────────────────────

def extract_version(pdf_path: str) -> str:
    """Extract version from filename (e.g. Lerntabellen_5_8_2.pdf -> 5.8.2)."""
    basename = os.path.basename(pdf_path)
    m = re.search(r'(\d+)_(\d+)_(\d+)', basename)
    if m:
        return f'{m.group(1)}.{m.group(2)}.{m.group(3)}'
    return 'unknown'


def extract_advancement_costs(pdf_path: str) -> dict[str, dict]:
    """
    Parse the LE/TE advancement cost table from page 1.

    Returns { letter: { baseValue, learnCost, costs } }.
    """
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        tables = page.extract_tables()

    # Main LE/TE table
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
        return {}

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

    # TE table (P/M, S)
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

        # P/M row
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


def extract_fertigkeiten_tables(pdf_path: str):
    """
    Parse Fertigkeiten tables from pages 3-10.

    Returns (cost_columns, all_rows) where:
      cost_columns — ordered list of class abbreviation strings
      all_rows    — list of { name, property, letter, costs[], source_raw }
    """
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
                if b.get('source_raw'):
                    m['source_raw'] = b['source_raw']

    for m in merged:
        if len(m['costs']) != len(all_cost_headers):
            print(f'  WARN: skill "{m["name"]}" has {len(m["costs"])} cost values, expected {len(all_cost_headers)}')

    return all_cost_headers, merged


def extract_type_names(pdf_path: str, cost_columns: list[str], log=print) -> list[dict]:
    """
    Extract class abbreviation -> name mapping from footers on even pages (4, 6, 8, 10).

    Returns list of { id, name } in cost_columns order.
    """
    with pdfplumber.open(pdf_path) as pdf:
        types_by_id: dict[str, str] = {}

        for page_num in range(3, len(pdf.pages), 2):
            if page_num >= len(pdf.pages):
                break
            page = pdf.pages[page_num]
            text = page.extract_text()
            if not text:
                continue

            lines = [l.strip() for l in text.strip().split('\n') if l.strip()]

            col_set = set(cost_columns)
            page_columns: list[str] = []
            for line in lines:
                if line.startswith('Fertigkeiten '):
                    page_columns = [c for c in line.split()[1:] if c in col_set]
                    break
            if not page_columns:
                log(f'  WARN: no Fertigkeiten header on page {page_num + 1}')
                continue

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

            raw_entries: list[str] = []
            for line in footer_lines:
                parts = re.split(r',\s*(?![^()]*\))', line)
                for p in parts:
                    p = p.strip()
                    if p:
                        raw_entries.append(p)

            remaining = list(page_columns)

            # Phase 1: entries with explicit abbreviation prefix
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

            # Phase 2: plain names that start with a remaining abbreviation
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

            # Phase 3: sequential fallback
            for name in still_pending:
                if not remaining:
                    break
                abbr = remaining.pop(0)
                types_by_id[abbr] = _clean_type_name(name)

            if remaining:
                log(f'  WARN: page {page_num + 1}: {len(remaining)} unmapped column(s): {", ".join(remaining)}')

    result: list[dict] = []
    for col in cost_columns:
        if col in types_by_id:
            result.append({'id': col, 'name': types_by_id[col]})
        else:
            log(f'  WARN: no type name found for abbreviation "{col}"')

    return result


def extract_type_costs(pdf_path: str, cost_columns: list[str], log=print) -> tuple[dict[str, dict[str, int]], dict[str, dict[str, int]]]:
    """
    Extract Zaubersprüche into spellCosts and Kampftechniken into fightCosts per class.

    Returns (spell_costs, fight_costs).
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
            for table in tables:
                if not table or not table[0]:
                    continue
                h0 = _cell(table[0][0])
                if h0 == 'Fertigkeiten':
                    fertig_table = table
                elif h0 == 'Kampftechniken':
                    kt_table = table

            page_columns: list[str] = []
            if kt_table:
                page_columns = [_cell(c) for c in kt_table[0][1:] if _cell(c) in col_set]
            if not page_columns and fertig_table:
                page_columns = [_cell(c) for c in fertig_table[0][3:] if _cell(c) in col_set]
            if not page_columns:
                continue

            n_cols = len(page_columns)

            # Zaubersprüche section (inside Fertigkeiten table)
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

            # Kampftechniken table
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


# ── Main ───────────────────────────────────────────────────────────────────────

def extract(pdf_path: str, out_path: str, log=print) -> dict:
    """
    Main extraction: parse the PDF and build cross-class skill data.

    Returns the full output dict.
    """
    version = extract_version(pdf_path)
    log(f'Version: {version}')

    log('Parsing Fertigkeiten tables (pages 3-10)...')
    cost_columns, all_rows = extract_fertigkeiten_tables(pdf_path)
    log(f'  Found {len(all_rows)} skills across {len(cost_columns)} class columns')

    log('Extracting class names from page footers...')
    classes = extract_type_names(pdf_path, cost_columns, log)
    log(f'  Found {len(classes)} / {len(cost_columns)} class names')

    log('Extracting advancement costs (LE/TE table, page 1)...')
    advancement_lookup = extract_advancement_costs(pdf_path)
    log(f'  Found {len(advancement_lookup)} cost categories: {", ".join(sorted(advancement_lookup.keys()))}')

    log('Extracting spell costs and fight costs...')
    spell_costs, fight_costs = extract_type_costs(pdf_path, cost_columns, log)
    log(f'  spellCosts for {sum(1 for v in spell_costs.values() if v)} types')
    log(f'  fightCosts for {sum(1 for v in fight_costs.values() if v)} types')

    # Merge spellCosts/fightCosts into classes
    classes_by_id = {c['id']: c for c in classes}
    for type_id, costs in spell_costs.items():
        if type_id in classes_by_id:
            classes_by_id[type_id]['spellCosts'] = dict(sorted(costs.items()))
        else:
            classes_by_id[type_id] = {'id': type_id, 'spellCosts': dict(sorted(costs.items()))}
    for type_id, costs in fight_costs.items():
        target = classes_by_id.get(type_id)
        if target:
            target['fightCosts'] = dict(sorted(costs.items()))
    classes = [classes_by_id[col] for col in cost_columns if col in classes_by_id]

    # Derive category per class from spell costs + Waffen cost
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

    for t in classes:
        cat = _derive_category(t['id'], t.get('spellCosts'), waffen_costs_by_type.get(t['id']))
        t['category'] = cat
        t['propertyBonuses'] = CATEGORY_BONUSES[cat]
        type_id = t['id']
        if type_id in AP_GAIN_OVERRIDES:
            bonus = AP_GAIN_OVERRIDES[type_id]
        else:
            bonus = CATEGORY_AP_GAIN.get(cat, 0)
        t['apGain'] = {'lowGradBonus': bonus}

    log('Building skills with per-class costs...')
    skills = []
    skipped_raw = 0  # skipped due to missing advancement lookup
    for r in all_rows:
        skill_name = SKILL_NAME_CORRECTIONS.get(r['name'], r['name'])

        # Skip the synthetic "Waffen" entry (weapons are individual skills in the PDF)
        if r['name'] == 'Waffen':
            continue

        letter = r['letter']
        # Normalise "P-Z" to "Z" (Psyche-based spells use letter Z)
        if letter == 'P-Z':
            letter = 'Z'

        # Resolve advancement info (optional — might be missing for some letters)
        adv_info = advancement_lookup.get(letter)
        if adv_info is None:
            log(f'  WARN: no advancement costs for letter "{letter}" (skill "{skill_name}"), skipping')
            skipped_raw += 1
            continue

        source_raw = r.get('source_raw', '')
        source = _resolve_source(source_raw) if source_raw else ''

        # Build costs dictionary: classId -> raw cost (int if numeric, otherwise the string)
        costs_dict: dict[str, int | str] = {}
        for idx, cost_str in enumerate(r['costs']):
            if idx < len(cost_columns):
                class_id = cost_columns[idx]
                if cost_str.strip() and cost_str.strip().isdigit():
                    costs_dict[class_id] = int(cost_str)
                else:
                    costs_dict[class_id] = cost_str.strip()

        skills.append({
            'name': skill_name,
            'property': r['property'],
            'letter': letter,
            'learnCost': adv_info['learnCost'],
            'baseValue': adv_info['baseValue'],
            'advancementCosts': adv_info['costs'],
            'source': source,
            'costs': costs_dict,
        })

    # Sort skills by name (German umlaut-aware)
    _umlaut_sort = str.maketrans({'ä': 'a', 'ö': 'o', 'ü': 'u', 'Ä': 'A', 'Ö': 'O', 'Ü': 'U', 'ß': 'ss'})
    skills.sort(key=lambda s: s['name'].translate(_umlaut_sort).casefold())

    output = {
        'metadata': {
            'id': 'mogadil-class-skills',
            'title': 'Mogadil Class Skill Matrix',
            'version': version,
            'scriptVersion': get_app_version(),
            'source': os.path.basename(pdf_path),
        },
        'classColumns': cost_columns,
        'classes': classes,
        'skills': skills,
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    log(f'\nDone. {len(skills)} skills, {len(classes)} classes -> {out_path}')
    if skipped_raw:
        log(f'  ({skipped_raw} skills skipped due to missing advancement cost category)')

    return output


def main():
    extract(PDF_PATH, OUT_PATH)


if __name__ == '__main__':
    main()
