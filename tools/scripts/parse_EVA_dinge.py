import json
import argparse
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
from helpers import attr

WEAPON_GROUPS = {'Waffen (Fern)', 'Waffen (Angriff)'}

def parse_ding(el: ET.Element) -> dict:
    name = attr(el, 'name')
    group = attr(el, 'gruppe')
    return {
        'id': name,
        'name': name,
        'groups': [group],
        'damage': '',
        'propertyRestrictions': {},
        'distance': []
    }

def parse_dinge_document(xml_path: str) -> dict:
    tree = ET.parse(xml_path)
    root = tree.getroot()

    weapons = []
    for el in root.findall('ding'):
        group = attr(el, 'gruppe')
        if group in WEAPON_GROUPS:
            weapons.append(parse_ding(el))

    metadata = {
        'id': 'eva-weapons',
        'title': 'Waffen (EVA)',
        'version': '1.0.0',
        'isCore': True,
        'createdAt': datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + 'Z',
        'notes': 'Automatisch konvertiert aus dinge.xml (EVA-Charaktersoftware) via Python'
    }

    return {'metadata': metadata, 'weapons': weapons}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Parse dinge.xml und extrahiere Waffen in MagusNG weapons-JSON")
    parser.add_argument("input", help="Pfad zur Eingabe dinge.xml")
    parser.add_argument("output", help="Pfad zur Ausgabe JSON-Datei")
    args = parser.parse_args()

    data = parse_dinge_document(args.input)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
