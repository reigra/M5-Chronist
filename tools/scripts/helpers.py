import os
import xml.etree.ElementTree as ET


def get_app_version() -> str:
    """App-Version aus tools/VERSION."""
    vpath = os.path.join(os.path.dirname(__file__), '..', 'VERSION')
    if os.path.isfile(vpath):
        with open(vpath) as f:
            return f.read().strip()
    return '0.0.0'

# ── Mappings ──────────────────────────────────────────────────────────────────

SPELL_GROUP_MAP = {
    'Beherrschen': 'Beherrschen',
    'Bewegen': 'Bewegen',
    'Dweomer': 'Dweomer',
    'Erkennen': 'Erkennen',
    'Erschaffen': 'Erschaffen',
    'Formen': 'Formen',
    'Verändern': 'Verändern',
    'Wundertat': 'Wundertaten',
    'Zauberlied': 'Zauberlieder',
    'Zerstören': 'Zerstören',
}

SPELL_GROUP_KEYS = set(SPELL_GROUP_MAP.keys())

GROUP_NAME_MAP = {
    # 'Halbwelt': 'Halbw.',
}

def normalize_group_name(name: str) -> str:
    return GROUP_NAME_MAP.get(name, name)

RACE_PROPERTY_KEYS = {'St', 'Gs', 'Gw', 'Ko', 'In', 'Zt', 'pA', 'Wk', 'Au'}

# ── DOM Helpers ───────────────────────────────────────────────────────────────

def get_child(el: ET.Element, tag: str) -> ET.Element:
    """Returns the first child element with the matching tag."""
    if el is None:
        return None
    return el.find(tag)

def attr(el: ET.Element, name: str, default: str = '') -> str:
    """Returns the value of the attribute for the element, or a default value."""
    if el is None:
        return default
    return el.attrib.get(name, default)
