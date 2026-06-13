#!/usr/bin/env python3
"""
Compare two skill JSON files and report differences.

Usage:
    python compare_skills.py <file_a.json> <file_b.json>
"""

import json
import sys
from pathlib import Path


# ── Comparison functions ────────────────────────────────────────────────

def compare_exact(a, b):
    return a == b


def compare_learn_cost(a, b):
    return a == b


def compare_advancement_costs(a, b):
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return list(a) == list(b)


def compare_base_value(a, b):
    return a == b


def compare_max_value(a, b):
    return a == b


def compare_linked_property(a, b):
    # Normalise: None and "" are considered equivalent
    if (a is None or a == "") and (b is None or b == ""):
        return True
    return a == b


def compare_groups(a, b):
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return sorted(a) == sorted(b)


# ── Config: which fields to compare ─────────────────────────────────────

COMPARE_FIELDS = [
    ("learnCost",         compare_learn_cost),
    ("advancementCosts",  compare_advancement_costs),
    ("baseValue",         compare_base_value),
    ("maxValue",          compare_max_value),
    ("linkedProperty",    compare_linked_property),
    ("groups",            compare_groups),
]


# ── Helpers ─────────────────────────────────────────────────────────────

def load_skills(path: str) -> dict:
    """Load JSON and return a dict of {id: skill}."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    skills = data.get("skills", [])
    return {s["id"]: s for s in skills}


def fmt(val) -> str:
    """Format a value for display."""
    if val is None:
        return "(fehlt)"
    s = json.dumps(val, ensure_ascii=False)
    if len(s) > 40:
        s = s[:37] + "..."
    return s


# ── Main ────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) != 3:
        print("Usage: python compare_skills.py <file_a.json> <file_b.json>")
        sys.exit(1)

    path_a, path_b = sys.argv[1], sys.argv[2]
    name_a = Path(path_a).stem
    name_b = Path(path_b).stem

    skills_a = load_skills(path_a)
    skills_b = load_skills(path_b)

    ids_a = set(skills_a.keys())
    ids_b = set(skills_b.keys())

    # ── Skills only in one file ─────────────────────────────────────────
    only_in_a = sorted(ids_a - ids_b)
    only_in_b = sorted(ids_b - ids_a)

    print(f"── Nur in {name_a} ({len(only_in_a)}) ──")
    for sid in only_in_a:
        print(f"  {sid}")

    print(f"\n── Nur in {name_b} ({len(only_in_b)}) ──")
    for sid in only_in_b:
        print(f"  {sid}")

    # ── Differences in shared skills ────────────────────────────────────
    common = sorted(ids_a & ids_b)
    diffs = []

    for sid in common:
        sa = skills_a[sid]
        sb = skills_b[sid]

        for field_name, compare_func in COMPARE_FIELDS:
            va = sa.get(field_name)
            vb = sb.get(field_name)

            if not compare_func(va, vb):
                diffs.append((sid, field_name, fmt(va), fmt(vb)))

    print(f"\n── Unterschiede bei gemeinsamen Fertigkeiten ({len(diffs)}) ──")
    if diffs:
        print(f"{'Fertigkeit':30s} | {'Feld':18s} | {name_a:25s} | {name_b:25s}")
        print("-" * (30 + 3 + 18 + 3 + 25 + 3 + 25))
        for sid, field, va, vb in diffs:
            print(f"{sid:30s} | {field:18s} | {va:25s} | {vb:25s}")

    # ── Summary ─────────────────────────────────────────────────────────
    print(f"\n── Zusammenfassung ──")
    print(f"  {name_a}: {len(skills_a)} Fertigkeiten")
    print(f"  {name_b}: {len(skills_b)} Fertigkeiten")
    print(f"  Gemeinsam: {len(common)}")
    print(f"  Nur in {name_a}: {len(only_in_a)}")
    print(f"  Nur in {name_b}: {len(only_in_b)}")
    print(f"  Feld-Unterschiede: {len(diffs)}")


if __name__ == "__main__":
    main()
