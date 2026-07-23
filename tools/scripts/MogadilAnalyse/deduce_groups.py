"""
Deduce skill groups using MIN over skill's used categories.

Model: skill_cost = min({cost_cat for cat in used_cats})
  - used_cats is a subset of the letter's categories
  - First try ALL letter cats (if consistent everywhere)
  - Then fall back to 1-2 subset search (same as v2)

Key evidence:
  - Gassenwissen (G=3cats): ALL 3 cats → MIN consistent everywhere
  - Klettern (A=4cats): uses only 3 of 4 (not Kampf), caught by fallback
  - Betäuben (K=2cats): eva says {Halbwelt+Kampf} not {Kampf+Unterwelt} → cross-letter data anomaly
"""

import json
import os
import sys
from collections import Counter
from itertools import combinations

_SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'scripts')
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from helpers import get_app_version

SCRIPT_DIR = os.path.dirname(__file__)
SKILLS_PATH = os.path.join(SCRIPT_DIR, 'output', 'class_skills.json')
GROUPS_PATH = os.path.join(SCRIPT_DIR, 'letter_groups.json')
SKILL_OUT_PATH = os.path.join(SCRIPT_DIR, 'output', 'skill_groups_min.json')

COSTS_OUT_PATH = os.path.join(SCRIPT_DIR, 'output', 'class_group_costs_min.json')
ALL_CATEGORIES = [
    'Alltag', 'Halbwelt', 'Kampf', 'Körper',
    'Freiland', 'Wissen', 'Sozial', 'Unterwelt',
]

SINGLE_CAT_LETTERS = {
    'C': 'Freiland', 'D': 'Körper', 'I': 'Wissen', 'L': 'Kampf',
}


def load_data():
    with open(SKILLS_PATH, encoding='utf-8') as f:
        skills_data = json.load(f)
    with open(GROUPS_PATH, encoding='utf-8') as f:
        groups_data = json.load(f)
    return skills_data, groups_data


def letter_categories(groups_data: dict) -> dict[str, list[str]]:
    return {
        letter: sorted({g['category'] for g in info['groups']})
        for letter, info in groups_data.items()
    }


def skill_cost_vector(sk, all_cids) -> tuple:
    return tuple(
        sk['costs'].get(cid) if isinstance(sk['costs'].get(cid), int) else None
        for cid in all_cids
    )


# ---------------------------------------------------------------------------
#  Cost helpers (lower/upper bounds, same as v1/v2)
# ---------------------------------------------------------------------------


def set_lower(lower: dict, cid: str, cat: str, v: int):
    cur = lower.get(cid, {}).get(cat)
    if cur is None or v > cur:
        lower.setdefault(cid, {})[cat] = v


def set_upper(upper: dict, cid: str, cat: str, v: int):
    cur = upper.get(cid, {}).get(cat)
    if cur is None or v < cur:
        upper.setdefault(cid, {})[cat] = v


def confirmed_cost(lower: dict, upper: dict, cid: str, cat: str) -> int | None:
    lb = lower.get(cid, {}).get(cat)
    ub = upper.get(cid, {}).get(cat)
    if lb is not None and ub is not None and lb == ub:
        return lb
    return None


# ---------------------------------------------------------------------------
#  2-candidate letter solver (vector matching, same as v1/v2)
# ---------------------------------------------------------------------------


def solve_2cat_letter(
    skills_in_letter, cat1, cat2, lower, upper, all_cids, log
):
    known_cat1 = tuple(
        confirmed_cost(lower, upper, cid, cat1) for cid in all_cids
    )
    if all(v is None for v in known_cat1):
        return {}, None, [sk['name'] for _, sk in skills_in_letter]

    skills_dict = dict(skills_in_letter)

    cat1_skills = []
    other_skills = []
    for i in skills_dict:
        sk = skills_dict[i]
        vec = skill_cost_vector(sk, all_cids)
        if all(
            a is not None and b is not None and a == b
            for a, b in zip(vec, known_cat1) if a is not None
        ):
            cat1_skills.append(i)
        else:
            other_skills.append((i, vec, sk))

    vec_counts = Counter(vec for _, vec, _ in other_skills)

    assigned = {}
    contradictions = []

    if not other_skills:
        for i in cat1_skills:
            assigned[i] = {cat1}
        return assigned, None, []

    vec_candidates = sorted(vec_counts.items(), key=lambda x: -x[0].count(None))

    best_contradictions = len(other_skills) + 1
    best_assignment = None
    best_cat2 = None
    best_contras = []

    for cand_vec, _ in vec_candidates:
        if any(v is None for v in cand_vec):
            continue

        current = {}
        contras = []

        for i in cat1_skills:
            current[i] = {cat1}

        for other_idx, vec, sk in other_skills:
            if all(a == b for a, b in zip(vec, cand_vec) if a is not None):
                current[other_idx] = {cat2}
            else:
                ok = True
                for idx, cid in enumerate(all_cids):
                    v = sk['costs'].get(cid)
                    k1 = confirmed_cost(lower, upper, cid, cat1)
                    k2 = cand_vec[idx]
                    if not isinstance(v, int) or k1 is None or k2 is None:
                        continue
                    if min(k1, k2) != v:
                        ok = False
                        break
                if ok:
                    current[other_idx] = {cat1, cat2}
                else:
                    contras.append(sk['name'])
                    current[other_idx] = {cat1, cat2}

        n_contra = len(contras)
        if n_contra < best_contradictions:
            best_contradictions = n_contra
            best_assignment = current
            best_cat2 = cand_vec
            best_contras = list(contras)
            if n_contra == 0:
                break

    if best_assignment is None:
        best_assignment = {}
        for i in skills_dict:
            if all(
                a is not None and b is not None and a == b
                for a, b in zip(skill_cost_vector(skills_dict[i], all_cids), known_cat1)
                if a is not None
            ):
                best_assignment[i] = {cat1}
            else:
                best_assignment[i] = {cat1, cat2}
                contradictions.append(skills_dict[i]['name'])
        best_cat2 = None

    return best_assignment, best_cat2, best_contras


# ---------------------------------------------------------------------------
#  Multi-category subset evaluation
#  Extended: first tries ALL cats; falls back to 1-2 subsets
# ---------------------------------------------------------------------------


def check_full_set(sk, cats, lower, upper, all_cids):
    """
    Check if the full category set is consistent: min(all cats) = observed
    in all classes. Returns True only if:
    - All category costs are confirmed and their min == observed, OR
    - Confirmed costs are >= observed AND no unconfirmed cat could be cheaper.
    """
    for cid in all_cids:
        observed = sk['costs'].get(cid)
        if not isinstance(observed, int):
            continue

        all_known = True
        for cat in cats:
            cc = confirmed_cost(lower, upper, cid, cat)
            if cc is None:
                all_known = False

        if all_known:
            confirmed_vals = [
                confirmed_cost(lower, upper, cid, cat)
                for cat in cats
            ]
            if min(confirmed_vals) != observed:
                return False
        else:
            # Partial check: reject if any unconfirmed cat COULD be cheaper
            for cat in cats:
                cc = confirmed_cost(lower, upper, cid, cat)
                if cc is not None:
                    if cc < observed:
                        return False
                else:
                    lb = lower.get(cid, {}).get(cat)
                    if lb is None or lb < observed:
                        return False
    return True


def evaluate_multicat_subsets(sk, cats, lower, upper, all_cids):
    """
    Evaluate subsets from largest to smallest for a multi-cat skill.
    Starts from N-1-cat subsets down to 1-cat (full-set is checked separately).

    Returns list of (subset, confidence, lessons) sorted by:
      1. size descending (larger subsets preferred)
      2. confidence descending
    """
    cat_list = list(cats)
    subsets = []
    for r in range(len(cat_list), 0, -1):  # N down to 1
        for combo in combinations(cat_list, r):
            subsets.append(set(combo))

    results = []

    for subset in subsets:
        confidence = 0
        lessons = {}
        valid = True

        for cid in all_cids:
            observed = sk['costs'].get(cid)
            if not isinstance(observed, int):
                continue

            # Gather confirmed and unknown cats
            confirmed_vals = {}
            unknown_cats = list(subset)
            for c in subset:
                cc = confirmed_cost(lower, upper, cid, c)
                if cc is not None:
                    confirmed_vals[c] = cc
                    unknown_cats.remove(c)

            min_confirmed = min(confirmed_vals.values()) if confirmed_vals else None

            # A confirmed cat with cost < observed → invalid
            if min_confirmed is not None and min_confirmed < observed:
                valid = False
                break

            # Check lower bounds on unknowns
            for c in unknown_cats:
                lb = lower.get(cid, {}).get(c)
                if lb is not None and lb > observed:
                    valid = False
                    break
            if not valid:
                break

            if len(unknown_cats) == 0:
                if min_confirmed == observed:
                    confidence += 1
                else:
                    valid = False
                    break

            elif len(unknown_cats) == 1:
                uc = unknown_cats[0]
                if min_confirmed is not None and min_confirmed > observed:
                    # The one unknown must = observed
                    lessons[(cid, uc)] = observed
                    confidence += 1
                elif min_confirmed is not None and min_confirmed == observed:
                    confidence += 1
                else:
                    # No confirmed, just check bounds
                    confidence += 1

            else:
                # Multiple unknowns
                if min_confirmed is not None and min_confirmed == observed:
                    confidence += 1
                elif min_confirmed is not None and min_confirmed > observed:
                    # Need at least one unknown = observed
                    any_possible = False
                    for uc in unknown_cats:
                        ub = upper.get(cid, {}).get(uc)
                        if ub is None or observed <= ub:
                            any_possible = True
                            break
                    if not any_possible:
                        valid = False
                        break
                    confidence += 1
                else:
                    confidence += 1

        if valid:
            results.append((frozenset(subset), confidence, lessons))

    results.sort(key=lambda x: (-len(x[0]), -x[1]))
    return results


# ---------------------------------------------------------------------------
#  Main deduction
# ---------------------------------------------------------------------------


def deduce(log=print):
    log('Loading data...')
    data, groups_data = load_data()
    skills = data['skills']
    all_cids = data['classColumns']
    letter_cats_map = letter_categories(groups_data)
    log(f'  {len(skills)} skills, {len(all_cids)} classes, '
        f'{len(letter_cats_map)} letters')

    lower: dict[str, dict[str, int | None]] = {
        cid: {cat: None for cat in ALL_CATEGORIES}
        for cid in all_cids
    }
    upper: dict[str, dict[str, int | None]] = {
        cid: {cat: None for cat in ALL_CATEGORIES}
        for cid in all_cids
    }

    assigned: dict[int, set[str]] = {}
    ambiguous: dict[int, list[set[str]]] = {}
    contradictions: dict[int, str] = {}

    # -----------------------------------------------------------------------
    #  Phase 1: Single-category letters
    # -----------------------------------------------------------------------
    for i, sk in enumerate(skills):
        letter = sk['letter']
        if letter in SINGLE_CAT_LETTERS:
            cat = SINGLE_CAT_LETTERS[letter]
            assigned[i] = {cat}
            for cid in all_cids:
                cost = sk['costs'].get(cid)
                if isinstance(cost, int):
                    set_lower(lower, cid, cat, cost)
                    set_upper(upper, cid, cat, cost)

    n_p1 = len(assigned)
    log(f'  Phase 1: {n_p1} single-category assignments')

    # -----------------------------------------------------------------------
    #  Phase 2: 2-candidate letters with known cat1
    # -----------------------------------------------------------------------
    two_cat_letters = {
        letter: cats for letter, cats in letter_cats_map.items()
        if len(cats) == 2
    }

    total_phase2 = 0
    p2_contradictions = 0
    for letter, cats in sorted(two_cat_letters.items()):
        cat1, cat2 = cats[0], cats[1]

        if cat1 in SINGLE_CAT_LETTERS.values():
            pass
        elif cat2 in SINGLE_CAT_LETTERS.values():
            cat1, cat2 = cat2, cat1
        else:
            continue

        cat1_known = any(
            confirmed_cost(lower, upper, cid, cat1) is not None
            for cid in all_cids[:10]
        )
        if not cat1_known:
            continue

        letter_skills = [
            (i, sk) for i, sk in enumerate(skills)
            if sk['letter'] == letter and i not in assigned
            and i not in contradictions
        ]
        if not letter_skills:
            continue

        log(f'  Phase 2: letter {letter} ({cat1}/{cat2}): '
            f'{len(letter_skills)} skills')

        result, matched_vec, contras = solve_2cat_letter(
            letter_skills, cat1, cat2, lower, upper, all_cids, log
        )

        for i, subset in result.items():
            if i not in contradictions:
                assigned[i] = subset

        if matched_vec is not None:
            for idx, cid in enumerate(all_cids):
                v = matched_vec[idx]
                if v is not None:
                    set_lower(lower, cid, cat2, v)
                    set_upper(upper, cid, cat2, v)

        total_phase2 += len(letter_skills)
        p2_contradictions += len(contras)
        for name in contras:
            idx = next(i for i, sk in letter_skills if sk['name'] == name)
            contradictions[idx] = name
            if idx in assigned:
                del assigned[idx]

    log(f'  Phase 2: {total_phase2} assigned, {p2_contradictions} contradictions')

    # -----------------------------------------------------------------------
    #  Phase 3: Iterative multi-cat + 2-cat leftovers
    # -----------------------------------------------------------------------
    #  3a. First try FULL category set for multi-cat skills
    #  3b. Fall back to 1-2 subset search if full set fails
    #  3c. Retry 2-cat letters whose cat1 became confirmed during iteration
    # -----------------------------------------------------------------------

    total_phase3_n = 0
    p3_contradictions = 0

    changed = True
    while changed:
        changed = False

        # --- Process 2-cat letters whose cat1 became confirmed ---
        for letter, cats in sorted(two_cat_letters.items()):
            letter_skills = [
                (i, sk) for i, sk in enumerate(skills)
                if sk['letter'] == letter and i not in assigned
                and i not in contradictions
            ]
            if not letter_skills:
                continue

            for cat1_idx in range(2):
                cat1 = cats[cat1_idx]
                cat2 = cats[1 - cat1_idx]
                cat1_any = any(
                    confirmed_cost(lower, upper, cid, cat1) is not None
                    for cid in all_cids[:10]
                )
                if cat1_any:
                    result, matched_vec, contras = solve_2cat_letter(
                        letter_skills, cat1, cat2, lower, upper, all_cids, log
                    )

                    for i, subset in result.items():
                        if i not in assigned and i not in contradictions:
                            assigned[i] = subset
                            total_phase3_n += 1
                            changed = True

                    if matched_vec is not None:
                        for idx, cid in enumerate(all_cids):
                            v = matched_vec[idx]
                            if v is not None:
                                set_lower(lower, cid, cat2, v)
                                set_upper(upper, cid, cat2, v)

                    for name in contras:
                        idx = next(
                            (i for i, sk in letter_skills if sk['name'] == name),
                            None
                        )
                        if idx is not None and idx not in contradictions:
                            contradictions[idx] = name
                            p3_contradictions += 1
                            changed = True
                    break

        # --- Process multi-cat skills (A, E, G, H) ---
        for i, sk in enumerate(skills):
            if i in assigned or i in contradictions:
                continue
            letter = sk['letter']
            cats_set = letter_cats_map.get(letter)
            if not cats_set or len(cats_set) <= 2:
                continue

            # Step 1: Try full category set
            if check_full_set(sk, cats_set, lower, upper, all_cids):
                assigned[i] = set(cats_set)
                changed = True
                total_phase3_n += 1

                # Propagate lower bounds from full-set assignment
                for cid in all_cids:
                    v = sk['costs'].get(cid)
                    if isinstance(v, int):
                        for cat in cats_set:
                            set_lower(lower, cid, cat, v)
                continue  # success, skip fallback

            # Step 2: Fall back to subset search (N-1 down to 1)
            results = evaluate_multicat_subsets(
                sk, cats_set, lower, upper, all_cids
            )

            if len(results) == 0:
                contradictions[i] = sk['name']
                p3_contradictions += 1
                changed = True
            elif len(results) == 1:
                subset, conf, lessons = results[0]
                assigned[i] = set(subset)
                changed = True
                total_phase3_n += 1
                for (cid, cat), cost in lessons.items():
                    set_lower(lower, cid, cat, cost)
                    set_upper(upper, cid, cat, cost)
                if len(subset) == 1:
                    c = next(iter(subset))
                    for cid in all_cids:
                        v = sk['costs'].get(cid)
                        if isinstance(v, int):
                            set_lower(lower, cid, c, v)
                            set_upper(upper, cid, c, v)
                else:
                    for cid in all_cids:
                        v = sk['costs'].get(cid)
                        if isinstance(v, int):
                            for cat in subset:
                                set_lower(lower, cid, cat, v)
            else:
                top = results[0]
                second = results[1]
                if top[1] > second[1] and top[1] >= 1:
                    subset = top[0]
                    lessons = top[2]
                    assigned[i] = set(subset)
                    changed = True
                    total_phase3_n += 1
                    for (cid, cat), cost in lessons.items():
                        set_lower(lower, cid, cat, cost)
                        set_upper(upper, cid, cat, cost)
                    if len(subset) == 1:
                        c = next(iter(subset))
                        for cid in all_cids:
                            v = sk['costs'].get(cid)
                            if isinstance(v, int):
                                set_lower(lower, cid, c, v)
                                set_upper(upper, cid, c, v)
                    else:
                        for cid in all_cids:
                            v = sk['costs'].get(cid)
                            if isinstance(v, int):
                                for cat in subset:
                                    set_lower(lower, cid, cat, v)

    # Collect remaining as ambiguous
    for i, sk in enumerate(skills):
        if i in assigned or i in contradictions:
            continue
        letter = sk['letter']
        cats_set = letter_cats_map.get(letter)
        if not cats_set:
            continue
        results = evaluate_multicat_subsets(sk, cats_set, lower, upper, all_cids)
        if len(results) == 0:
            contradictions[i] = sk['name']
            p3_contradictions += 1
        elif len(results) > 0:
            ambiguous[i] = [r[0] for r in results]

    p3_ambiguous = len(ambiguous)
    log(f'  Phase 3: {total_phase3_n} assigned, {p3_ambiguous} ambiguous, '
        f'{p3_contradictions} contradictions')

    # Stats
    known_count = sum(
        1 for cid in all_cids
        for cat in ALL_CATEGORIES
        if confirmed_cost(lower, upper, cid, cat) is not None
    )
    log(f'\n  Total assigned: {len(assigned)}')
    log(f'  Ambiguous: {len(ambiguous)}')
    log(f'  Contradictions: {len(contradictions)}')
    log(f'  Confirmed group costs: {known_count} / '
        f'{len(all_cids) * len(ALL_CATEGORIES)}')

    if ambiguous:
        log(f'\n  Ambiguous skills:')
        for i, subsets in list(ambiguous.items())[:10]:
            subsets_str = ['/'.join(sorted(s)) for s in subsets]
            log(f'    {skills[i]["name"]:25s} letter={skills[i]["letter"]} '
                f'options={subsets_str}')
        if len(ambiguous) > 10:
            log(f'    ... and {len(ambiguous) - 10} more')

    if contradictions:
        log(f'\n  Contradictions:')
        for i, name in list(contradictions.items())[:10]:
            log(f'    {name:25s} letter={skills[i]["letter"]}')
        if len(contradictions) > 10:
            log(f'    ... and {len(contradictions) - 10} more')

    # Build output
    app_ver = get_app_version()

    class_costs_out = []
    for cid in all_cids:
        entry = {'id': cid, 'groupCosts': {}}
        for cat in ALL_CATEGORIES:
            cc = confirmed_cost(lower, upper, cid, cat)
            if cc is not None:
                entry['groupCosts'][cat] = cc
            else:
                lb = lower.get(cid, {}).get(cat)
                entry['groupCosts'][cat] = lb
        class_costs_out.append(entry)

    costs_output = {
        'version': app_ver,
        'source': 'class_skills.json',
        'method': 'full_category_min',
        'classes': class_costs_out,
    }

    skill_groups_out = []
    for i, sk in enumerate(skills):
        entry = {
            'name': sk['name'],
            'letter': sk['letter'],
            'groupCostCats': '',
            'certainty': 'unknown',
        }
        if i in assigned:
            entry['groupCostCats'] = '+'.join(sorted(assigned[i]))
            entry['certainty'] = 'assigned'
        elif i in contradictions:
            entry['certainty'] = 'contradiction'
        elif i in ambiguous:
            opt_strs = ['/'.join(sorted(s)) for s in ambiguous[i]]
            entry['groupCostCats'] = opt_strs[0]
            entry['certainty'] = 'ambiguous'

        skill_groups_out.append(entry)

    groups_output = {
        'version': app_ver,
        'source': 'class_skills.json',
        'method': 'full_category_min',
        'skills': skill_groups_out,
    }

    return groups_output, costs_output


def verify_output(groups_output, costs_output, log=print):
    eva_path = os.path.join(SCRIPT_DIR, '..', '..', 'rules', 'eva_kodex.json')
    if not os.path.exists(eva_path):
        log('\n  eva_kodex.json not found -- skipping verification')
        return

    with open(eva_path, encoding='utf-8') as f:
        eva = json.load(f)

    eva_skills = {}
    for sk in eva['skills']:
        eva_skills[sk['name']] = sk

    ok_count = 0
    warn_count = 0
    err_count = 0

    log('\n  --- Skill groups (Mogadil vs EVA) ---')
    for entry in groups_output['skills']:
        name = entry['name']
        eva_sk = eva_skills.get(name)
        if not eva_sk or entry['certainty'] not in ('assigned', 'ambiguous'):
            continue

        mog_cats = set(entry['groupCostCats'].split('+'))
        if not mog_cats:
            continue

        eva_cats = set(eva_sk.get('groups', []))

        if mog_cats == eva_cats:
            log(f'  [OK]     {name:25s} {entry["groupCostCats"]}')
            ok_count += 1
        elif mog_cats < eva_cats:
            diff = sorted(eva_cats - mog_cats)
            log(f'  [WARN]   {name:25s} {entry["groupCostCats"]}  subset of EVA {sorted(eva_cats)}  '
                f'(EVA extra: {diff})')
            warn_count += 1
        else:
            diff = sorted(mog_cats - eva_cats)
            log(f'  [ERROR]  {name:25s} {entry["groupCostCats"]}  not in EVA {sorted(eva_cats)}  '
                f'(Mogadil extra: {diff})')
            err_count += 1

    log(f'\n  Skills: {ok_count} OK, {warn_count} WARN, {err_count} ERROR')

    # -----------------------------------------------------------------------
    #  Type cost comparison
    # -----------------------------------------------------------------------
    eva_types = {t['id']: t for t in eva['types']}
    cost_ok = 0
    cost_err = 0

    log('\n  --- Type groupCosts (Mogadil vs EVA) ---')
    for cls in costs_output['classes']:
        cid = cls['id']
        eva_type = eva_types.get(cid)
        if not eva_type:
            continue

        mog_costs = cls['groupCosts']
        eva_gc = eva_type['groupCosts']

        for cat in ALL_CATEGORIES:
            mv = mog_costs.get(cat)
            ev = eva_gc.get(cat, '?')
            if isinstance(mv, int) and isinstance(ev, int):
                if mv == ev:
                    cost_ok += 1
                else:
                    log(f'  [ERROR]  {cid:4s} {cat:12s} Mogadil={mv}  EVA={ev}')
                    cost_err += 1

    log(f'\n  Type groupCosts: {cost_ok} OK, {cost_err} ERROR')


if __name__ == '__main__':
    groups_output, costs_output = deduce()

    os.makedirs(os.path.join(SCRIPT_DIR, 'output'), exist_ok=True)

    with open(SKILL_OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(groups_output, f, indent=2, ensure_ascii=False)

    with open(COSTS_OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(costs_output, f, indent=2, ensure_ascii=False)

    print(f'\nWritten: {SKILL_OUT_PATH}')
    print(f'Written: {COSTS_OUT_PATH}')

    verify_output(groups_output, costs_output)
