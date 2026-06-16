#!/usr/bin/env python3
"""
Compare two spell JSON files and report differences.

Usage:
    python compare_spells.py <file_a.json> <file_b.json>
"""

import json
import sys
from pathlib import Path


# ── Comparison functions ────────────────────────────────────────────────
# Each function takes (value_a, value_b) and returns True if considered equal.
# Add field-specific normalisation here (e.g. "Wortzauber" vs "Wort").

def compare_exact(a, b):
    return a == b


def compare_learn_cost(a, b):
    # Both None/missing or same value → equal
    if a is None and b is None:
        return True
    return a == b


def compare_level(a, b):
    return a == b


def compare_spell_group(a, b):
    return a == b


def compare_target_type(a, b):
    return a == b


def compare_origin(a, b):
    return a == b


# ── Config: which fields to compare ─────────────────────────────────────
# Each entry: (field_name, compare_func)
# Easily extendable: add a (field_name, compare_func) tuple.
COMPARE_FIELDS = [
    ("level",       compare_level),
    ("learnCost",   compare_learn_cost),
    ("spellGroup",  compare_spell_group),
    ("targetType",  compare_target_type),
    ("origin",      compare_origin),
]


# ── Helpers ─────────────────────────────────────────────────────────────

def load_spells(path: str) -> dict:
    """Load JSON and return a dict of {id: spell}."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    spells = data.get("spells", [])
    return {s["id"]: s for s in spells}


def fmt(val) -> str:
    """Format a value for display."""
    if val is None:
        return "(fehlt)"
    return str(val)


# ── Main ────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) != 3:
        print("Usage: python compare_spells.py <file_a.json> <file_b.json>")
        sys.exit(1)

    path_a, path_b = sys.argv[1], sys.argv[2]

    name_a = Path(path_a).stem
    name_b = Path(path_b).stem

    spells_a = load_spells(path_a)
    spells_b = load_spells(path_b)

    ids_a = set(spells_a.keys())
    ids_b = set(spells_b.keys())

    # ── Spells only in one file ─────────────────────────────────────────
    only_in_a = sorted(ids_a - ids_b)
    only_in_b = sorted(ids_b - ids_a)

    print(f"── Nur in A ({name_a}) ({len(only_in_a)}) ──")
    for sid in only_in_a:
        print(f"  {sid}")

    print(f"\n── Nur in B ({name_b}) ({len(only_in_b)}) ──")
    for sid in only_in_b:
        print(f"  {sid}")

    # ── Differences in shared spells ────────────────────────────────────
    common = sorted(ids_a & ids_b)
    diffs = []

    for sid in common:
        sa = spells_a[sid]
        sb = spells_b[sid]

        for field_name, compare_func in COMPARE_FIELDS:
            va = sa.get(field_name)
            vb = sb.get(field_name)

            if not compare_func(va, vb):
                diffs.append((sid, field_name, fmt(va), fmt(vb)))

    print(f"\n── Unterschiede bei gemeinsamen Sprüchen ({len(diffs)}) ──")
    if diffs:
        print(f"{'Spruch':30s} | {'Feld':15s} | {name_a:20s} | {name_b:20s}")
        print("-" * 90)
        for sid, field, va, vb in diffs:
            print(f"{sid:30s} | {field:15s} | {va:20s} | {vb:20s}")

    # ── Summary ─────────────────────────────────────────────────────────
    print(f"\n── Zusammenfassung ──")
    print(f"  A ({name_a}): {len(spells_a)} Sprüche")
    print(f"  B ({name_b}): {len(spells_b)} Sprüche")
    print(f"  Gemeinsam: {len(common)}")
    print(f"  Nur in A ({name_a}):  {len(only_in_a)}")
    print(f"  Nur in B ({name_b}):  {len(only_in_b)}")
    print(f"  Feld-Unterschiede: {len(diffs)}")


if __name__ == "__main__":
    main()
