"""
rulebook_combiner.py — Merge JSON section files into a single rulebook file.

Can be imported and used programmatically or run as a standalone script:

    python rulebook_combiner.py <input_dir> <output_file>

Example:
    python rulebook_combiner.py ../../arkanum ../../rules/arkanum.json
"""

import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from helpers import get_app_version


def load_meta(input_dir: str) -> dict:
    """
    Load metadata from meta.json in the input directory.

    Parameters:
        input_dir: Path to the directory containing meta.json

    Returns:
        Dictionary with metadata fields.

    Exits with sys.exit(1) if meta.json is missing or invalid.
    """
    meta_path = os.path.join(input_dir, "meta.json")
    if not os.path.isfile(meta_path):
        print(f"Error: meta.json not found in '{input_dir}'.")
        print("Create a meta.json with: id, title, version, isCore, notes")
        sys.exit(1)

    with open(meta_path, encoding="utf-8") as f:
        try:
            meta = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error: meta.json is not valid JSON: {e}")
            sys.exit(1)

    required_fields = ["id", "title", "version"]
    for field in required_fields:
        if field not in meta:
            print(f"Error: meta.json is missing required field '{field}'.")
            sys.exit(1)

    return meta


def load_sections(input_dir: str) -> dict:
    """
    Load all JSON section files from the input directory.

    Parameters:
        input_dir: Path to the directory containing section JSON files.

    Returns:
        Dictionary where each key is the top-level key from a section file
        and the value is the corresponding data.

    Exits with sys.exit(1) on errors.
    """
    sections: dict = {}

    for filename in sorted(os.listdir(input_dir)):
        if not filename.endswith(".json") or filename == "meta.json":
            continue

        filepath = os.path.join(input_dir, filename)
        with open(filepath, encoding="utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError as e:
                print(f"Error: '{filename}' is not valid JSON: {e}")
                sys.exit(1)

        if not isinstance(data, dict) or len(data) != 1:
            print(f"Error: '{filename}' must contain exactly one top-level key.")
            print(f"  Example: {{\"spells\": [...]}}")
            sys.exit(1)

        key = next(iter(data))
        if key in sections:
            print(f"Error: Duplicate section key '{key}' found in '{filename}'.")
            sys.exit(1)

        sections[key] = data[key]
        print(f"  Loaded section '{key}' from {filename}")

    return sections


def combine(input_dir: str, output_file: str) -> None:
    """
    Combine all section files in input_dir into a single rulebook JSON.

    Parameters:
        input_dir:   Path to directory with section files and meta.json.
        output_file: Path to write the combined output JSON.
    """
    if not os.path.isdir(input_dir):
        print(f"Error: Input directory '{input_dir}' does not exist.")
        sys.exit(1)

    print(f"Reading sections from: {input_dir}")
    meta = load_meta(input_dir)
    sections = load_sections(input_dir)

    if not sections:
        print("Warning: No section files found. Output will contain only metadata.")

    output: dict = {
        "metadata": {
            "id":              meta["id"],
            "title":           meta["title"],
            "version":         meta["version"],
            "scriptVersion":   get_app_version(),
            "priority":      meta.get("priority", 0),
            "createdAt":   date.today().isoformat(),
            "notes":       meta.get("notes", ""),
        }
    }
    output.update(sections)

    os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Combined rulebook written to: {output_file}")
    print(f"  Sections: {list(sections.keys())}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python rulebook_combiner.py <input_dir> <output_file>")
        sys.exit(1)

    combine(input_dir=sys.argv[1], output_file=sys.argv[2])
