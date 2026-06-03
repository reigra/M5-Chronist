import re
import json
import argparse
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
from helpers import (
    attr, get_child, normalize_group_name, 
    SPELL_GROUP_KEYS, SPELL_GROUP_MAP, RACE_PROPERTY_KEYS
)

def parse_tekosten(el: ET.Element) -> dict:
    if el is None:
        return {'baseValue': 0, 'maxValue': 0, 'advancementCosts': []}
        
    values = []
    for i in range(20):
        val_str = attr(el, f'G{i}', '0')
        try:
            values.append(int(val_str))
        except ValueError:
            values.append(0)
            
    first_non_zero = next((i for i, v in enumerate(values) if v > 0), -1)
    if first_non_zero == -1:
        return {'baseValue': 0, 'maxValue': 0, 'advancementCosts': []}
        
    last_non_zero = 0
    for i in range(19, -1, -1):
        if values[i] > 0:
            last_non_zero = i
            break
            
    base_value = max(0, first_non_zero - 1)
    max_value = last_non_zero
    advancement_costs = values[first_non_zero : last_non_zero + 1]
    
    return {
        'baseValue': base_value,
        'maxValue': max_value,
        'advancementCosts': advancement_costs
    }

def parse_name_value_list(raw: str) -> list:
    if not raw:
        return []
    result = []
    for s in raw.split(','):
        s = s.strip()
        idx = s.rfind('+')
        if idx == -1:
            continue
        try:
            value = int(s[idx+1:])
            skill_id = s[:idx].strip()
            result.append({'skillId': skill_id, 'value': value})
        except ValueError:
            continue
    return result

def parse_fertigkeit(el: ET.Element):
    name = attr(el, 'Name')
    dp = get_child(el, 'Dynprops')
    assocs = [a for a in el.findall('Assoc') if attr(a, 'typ') == 'LE-Kosten']
    tek = parse_tekosten(get_child(el, 'TEKosten'))
    
    learn_cost = 0
    if assocs:
        try:
            learn_cost = int(attr(assocs[0], 'iWert', '0'))
        except ValueError:
            pass
            
    skill = {
        'id': name,
        'name': name,
        'groups': [normalize_group_name(attr(a, 'sWert')) for a in assocs],
        'learnCost': learn_cost,
        'advancementCosts': tek['advancementCosts'],
        'baseValue': tek['baseValue'],
        'maxValue': tek['maxValue'],
        'linkedProperty': attr(dp, 'Attribut'),
        'notes': ''
    }
    
    ung = attr(dp, 'EWungelernt')
    if ung:
        try:
            skill['unlearnedValue'] = int(ung)
        except ValueError:
            pass
            
    # Check for Zusaetze to build multiInstanceSkills later
    zusaetze_el = get_child(el, 'Zusaetze')
    multi_instance_info = None
    if zusaetze_el is not None:
        zus_str = attr(zusaetze_el, 'Zus')
        if zus_str:
            values = [v.strip() for v in zus_str.split(',') if v.strip()]
            if values:
                multi_instance_info = {
                    'baseSkillId': name,
                    'idPrefix': f"{name}:",
                    "instanceSource": {
                        "type": "fixed",
                        "values": values
                    }
                }
                
    return skill, multi_instance_info

def parse_klasse(el: ET.Element) -> dict:
    name = attr(el, 'Name')
    dp = get_child(el, 'Dynprops')
    epkosten = get_child(el, 'EPKosten')
    
    has_zau = attr(dp, 'ZAU') == 'true'
    has_kae = attr(dp, 'KAE') == 'true'
    
    if has_zau and has_kae:
        category = 'KampfZauberer'
    elif has_zau:
        category = 'Zauberer'
    elif has_kae:
        category = 'Kämpfer'
    else:
        category = 'Freie'
        
    group_costs = {}
    spell_costs = {}
    
    if epkosten is not None:
        for k, v_str in epkosten.attrib.items():
            try:
                v = int(v_str)
            except ValueError:
                continue
                
            if k in SPELL_GROUP_KEYS:
                if v > 0:
                    spell_costs[SPELL_GROUP_MAP[k]] = v
            else:
                group_costs[normalize_group_name(k)] = v
                
    ctype = {
        'id': name,
        'name': attr(dp, 'Name-m', name), # fallback to id
        'category': category,
        'groupCosts': group_costs
    }
    if spell_costs:
        ctype['spellCosts'] = spell_costs
        
    return ctype

def parse_rasse(el: ET.Element) -> dict:
    name = attr(el, 'Name')
    dp = get_child(el, 'Dynprops')
    assocs = el.findall('Assoc')
    
    available_types = [
        attr(a, 'sWert') for a in assocs 
        if attr(a, 'typ') == 'Erlaubt' and attr(a, 'iWert') == '5'
    ]
    
    forbidden_skills = [
        attr(a, 'sWert') for a in assocs
        if attr(a, 'typ') == 'Verboten'
    ]
    
    race_id = re.sub(r'[\s/]+', '-', name.lower())
    
    race = {
        'id': race_id,
        'name': name,
        'availableTypes': available_types
    }
    
    if forbidden_skills:
        race['forbiddenSkills'] = forbidden_skills
        
    lp_bonus = attr(dp, 'LPbonus')
    if lp_bonus:
        try:
            race['lpModifier'] = int(lp_bonus)
        except ValueError:
            pass
            
    restrictions = {}
    if dp is not None:
        for k in RACE_PROPERTY_KEYS:
            val = attr(dp, k)
            if val:
                try:
                    restrictions[k] = {'max': abs(int(val))}
                except ValueError:
                    pass
                    
    if restrictions:
        race['propertyRestrictions'] = restrictions
        
    angeboren = get_child(el, 'Angeboren')
    if angeboren is not None:
        innate_str = attr(angeboren, 'Name')
        if innate_str:
            parsed = parse_name_value_list(innate_str)
            if parsed:
                race['skills'] = parsed
                
    ungelernt = attr(dp, 'ungelernt')
    if ungelernt:
        parsed = parse_name_value_list(ungelernt)
        if parsed:
            race['skillBonuses'] = parsed
            
    return race

def parse_land(el: ET.Element) -> dict:
    name = attr(el, 'Name')
    dp = get_child(el, 'Dynprops')
    
    languages = []
    if dp is not None:
        lang_str = attr(dp, 'Sprache')
        if lang_str:
            languages = [lang.strip() for lang in lang_str.split(',') if lang.strip()]
            
    return {
        'id': name,
        'name': name,
        'description': '',
        'languages': languages
    }

def parse_stand(el: ET.Element) -> dict:
    name = attr(el, 'Name')
    dp = get_child(el, 'Dynprops')
    
    stand = {
        'id': name.lower(),
        'name': name
    }
    
    if dp is not None:
        extrale = attr(dp, 'ExtraLE')
        if extrale:
            parts = [p.strip() for p in extrale.split(',')]
            group = parts[0]
            if group == 'Halbwelt':
                group = 'Halbw.'
                
            starting_skills = {'group': group}
            
            if len(parts) > 1:
                try:
                    starting_skills['le'] = int(parts[1])
                except ValueError:
                    pass
                    
            if len(parts) > 2:
                starting_skills['maxDifficulty'] = parts[2]
                
            stand['startingSkills'] = starting_skills
            
    return stand

def parse_kodex_document(xml_path: str) -> dict:
    tree = ET.parse(xml_path)
    root = tree.getroot()
    
    lernstoffe = root.findall('Lernstoff')
    
    skills = []
    multi_instance_skills = []
    
    for el in lernstoffe:
        if attr(el, 'Typ') == 'Fertigkeit':
            skill, multi_info = parse_fertigkeit(el)
            skills.append(skill)
            if multi_info:
                multi_instance_skills.append(multi_info)
                
    types = [parse_klasse(el) for el in lernstoffe if attr(el, 'Typ') == 'Klasse']
    races = [parse_rasse(el) for el in lernstoffe if attr(el, 'Typ') == 'Rasse']
    origins = [parse_land(el) for el in lernstoffe if attr(el, 'Typ') == 'Land']
    social_statuses = [parse_stand(el) for el in lernstoffe if attr(el, 'Typ') == 'Stand']
    
    metadata = {
        'id': 'eva-kodex',
        'title': 'M5 Kodex (EVA)',
        'version': '1.0.0',
        'isCore': True,
        'createdAt': datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + 'Z',
        'notes': 'Automatisch konvertiert aus m5kodex.xml (EVA-Charaktersoftware) via Python'
    }
    
    result = {
        'metadata': metadata,
        'skills': skills,
        'types': types,
        'races': races,
        'origins': origins,
        'socialStatuses': social_statuses,
        'languages': [],
        'scripts': [],
        'skillRules': {
            'splitSkills': [
                {
                    'baseSkillId': 'Resistenz',
                    'variants': [
                        { 'displayName': 'Resistenz (Geist)', 'bonusKey': 'ResBg' },
                        { 'displayName': 'Resistenz (Körper)', 'bonusKey': 'ResBk' }
                    ]
                }
            ],
            'multiInstanceSkills': multi_instance_skills
        }
    }
    
    # Remove empty root level keys (e.g. empty lists or dicts)
    return {k: v for k, v in result.items() if v or isinstance(v, (bool, int, float))}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Parse m5kodex.xml und wandle es in MagusNG RulebookData-JSON um")
    parser.add_argument("input", help="Pfad zur Eingabe m5kodex.xml")
    parser.add_argument("output", help="Pfad zur Ausgabe JSON-Datei")
    args = parser.parse_args()
    
    data = parse_kodex_document(args.input)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
