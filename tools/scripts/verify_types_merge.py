#!/usr/bin/env python3
"""
verify_types_merge.py
---------------------
Verifies that the per-book character-type tables merge into the expected
reference shape found in tools/rules/mogadil.json.

Merge rules ("first key wins"), matching the PWA's type model:
  * Books are merged in priority order: Kodex -> Mysterium -> Ars Armorum.
  * For each type id, scalar fields (name, category) come from the first
    book that defines them.
  * For each cost map (groupCosts, spellCosts, fightCosts) the merge runs
    per group key — every group keeps the value from the first book that
    provides it. This preserves later additions (e.g. Mysterium adds
    "Zaubersalze" without dropping the Kodex base).

Reference: tools/rules/mogadil.json is treated as ground truth that the
combined book tables must reproduce. By default only genuine value
mismatches on the shared fields are printed; fields present on only one
side are shown with --verbose. Only value mismatches drive the exit code.

Usage:
    python tools/scripts/verify_types_merge.py
    python tools/scripts/verify_types_merge.py --verbose
"""

import argparse
import json
import os
import sys

# Force UTF-8 output so box-drawing chars render on Windows consoles.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Books in merge priority order (first wins).
BOOK_FILES = [
    os.path.join("tools", "kodex",     "types.json"),
    os.path.join("tools", "mysterium", "types.json"),
    os.path.join("tools", "armorum",   "types.json"),
]
REFERENCE = os.path.join("tools", "rules", "mogadil.json")

# Cost maps are merged per group-key; scalar fields win as a whole.
COST_FIELDS = ["groupCosts", "spellCosts", "fightCosts"]
SCALAR_FIELDS = ["name", "category"]


def load_types(path: str) -> dict:
    """Load a types.json section file and return {type_id: entry}."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return {t["id"]: t for t in data.get("types", [])}


def merge_books(root: str) -> dict:
    """
    Merge the per-book type tables, first key wins at both scopes.

    Parameters:
        root: repository root directory

    Returns:
        {type_id: merged_entry}
    """
    merged: dict = {}

    for rel in BOOK_FILES:
        per_book = load_types(os.path.join(root, rel))
        for tid, book_entry in per_book.items():
            target = merged.setdefault(tid, {})

            # Scalars (name, category): first provider wins.
            for key in SCALAR_FIELDS:
                if key not in target and key in book_entry:
                    target[key] = book_entry[key]

            # Cost maps: merge per group-key, first provider per key.
            for key in COST_FIELDS:
                if key not in book_entry:
                    continue
                sub = target.setdefault(key, {})
                for group, value in book_entry[key].items():
                    sub.setdefault(group, value)

    return merged


def cost_diffs(field: str, expected: dict, reference: dict, include_missing: bool) -> list[str]:
    """
    Compare one cost map against the reference and list per-group diffs.

    Parameters:
        field:          groupCosts / spellCosts / fightCosts (for messages)
        expected:       merged book costs
        reference:      reference costs
        include_missing: also report groups present on only one side

    Returns:
        List of human-readable difference lines (empty if identical).
    """
    lines = []
    for group in sorted(set(expected) | set(reference)):
        ev = expected.get(group)
        rv = reference.get(group)
        if ev is None:
            if include_missing:
                lines.append(f"      {field}.{group}  nur in Referenz: {rv!r}")
        elif rv is None:
            if include_missing:
                lines.append(f"      {field}.{group}  nur im Merge:   {ev!r}")
        elif ev != rv:
            lines.append(f"      {field}.{group}: {ev} != {rv}")
    return lines


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-v", "--verbose", action="store_true",
                        help="Also report missing/coverage entries (types or "
                             "cost groups present on only one side).")
    args = parser.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    missing = [rel for rel in BOOK_FILES if not os.path.isfile(os.path.join(root, rel))]
    if missing:
        print("ERROR: fehlende Buch-datei(en): " + ", ".join(missing))
        sys.exit(2)
    if not os.path.isfile(os.path.join(root, REFERENCE)):
        print(f"ERROR: Referenz fehlt: {REFERENCE}")
        sys.exit(2)

    for rel in BOOK_FILES:
        print(f"Buch: {rel:30s} {len(load_types(os.path.join(root, rel))):3d} Typen")

    merged = merge_books(root)
    ref = load_types(os.path.join(root, REFERENCE))

    only_merge = sorted(set(merged) - set(ref))
    only_ref = sorted(set(ref) - set(merged))
    common = sorted(set(merged) & set(ref))

    print(f"\nMerge: {len(merged)} Typen | Referenz: {len(ref)} | Gemeinsam: {len(common)}")
    if args.verbose:
        if only_merge:
            print(f"  Nur im Merge:        {', '.join(only_merge)}")
        if only_ref:
            print(f"  Nur in der Referenz:  {', '.join(only_ref)}")

    # Gather mismatches on the shared fields.
    scalars_diffs: list[tuple[str, str, object, object]] = []
    cost_diffs_by_type: dict[str, list[str]] = {}

    for tid in common:
        me, refl = merged[tid], ref[tid]

        for field in SCALAR_FIELDS:
            mv, rv = me.get(field), refl.get(field)
            if mv != rv:
                scalars_diffs.append((tid, field, mv, rv))

        for field in COST_FIELDS:
            lines = cost_diffs(field, me.get(field, {}), refl.get(field, {}),
                               include_missing=args.verbose)
            if lines:
                cost_diffs_by_type.setdefault(tid, []).extend(lines)

    # ── Scalar mismatches (name / category) ──────────────────────────────
    print(f"\n── Skalare Abweichungen ({len(scalars_diffs)}) ──")
    for tid, field, mv, rv in sorted(scalars_diffs):
        print(f"  {tid:5s} {field:9s} {mv!r}  !=  {rv!r}")

    # ── Cost-map mismatches ──────────────────────────────────────────────
    print(f"\n── Kosten-Abweichungen ({len(cost_diffs_by_type)} Typen betroffen) ──")
    for tid in sorted(cost_diffs_by_type):
        for line in cost_diffs_by_type[tid]:
            print(f"  {tid:14s}{line}")

    # ── Summary ──────────────────────────────────────────────────────────
    print(f"\n── Zusammenfassung ──")
    print(f"  Gemeinsame Typen:    {len(common)}")
    print(f"  Namens-Abweichungen: {len([d for d in scalars_diffs if d[1] == 'name'])}")
    print(f"  Kategorie-Abweichung:{len([d for d in scalars_diffs if d[1] == 'category'])}")
    print(f"  Kosten-Abweichungen: {len(cost_diffs_by_type)} Typen")
    if args.verbose:
        print(f"  Nur im Merge:        {len(only_merge)}")
        print(f"  Nur in Referenz:     {len(only_ref)}")

    # Reference coverage differences (only_merge / only_ref) are
    # informational; real value mismatches drive the exit code.
    bad = bool(scalars_diffs) or bool(cost_diffs_by_type)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()