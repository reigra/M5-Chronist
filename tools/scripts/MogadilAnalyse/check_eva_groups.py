"""
Compare deduced Mogadil groups against eva_kodex groups.

Reads:
  output/skill_groups_min.json  — deduced Mogadil groups
  ../../rules/eva_kodex.json    — skill groups + type costs (reference)

Outcome per skill:
  [OK]    M == E
  [WARN]  M is subset of E  (M more specific)
  [ERROR] M has cats not in E

Outcome per type groupCost: any deviation = ERROR.
"""

import json
import os

SCRIPT_DIR = os.path.dirname(__file__)
SKILL_PATH = os.path.join(SCRIPT_DIR, 'output', 'skill_groups_min.json')
COSTS_PATH = os.path.join(SCRIPT_DIR, 'output', 'class_group_costs_min.json')
EVA_PATH = os.path.join(SCRIPT_DIR, '..', '..', 'rules', 'eva_kodex.json')

ALL_CATEGORIES = [
    'Alltag', 'Halbwelt', 'Kampf', 'Körper',
    'Freiland', 'Wissen', 'Sozial', 'Unterwelt',
]


def main():
    with open(SKILL_PATH, encoding='utf-8') as f:
        mog_skills = json.load(f)
    with open(COSTS_PATH, encoding='utf-8') as f:
        mog_costs = json.load(f)
    with open(EVA_PATH, encoding='utf-8') as f:
        eva = json.load(f)

    eva_skills = {}
    for s in eva['skills']:
        eva_skills[s['name']] = s

    # --- Skills ---
    ok_count = 0
    warn_count = 0
    err_count = 0

    print('\n  --- Skill groups (Mogadil vs EVA) ---')
    for entry in mog_skills['skills']:
        name = entry['name']
        eva_sk = eva_skills.get(name)
        if not eva_sk or entry['certainty'] not in ('assigned', 'ambiguous'):
            continue

        mog_cats = set(entry['groupCostCats'].split('+'))
        if not mog_cats:
            continue

        eva_cats = set(eva_sk.get('groups', []))

        if mog_cats == eva_cats:
            print(f'  [OK]     {name:25s} {entry["groupCostCats"]}')
            ok_count += 1
        elif mog_cats < eva_cats:
            diff = sorted(eva_cats - mog_cats)
            print(f'  [WARN]   {name:25s} {entry["groupCostCats"]}  '
                  f'subset of EVA {sorted(eva_cats)}  (EVA extra: {diff})')
            warn_count += 1
        else:
            diff = sorted(mog_cats - eva_cats)
            print(f'  [ERROR]  {name:25s} {entry["groupCostCats"]}  '
                  f'not in EVA {sorted(eva_cats)}  (Mogadil extra: {diff})')
            err_count += 1

    print(f'\n  Skills: {ok_count} OK, {warn_count} WARN, {err_count} ERROR')

    # --- Type costs ---
    eva_types = {t['id']: t for t in eva['types']}
    cost_ok = 0
    cost_err = 0

    print('\n  --- Type groupCosts (Mogadil vs EVA) ---')
    for cls in mog_costs['classes']:
        cid = cls['id']
        eva_type = eva_types.get(cid)
        if not eva_type:
            continue

        mog_gc = cls['groupCosts']
        eva_gc = eva_type['groupCosts']

        for cat in ALL_CATEGORIES:
            mv = mog_gc.get(cat)
            ev = eva_gc.get(cat)
            if isinstance(mv, int) and isinstance(ev, int):
                if mv == ev:
                    cost_ok += 1
                else:
                    print(f'  [ERROR]  {cid:4s} {cat:12s} Mogadil={mv}  EVA={ev}')
                    cost_err += 1

    print(f'\n  Type groupCosts: {cost_ok} OK, {cost_err} ERROR')


if __name__ == '__main__':
    main()
