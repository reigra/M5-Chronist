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
import sys

import camelot

PDF_PATH = os.path.join(os.path.dirname(__file__), '..', 'Mogadil', 'Lerntabellen_5_8_1.pdf')
OUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'rules', 'mogadil.json')


def extract_version(pdf_path: str) -> str:
    basename = os.path.basename(pdf_path)
    m = re.search(r'(\d+)_(\d+)_(\d+)', basename)
    if m:
        return f'{m.group(1)}.{m.group(2)}.{m.group(3)}'
    return 'unknown'


def extract_advancement_costs(pdf_path: str) -> dict[str, dict]:
    tables = camelot.read_pdf(pdf_path, pages='1', flavor='lattice')

    cost_table = None
    for t in tables:
        val = str(t.df.iloc[0, 0]).strip()
        if 'LE' in val or 'TE' in val:
            cost_table = t
            break

    if cost_table is None:
        print('ERROR: advancement cost table (LE/TE) not found on page 1')
        print(f'  Found {len(tables)} table(s) on page 1')
        for i, t in enumerate(tables):
            print(f'  Table {i}: shape={t.shape}, row0col0={str(t.df.iloc[0,0])!r}')
        sys.exit(1)

    df = cost_table.df

    col_headers = []
    for c in range(1, df.shape[1]):
        h = str(df.iloc[0, c]).strip()
        try:
            col_headers.append(int(h.replace('+', '')))
        except ValueError:
            col_headers.append(None)

    result = {}
    for r in range(1, df.shape[0]):
        letter = str(df.iloc[r, 0]).strip()
        if not letter or len(letter) > 2:
            continue

        paren_col = None
        paren_value = None
        for c in range(1, df.shape[1]):
            cell = str(df.iloc[r, c]).strip()
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
        for c in range(paren_col + 1, df.shape[1]):
            cell = str(df.iloc[r, c]).strip()
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
    """
    Parse all Fertigkeiten tables across pages 3-10 (4 double-page spreads).

    Each double-page spread has two tables:
      - Main table (74 rows, 23 or 9 cols): first 73 skills
      - Continuation table (28 rows, 23 or 7 cols): remaining 27 skills

    Cost columns per spread:
      3-4: As..Ge    (20 cols)
      5-6: Gl..Rm    (20 cols)
      7-8: Rs..PSKr  (20 cols)
      9-10: Se, PWs, MS (3 cols)

    Returns (cost_columns, merged_rows) where merged_rows has 100 entries,
    each with name, property, letter, and costs (63 values).
    """
    tables = camelot.read_pdf(pdf_path, pages='3-10', flavor='lattice')

    fertig_indices = [i for i, t in enumerate(tables)
                      if str(t.df.iloc[0, 0]).strip() == 'Fertigkeiten' and t.shape[1] >= 6]

    # Pair up main + continuation tables per double-page spread
    blocks = []
    for i in range(0, len(fertig_indices), 2):
        blocks.append((fertig_indices[i], fertig_indices[i + 1]))

    all_cost_headers: list[str] = []
    merged: list[dict] = []

    for block_idx, (main_idx, cont_idx) in enumerate(blocks):
        main_t = tables[main_idx]
        cont_t = tables[cont_idx]

        # Extract cost column headers (skip leading name/property/letter cols)
        raw_headers = [str(h).strip() for h in main_t.df.iloc[0][3:]]
        cost_headers = [h for h in raw_headers if h and h != 'Quelle / Bemerkung']
        all_cost_headers.extend(cost_headers)
        n_cost = len(cost_headers)

        def extract_rows(table) -> list[dict]:
            rows = []
            for i in range(1, len(table.df)):
                row = list(table.df.iloc[i])
                name = str(row[0]).strip()
                if not name:
                    continue
                prop = str(row[1]).strip()
                letter = str(row[2]).strip()
                costs = [str(row[c]).strip() for c in range(3, min(3 + n_cost, len(row)))]
                # Pad with empty string if row is shorter than expected
                while len(costs) < n_cost:
                    costs.append('')
                rows.append({
                    'name': name,
                    'property': prop,
                    'letter': letter,
                    'costs': costs,
                })
            return rows

        block_rows = extract_rows(main_t)
        block_rows.extend(extract_rows(cont_t))

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
    """
    Find unique cost patterns across all skills.

    Returns (patterns, pattern_ids):
      patterns: list of 63-element int arrays (one per unique pattern)
      pattern_ids: dict mapping skill name → pattern index
    """
    seen = {}
    patterns = []

    for r in rows:
        key = tuple(int(v) if v.isdigit() else 0 for v in r['costs'])
        if key not in seen:
            seen[key] = len(patterns)
            patterns.append(list(key))

    return patterns, seen


def main():
    pdf_path = PDF_PATH
    version = extract_version(pdf_path)
    print(f'Version: {version}')

    print('Parsing advancement cost table (page 1)...')
    cost_lookup = extract_advancement_costs(pdf_path)
    print(f'  Found {len(cost_lookup)} cost categories: {", ".join(sorted(cost_lookup.keys()))}')

    print('Parsing Fertigkeiten tables (pages 3-10)...')
    cost_columns, all_rows = extract_fertigkeiten_tables(pdf_path)
    print(f'  Found {len(all_rows)} skills across {len(cost_columns)} cost columns')

    print('Finding unique cost patterns...')
    cost_patterns, pattern_map = build_cost_patterns(all_rows, cost_columns)
    print(f'  {len(cost_patterns)} unique patterns (vs {len(all_rows)} × {len(cost_columns)} = {len(all_rows) * len(cost_columns)} raw values)')

    print('Building skills...')
    skills = []
    skipped = 0
    for r in all_rows:
        lookup = cost_lookup.get(r['letter'])
        if lookup is None:
            print(f'  WARN: unknown cost category "{r["letter"]}" for skill "{r["name"]}", skipping')
            skipped += 1
            continue

        key = tuple(int(v) if v.isdigit() else 0 for v in r['costs'])
        pattern_id = pattern_map[key]

        skills.append({
            'id': r['name'],
            'name': r['name'],
            'typ': 'Fertigkeit',
            'groups': [],
            'learnCost': lookup['learnCost'],
            'advancementCosts': lookup['costs'],
            'baseValue': lookup['baseValue'],
            'maxValue': 18,
            'linkedProperty': r['property'],
            'notes': '',
            'costPatternId': pattern_id,
        })

    skills.sort(key=lambda s: s['name'].casefold())

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

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f'\nDone. {len(skills)} skills written to {OUT_PATH}')
    if skipped:
        print(f'  ({skipped} skills skipped due to unknown cost category)')


if __name__ == '__main__':
    main()
