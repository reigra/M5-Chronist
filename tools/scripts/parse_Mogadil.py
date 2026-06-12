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

try:
    import pdfplumber
except ImportError:
    print('pdfplumber nicht gefunden — installiere automatisch ...')
    cmd = [sys.executable, '-m', 'pip', 'install', 'pdfplumber', '-q']
    try:
        subprocess.check_call(cmd)
    except subprocess.CalledProcessError:
        cmd.append('--break-system-packages')
        subprocess.check_call(cmd)
    import pdfplumber

PDF_PATH = os.path.join(os.path.dirname(__file__), '..', 'Mogadil', 'Lerntabellen_5_8_1.pdf')
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


def _int_cell(text):
    """Parse a cell value as int, or None if not parseable."""
    s = _cell(text)
    try:
        return int(s)
    except ValueError:
        return None


def extract_advancement_costs(pdf_path: str) -> dict[str, dict]:
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        tables = page.extract_tables()

    cost_table = None
    for table in tables:
        if not table:
            continue
        first = _cell(table[0][0]) if table[0] else ''
        if 'LE' in first or 'TE' in first:
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
            print(f'  WARN: no parenthesized value found in row "{letter}", skipping')
            continue

        header_idx = paren_col - 1
        if header_idx >= len(col_headers) or col_headers[header_idx] is None:
            print(f'  WARN: invalid base column index {header_idx} for row "{letter}", skipping')
            continue

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

        result[letter] = {
            'baseValue': base_value,
            'learnCost': learn_cost,
            'costs': advancement_costs,
        }

    return result


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
                rows.append({
                    'name': name,
                    'property': prop,
                    'letter': letter,
                    'costs': costs,
                })
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


def parse_mogadil_document(pdf_path: str, out_path: str, log=print) -> dict:
    """Parse the Mogadil Lerntabellen PDF and write the output JSON.

    Returns the full output dict (skills, costColumns, costPatterns, metadata).
    """
    version = extract_version(pdf_path)
    log(f'Version: {version}')

    log('Parsing advancement cost table (page 1)...')
    cost_lookup = extract_advancement_costs(pdf_path)
    log(f'  Found {len(cost_lookup)} cost categories: {", ".join(sorted(cost_lookup.keys()))}')

    log('Parsing Fertigkeiten tables (pages 3-10)...')
    cost_columns, all_rows = extract_fertigkeiten_tables(pdf_path)
    log(f'  Found {len(all_rows)} skills across {len(cost_columns)} cost columns')

    log('Finding unique cost patterns...')
    cost_patterns, pattern_map = build_cost_patterns(all_rows, cost_columns)
    log(f'  {len(cost_patterns)} unique patterns (vs {len(all_rows)} x {len(cost_columns)} = {len(all_rows) * len(cost_columns)} raw values)')

    log('Building skills...')
    skills = []
    skipped = 0
    for r in all_rows:
        lookup = cost_lookup.get(r['letter'])
        if lookup is None:
            log(f'  WARN: unknown cost category "{r["letter"]}" for skill "{r["name"]}", skipping')
            skipped += 1
            continue

        key = tuple(int(v) if v.isdigit() else 0 for v in r['costs'])
        pattern_id = pattern_map[key]

        skills.append({
            'id': r['name'],
            'name': r['name'],
            'typ': 'Fertigkeit',
            'learnCost': lookup['learnCost'],
            'advancementCosts': lookup['costs'],
            'baseValue': lookup['baseValue'],
            'maxValue': 18,
            'linkedProperty': r['property'],
            'costPatternId': pattern_id,
        })

    _umlaut_sort = str.maketrans({'ä': 'a', 'ö': 'o', 'ü': 'u', 'Ä': 'A', 'Ö': 'O', 'Ü': 'U', 'ß': 'ss'})
    skills.sort(key=lambda s: s['name'].translate(_umlaut_sort).casefold())

    output = {
        'metadata': {
            'id': 'mogadil-lerntabellen',
            'title': 'Mogadil Lerntabellen',
            'version': version,
            'isCore': False,
        },
        'costColumns': cost_columns,
        'costPatterns': cost_patterns,
        'skills': skills,
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
    parse_mogadil_document(PDF_PATH, OUT_PATH)


if __name__ == '__main__':
    main()
