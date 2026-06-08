import re
import json
import argparse
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
from helpers import attr

WEAPON_GROUPS = {'Waffen (Fern)', 'Waffen (Angriff)'}

def waffentyp_from_group(group: str) -> str:
    m = re.search(r'\(([^)]+)\)', group)
    return m.group(1) if m else ''

def parse_ding(el: ET.Element) -> dict:
    name = attr(el, 'name')
    group = attr(el, 'gruppe')
    price_str = attr(el, 'preis', '0').strip()
    weight_str = attr(el, 'gewicht', '0').strip()
    try:
        price = float(price_str) if price_str else 0.0
    except ValueError:
        price = 0.0
    try:
        weight = float(weight_str) if weight_str else 0.0
    except ValueError:
        weight = 0.0
    item = {
        'id': name,
        'name': name,
        'group': group,
        'description': attr(el, 'desc'),
        'location': attr(el, 'ort'),
        'price': price,
        'weight': weight,
    }
    if attr(el, 'gruppe') in WEAPON_GROUPS:
        item['waffe'] = True
        item['damage'] = ''
        item['propertyRestrictions'] = {}
        item['distance'] = []
        item['saveAP'] = 0
        item['waffentyp'] = waffentyp_from_group(group)
    return item

def parse_dinge_document(xml_path: str) -> dict:
    tree = ET.parse(xml_path)
    root = tree.getroot()

    equipment = []
    for el in root.findall('ding'):
        equipment.append(parse_ding(el))

    metadata = {
        'id': 'eva-weapons',
        'title': 'Waffen & Ausrüstung (EVA)',
        'version': '1.0.0',
        'isCore': True,
        'createdAt': datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + 'Z',
        'notes': 'Automatisch konvertiert aus dinge.xml (EVA-Charaktersoftware) via Python'
    }

    return {'metadata': metadata, 'equipment': equipment}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Parse dinge.xml und erzeuge Ausrüstungs- & Waffen-JSON für MagusNG")
    parser.add_argument("input", help="Pfad zur Eingabe dinge.xml")
    parser.add_argument("output", help="Pfad zur Ausgabe JSON-Datei")
    args = parser.parse_args()

    data = parse_dinge_document(args.input)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
