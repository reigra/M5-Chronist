import re
import json
import argparse
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
from helpers import (
    attr, get_child, get_app_version, normalize_group_name, 
    SPELL_GROUP_KEYS, SPELL_GROUP_MAP, RACE_PROPERTY_KEYS
)

def parse_tekosten(el: ET.Element) -> dict:
    if el is None:
        return {'advancementCosts': []}
        
    values = []
    for i in range(20):
        val_str = attr(el, f'G{i}', '0')
        try:
            values.append(int(val_str))
        except ValueError:
            values.append(0)
            
    first_non_zero = next((i for i, v in enumerate(values) if v > 0), -1)
    if first_non_zero == -1:
        return {'advancementCosts': []}
        
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

SKIP_SKILLS = {'AP verbessern', 'Fechten tevarrischer Stil'}

# M5-Standardformeln für Boni und abgeleitete Fertigkeiten.
# Werden nicht aus der EVA-XML gelesen, sondern sind Spielkonstanten.
M5_FORMULAS = [
    {'id': 'AusB',   'formula': 'Ko/10 + St/20',        'allowsDice': False, 'description': 'Ausdauerbonus'},
    {'id': 'SchB',   'formula': 'St/20 + Gs/30 -3',     'allowsDice': False, 'description': 'Schadensbonus'},
    {'id': 'AnB',    'formula': 'bonus(Gs)',            'allowsDice': False, 'description': 'Angriffsbonus'},
    {'id': 'AbB',    'formula': 'bonus(Gw)',            'allowsDice': False, 'description': 'Abwehrbonus'},
    {'id': 'ZauB',   'formula': 'bonus(Zt)',            'allowsDice': False, 'description': 'Zauberbonus'},
    {'id': 'ResBg',  'formula': 'bonus(In)',            'allowsDice': False, 'description': 'Resistenzbonus Geist'},
    {'id': 'ResBk',  'formula': 'bonus(Ko)',            'allowsDice': False, 'description': 'Resistenzbonus Körper'},
    {'id': 'raufen', 'formula': '(St+Gw)/20 + AnB',     'allowsDice': False, 'description': 'Raufen-Formel'},
    {'id': 'trinken','formula': 'Ko/10',                'allowsDice': False, 'description': 'Trinken-Formel'},
    {'id': 'pA',     'formula': 'W% + 4*In/10 -20',     'allowsDice': True,  'description': 'persönliche Ausstrahlung'},
    {'id': 'Wk',     'formula': 'W% + 2*(Ko/10 + In/10) -20','allowsDice': True,  'description': 'Willenskraft'},
    {'id': 'Au',     'formula': 'W%','allowsDice': True,  'description': 'Aussehen'},
    {'id': 'LP',     'formula': '1W3 +7 +Ko/10',        'allowsDice': True,  'description': 'Lebenspunkte'},
#    {'id': 'AP',     'formula': '1W3 + AusB',           'allowsDice': True,  'description': 'Ausdauerpunkte'},
#    {'id': 'B',      'formula': '4W3 + 16',             'allowsDice': True,  'description': 'Bewegungsweite'},
]

# M5-Gradaufstiegs-Regeln (hartcodierte Spielkonstante).
# Wird in build_universal_rules() in den Output geschrieben.
M5_GRADUP_RULES = {
    'apDice': '1W3',
    'propertyGainDice': '1W3',
    'propertyMaxValue': 100,
    'propertyGainTable': [
        { 'range': [1, 50],   'property': None },
        { 'range': [51, 55],  'property': 'Wk' },
        { 'range': [56, 60],  'property': 'pA' },
        { 'range': [61, 65],  'property': 'Au' },
        { 'range': [66, 70],  'property': 'St' },
        { 'range': [71, 75],  'property': 'Gs' },
        { 'range': [76, 80],  'property': 'Gw' },
        { 'range': [81, 85],  'property': 'Ko' },
        { 'range': [86, 90],  'property': 'In' },
        { 'range': [91, 95],  'property': 'Zt' },
        { 'range': [96, 100], 'property': 'free' },
    ]
}

# Skills whose FW is derived from the gradValues[] table of their rulebook entry.
GRAD_DEPENDENT_SKILLS = {'Abwehr', 'Resistenz', 'Zaubern'}

# Skills with condition='hasSpells' (only added when character has spells).
CONDITIONAL_SKILLS = {'Zaubern': 'hasSpells'}

STACKED_SKILLS = {'Hören', 'Nachtsicht', 'Riechen', 'Sechster Sinn', 'Sehen'}

# Skills that are mandatory for every character (autoFix adds them if missing).
# Not all angeboreneFertigkeit entries are mandatory — some are situational.
MANDATORY_SKILLS = {'Raufen', 'Trinken', 'Wahrnehmung', 'Hören', 'Nachtsicht',
                    'Riechen', 'Sechster Sinn', 'Sehen', 'Abwehr', 'Resistenz', 'Zaubern'}

# Additional skillBonuses per race that the EVA XML doesn't encode.
# Key: race_id -> {skillId: value}
EXTRA_RACE_BONUSES = {
    'zwerg': {'Raufen': 1},
}

# Override baseValue for skills where the EVA XML has incorrect Anfangswert.
BASE_VALUE_OVERRIDE = {
    'Nachtsicht': 0,
    'Sechster Sinn': 0,
}

SKILL_NAME_CORRECTIONS = {
    'Alchimie': 'Alchemie',
    'Thaumatographie': 'Thaumagraphie',
    'Sprache': 'Sprechen',
}

def parse_name_value_list(raw: str) -> dict:
    if not raw:
        return {}
    result = {}
    for s in raw.split(','):
        s = s.strip()
        idx = s.rfind('+')
        if idx == -1:
            continue
        try:
            value = int(s[idx+1:])
            skill_id = s[:idx].strip()
            result[skill_id] = value
        except ValueError:
            continue
    return result

def parse_fertigkeit(el: ET.Element):
    name = attr(el, 'Name')
    name = SKILL_NAME_CORRECTIONS.get(name, name)
    dp = get_child(el, 'Dynprops')
    assocs = [a for a in el.findall('Assoc') if attr(a, 'typ') == 'LE-Kosten']
    tek = parse_tekosten(get_child(el, 'TEKosten'))
    
    learn_cost = 0
    if assocs:
        try:
            learn_cost = int(attr(assocs[0], 'iWert', '0'))
        except ValueError:
            pass
            
    typ_raw = attr(el, 'Typ')
    if typ_raw == 'Waffengruppe':
        typ_raw = 'Waffenfertigkeit'
    skill = {
        'id': name,
        'name': name,
        'typ': typ_raw,
        'groups': [normalize_group_name(attr(a, 'sWert')) for a in assocs],
        'learnCost': learn_cost,
        'advancementCosts': tek['advancementCosts'],
        'linkedProperty': attr(dp, 'Attribut'),
    }
    if 'baseValue' in tek:
        skill['baseValue'] = tek['baseValue']
    if 'maxValue' in tek:
        skill['maxValue'] = tek['maxValue']

    if attr(el, 'Typ') == 'Waffengruppe':
        if name not in ('Parierwaffen', 'Schilde'):
            skill['bonusKey'] = 'AnB'
    
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
            seen = set()
            values = []
            for v in zus_str.split(','):
                v = v.strip()
                if v and v not in seen:
                    seen.add(v)
                    values.append(v)
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

def parse_angeborene_fertigkeit(el: ET.Element):
    name = attr(el, 'Name')
    dp = get_child(el, 'Dynprops')

    BONUS_KEY_OVERRIDE = {
        'Zaubern': 'ZauB',
        'Abwehr': 'AbB',
        'Raufen': 'AnB',
    }

    skill = {
        'id': name,
        'name': name,
        'typ': 'angeboreneFertigkeit',
        'groups': [],
        'learnCost': 0,
        'advancementCosts': [],
    }

    if name in BONUS_KEY_OVERRIDE:
        skill['bonusKey'] = BONUS_KEY_OVERRIDE[name]
    else:
        skill['linkedProperty'] = attr(dp, 'Attribut')

    aw = attr(dp, 'Anfangswert').strip()
    if aw:
        try:
            skill['baseValue'] = int(aw)
        except ValueError:
            pass

    ung = attr(dp, 'EWungelernt')
    if ung:
        try:
            skill['unlearnedValue'] = int(ung)
        except ValueError:
            pass

    # Override baseValue for skills where EVA XML data is wrong
    if name in BASE_VALUE_OVERRIDE:
        skill['baseValue'] = BASE_VALUE_OVERRIDE[name]

    return skill

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
                if v > 0:
                    group_costs[normalize_group_name(k)] = v
                
    # propertyBonuses aus ZAU/KAE ableiten
    property_bonuses = []
    if has_zau and not has_kae:
        property_bonuses.append({'id': 'ResBk', 'value': 2, 'mode': 'add'})
        property_bonuses.append({'id': 'ResBg', 'value': 2, 'mode': 'add'})
    if has_kae:
        property_bonuses.append({'id': 'ResBk', 'value': 1, 'mode': 'add'})
    
    ctype = {
        'id': name,
        'name': attr(dp, 'Name-m', name), # fallback to id
        'category': category,
        'groupCosts': group_costs
    }
    if property_bonuses:
        ctype['propertyBonuses'] = property_bonuses
    if spell_costs:
        ctype['spellCosts'] = spell_costs

    # apGain: Dynprops-Attribut "apbonus" auslesen
    apbonus = attr(dp, 'apbonus')
    if apbonus:
        ctype['apGain'] = { 'lowGradBonus': int(apbonus) }

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

    resistenz = attr(dp, 'Resistenz')
    if resistenz:
        try:
            rv = int(resistenz)
            race['propertyBonuses'] = [
                {'id': 'ResBk', 'value': rv, 'mode': 'set'},
                {'id': 'ResBg', 'value': rv, 'mode': 'set'},
            ]
        except ValueError:
            pass

    restrictions = {}
    if dp is not None:
        for k in RACE_PROPERTY_KEYS:
            val = attr(dp, k)
            if val:
                try:
                    v = int(val)
                    if v > 0:
                        restrictions[k] = {'min': v + 1}
                    elif v < 0:
                        restrictions[k] = {'max': abs(v) - 1}
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
                # race.skills is Array<{skillId, value}>
                race['skills'] = [{'skillId': k, 'value': v} for k, v in parsed.items()]
                
    ungelernt = attr(dp, 'ungelernt')
    extra_bonuses = EXTRA_RACE_BONUSES.get(race_id, {})
    if ungelernt:
        parsed = parse_name_value_list(ungelernt)
        if parsed:
            # Merge — extra bonuses override XML values if same skill
            parsed.update(extra_bonuses)
            race['skillBonuses'] = parsed
        elif extra_bonuses:
            race['skillBonuses'] = extra_bonuses
    elif extra_bonuses:
        race['skillBonuses'] = extra_bonuses
            
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

def strip_none(obj):
    """Remove all keys with None values recursively from dicts."""
    if isinstance(obj, dict):
        return {k: strip_none(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [strip_none(item) for item in obj]
    return obj

def build_universal_rules(skills: list) -> dict:
    """Generate universalRules from parsed skill list.
    
    Only includes mandatory skills (MANDATORY_SKILLS).
    Adds hardcoded M5 formulas.
    """
    # Build a lookup by id for quick access
    skills_by_id = {s['id']: s for s in skills}

    innate_skills = []

    for name in sorted(MANDATORY_SKILLS):
        skill = skills_by_id.get(name, {})
        innate = {
            'id': name,
            'defaultFw': skill.get('baseValue', 0),
        }

        # Formel/Formel-ID
        if name == 'Raufen':
            innate['formulaId'] = 'raufen'
        elif name == 'Trinken':
            innate['formulaId'] = 'trinken'
        elif name == 'Wahrnehmung':
            innate['defaultFw'] = 6
        elif name in GRAD_DEPENDENT_SKILLS:
            innate['gradValues'] = True

        # Gestapelte Skills (Wahrnehmung-Basis)
        if name in STACKED_SKILLS:
            innate['stacked'] = True
            innate['baseSkillId'] = 'Wahrnehmung'

        # Bedingte Skills
        if name in CONDITIONAL_SKILLS:
            innate['condition'] = CONDITIONAL_SKILLS[name]

        innate_skills.append(innate)

    return {
        'formulas': M5_FORMULAS,
        'innateSkills': innate_skills,
        'gradUpRules': M5_GRADUP_RULES,
    }

def parse_kodex_document(xml_path: str) -> dict:
    tree = ET.parse(xml_path)
    root = tree.getroot()
    
    lernstoffe = root.findall('Lernstoff')
    
    skills = []
    multi_instance_skills = []
    
    for el in lernstoffe:
        name = attr(el, 'Name')
        if name in SKIP_SKILLS:
            continue

        typ = attr(el, 'Typ')
        if typ == 'Fertigkeit' or typ == 'Waffengruppe':
            skill, multi_info = parse_fertigkeit(el)
            skills.append(skill)
            if multi_info:
                multi_instance_skills.append(multi_info)
        elif typ == 'angeboreneFertigkeit':
            skill = parse_angeborene_fertigkeit(el)
            skills.append(skill)

        if name in STACKED_SKILLS:
            skill['baseSkillId'] = 'Wahrnehmung'
                
    types = [parse_klasse(el) for el in lernstoffe if attr(el, 'Typ') == 'Klasse']
    races = [parse_rasse(el) for el in lernstoffe if attr(el, 'Typ') == 'Rasse']
    origins = [parse_land(el) for el in lernstoffe if attr(el, 'Typ') == 'Land']
    social_statuses = [parse_stand(el) for el in lernstoffe if attr(el, 'Typ') == 'Stand']
    
    metadata = {
        'id': 'eva-kodex',
        'title': 'M5 Kodex (EVA)',
        'version': '1.0.0',
        'scriptVersion': get_app_version(),
        'priority': 1,
        'createdAt': datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + 'Z',
        'notes': 'Automatisch konvertiert aus m5kodex.xml (EVA-Charaktersoftware) via Python'
    }
    
    # Ensure all mandatory skills exist in the skills list.
    # Skills like "Hören" may not be present in EVA XML but are
    # required by CharacterValidator / universalRules.
    existing_skill_ids = {s['id'] for s in skills}
    for mandatory_id in sorted(MANDATORY_SKILLS):
        if mandatory_id not in existing_skill_ids:
            syn = {
                'id': mandatory_id,
                'name': mandatory_id,
                'typ': 'angeboreneFertigkeit',
                'groups': [],
                'learnCost': 0,
                'advancementCosts': [],
                'baseValue': 0,
            }
            if mandatory_id in STACKED_SKILLS:
                syn['baseSkillId'] = 'Wahrnehmung'
            if mandatory_id in GRAD_DEPENDENT_SKILLS:
                syn['unlearnedValue'] = 0
            skills.append(syn)

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
        },
        'universalRules': build_universal_rules(skills),
    }
    
    # Remove empty/null values and empty collections
    result = strip_none(result)
    return {k: v for k, v in result.items() if v != [] and v != {} or isinstance(v, (bool, int, float))}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Parse m5kodex.xml und wandle es in MagusNG RulebookData-JSON um")
    parser.add_argument("input", help="Pfad zur Eingabe m5kodex.xml")
    parser.add_argument("output", help="Pfad zur Ausgabe JSON-Datei")
    args = parser.parse_args()
    
    data = parse_kodex_document(args.input)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
