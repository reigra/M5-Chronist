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
    cmd = [sys.executable, '-m', 'pip', 'install', 'pdfplumber', '-q', '--no-warn-script-location']
    try:
        subprocess.check_call(cmd)
    except subprocess.CalledProcessError:
        cmd.append('--break-system-packages')
        subprocess.check_call(cmd)
    import pdfplumber

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
            for table in tables:
                if not table or not table[0]:
                    continue
                h0 = _cell(table[0][0])
                if h0 == 'Fertigkeiten':
                    fertig_table = table
                elif h0 == 'Kampftechniken':
                    kt_table = table

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
            'priority': 0,
        },
        'costColumns': cost_columns,
        'costPatterns': cost_patterns,
        'types': types,
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
