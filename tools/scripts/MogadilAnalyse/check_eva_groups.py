"""
Check if eva_kodex skill groups are compatible with Mogadil letter categories.

Reads:
  output/class_skills.json   — skill → letter mapping
  letter_groups.json         — letter → candidate categories
  ../../rules/eva_kodex.json — skill → groups (reference)

For each skill in both sources: if any eva group is NOT in the
letter's candidate categories, report it.
"""

import json
import os
import sys

SCRIPT_DIR = os.path.dirname(__file__)
SKILLS_PATH = os.path.join(SCRIPT_DIR, 'output', 'class_skills.json')
GROUPS_PATH = os.path.join(SCRIPT_DIR, 'letter_groups.json')
EVA_PATH = os.path.join(SCRIPT_DIR, '..', '..', 'rules', 'eva_kodex.json')


def main():
    with open(SKILLS_PATH, encoding='utf-8') as f:
        mog_data = json.load(f)
    with open(GROUPS_PATH, encoding='utf-8') as f:
        groups_data = json.load(f)
    with open(EVA_PATH, encoding='utf-8') as f:
        eva = json.load(f)

    # Build letter → categories
    letter_cats = {
        letter: {g['category'] for g in info['groups']}
        for letter, info in groups_data.items()
    }

    # Build skill → letter from Mogadil
    skill_letter = {}
    for sk in mog_data['skills']:
        skill_letter[sk['name']] = sk['letter']

    # Build eva skills with groups
    eva_skills = {}
    for s in eva['skills']:
        g = s.get('groups')
        if g:
            eva_skills[s['name']] = set(g)

    total = 0
    compatible = 0
    incompatible = 0
    details = []

    for name, eva_groups in sorted(eva_skills.items()):
        letter = skill_letter.get(name)
        if letter is None:
            print(f'  ??? {name:25s} — nicht in Mogadil')
            continue

        candidates = letter_cats.get(letter, set())
        total += 1

        if eva_groups.issubset(candidates):
            compatible += 1
        else:
            incompatible += 1
            extra = eva_groups - candidates
            missing = candidates - eva_groups
            details.append({
                'name': name,
                'letter': letter,
                'eva_groups': sorted(eva_groups),
                'candidates': sorted(candidates),
                'extra': sorted(extra),
                'missing': sorted(missing),
            })

    print(f'Skills in beiden Quellen: {total}')
    print(f'  Gruppen passen zu Letter:   {compatible}')
    print(f'  Gruppen passen NICHT:       {incompatible}')
    print()

    if not details:
        print('Alle eva-Gruppen sind mit den Mogadil-Letters kompatibel.')
        return

    print(f'=== {len(details)} Skills mit inkompatiblen Gruppen ===')
    print()
    for d in details:
        print(f'{d["name"]:30s} Letter={d["letter"]}')
        print(f'  eva-Gruppen:    {d["eva_groups"]}')
        print(f'  Kandidaten:     {d["candidates"]}')
        print(f'  Nicht in Letter: {d["extra"]}')
        print()


if __name__ == '__main__':
    main()
