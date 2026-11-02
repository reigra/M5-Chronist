import json
import argparse
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
from helpers import attr, get_child, get_app_version, SPELL_GROUP_MAP

def parse_zauber(el: ET.Element) -> dict:
    name = attr(el, 'Name')
    dp = get_child(el, 'Dynprops')
    
    prereq_assocs = [a for a in el.findall('Assoc') if attr(a, 'typ') == 'Lernprereq']
    
    # Schule mit dem höchsten Prerequisit-Grad wählen
    spell_group_assoc = None
    if prereq_assocs:
        spell_group_assoc = sorted(prereq_assocs, key=lambda a: int(attr(a, 'iWert', '0')), reverse=True)[0]
        
    raw_group = attr(spell_group_assoc, 'sWert') if spell_group_assoc is not None else ''
    spell_group = SPELL_GROUP_MAP.get(raw_group, raw_group)
    
    agens_raw = attr(dp, 'Agens')
    reagens_raw = attr(dp, 'Reagens')
    elements = [s for s in (agens_raw, reagens_raw) if s]
    
    level_str = attr(dp, 'Stufe')
    level = int(level_str) if level_str and level_str.isdigit() else 0
    
    return {
        'id': name,
        'name': name,
        'level': level,
        'learnCost': int(attr(spell_group_assoc, 'iWert', '0')) if spell_group_assoc is not None else 0,
        'spellType': attr(dp, 'Art'),
        'spellGroup': spell_group,
        'elements': elements,
        'material': None,
        'apCost': attr(dp, 'AP'),
        'castingTime': attr(dp, 'Zauberdauer'),
        'range': attr(dp, 'Reichweite'),
        'targetType': attr(dp, 'Wirkungsziel'),
        'effectArea': attr(dp, 'Wirkungsbereich'),
        'duration': attr(dp, 'Wirkungsdauer'),
        'origin': attr(dp, 'Ursprung'),
        # shortDescription und source werden nicht gesetzt (Merge kann sie aus anderen Quellen füllen)
    }

def parse_arkanum_document(xml_path: str) -> dict:
    tree = ET.parse(xml_path)
    root = tree.getroot()
    
    lernstoffe = root.findall('Lernstoff')
    zauber_list = [parse_zauber(el) for el in lernstoffe if attr(el, 'Typ') == 'Zauber']
    
    metadata = {
        'id': 'eva-arkanum',
        'title': 'Arkanum (EVA)',
        'version': '1.0.0',
        'scriptVersion': get_app_version(),
        'priority': 1,
        'createdAt': datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + 'Z',
        'notes': 'Automatisch konvertiert aus m5arkanum.xml (EVA-Charaktersoftware) via Python'
    }
    
    return {
        'metadata': metadata,
        'spells': zauber_list
        
    }

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Parse m5arkanum.xml und wandle es in M5-Chronist RulebookData-JSON um")
    parser.add_argument("input", help="Pfad zur Eingabe m5arkanum.xml")
    parser.add_argument("output", help="Pfad zur Ausgabe JSON-Datei")
    args = parser.parse_args()
    
    data = parse_arkanum_document(args.input)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
