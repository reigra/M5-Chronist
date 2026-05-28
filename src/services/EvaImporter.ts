/**
 * EvaImporter — konvertiert EVA-XML-Dateien (m5kodex.xml, m5arkanum.xml)
 * in das MagusNG RulebookData-Format.
 *
 * Wird direkt im Browser aufgerufen: kein Node.js, keine Drittbibliotheken.
 * Eingabe: mit TextDecoder('iso-8859-1') dekodierter XML-String.
 *
 * Öffentliche API:
 *   parseEvaXml(xmlString)     → RulebookData   (auto-detects kodex vs. arkanum)
 *   parseKodexXml(xmlString)   → RulebookData
 *   parseArkanumXml(xmlString) → RulebookData
 */

import type { RulebookData, RulebookMetadata } from '../types/Rules'
import type { Skill } from '../types/Skill'
import type { CharacterType } from '../types/CharacterType'
import type { Race } from '../types/Race'
import type { Spell } from '../types/Spell'

// ── Mapping-Tabellen ──────────────────────────────────────────────────────────

/** EVA-Zaubergruppen → PWA spellCosts-Schlüssel */
const SPELL_GROUP_MAP: Record<string, string> = {
  'Beherrschen': 'Beherr.',
  'Bewegen':     'Beweg.',
  'Erkennen':    'Erkenn.',
  'Erschaffen':  'Erschaff.',
  'Formen':      'Formen',
  'Verändern':   'Veränd.',
  'Zerstören':   'Zerstören',
  'Wundertat':   'Wunder',
  'Zauberlied':  'Lied',
  'Dweomer':     'Dweom.',
}

const SPELL_GROUP_KEYS = new Set(Object.keys(SPELL_GROUP_MAP))

/** EVA-Gruppenbezeichnungen → PWA-Gruppenbezeichnungen */
const GROUP_NAME_MAP: Record<string, string> = {
  'Halbwelt': 'Halbw.',
}

function normalizeGroupName(name: string): string {
  return GROUP_NAME_MAP[name] ?? name
}

/** Eigenschafts-Schlüssel für Rassenrestriktionen */
const RACE_PROPERTY_KEYS = new Set(['St', 'Gs', 'Gw', 'Ko', 'In', 'Zt', 'pA', 'Wk', 'Au'])

// ── DOM-Hilfsfunktionen ───────────────────────────────────────────────────────

function directChildren(parent: Element, tagName: string): Element[] {
  const result: Element[] = []
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes.item(i)
    if (node && node.nodeType === 1 && (node as Element).tagName === tagName) {
      result.push(node as Element)
    }
  }
  return result
}

function getChild(parent: Element, tagName: string): Element | null {
  return directChildren(parent, tagName)[0] ?? null
}

function a(el: Element | null, name: string): string {
  return el?.getAttribute(name) ?? ''
}

function getAttribs(el: Element | null): Record<string, string> {
  if (!el) return {}
  const result: Record<string, string> = {}
  const attrs = el.attributes
  for (let i = 0; i < attrs.length; i++) {
    const item = attrs.item(i)
    if (item) result[item.name] = item.value
  }
  return result
}

function rootLernstoffe(doc: Document): Element[] {
  const result: Element[] = []
  const root = doc.documentElement
  for (let i = 0; i < root.childNodes.length; i++) {
    const node = root.childNodes.item(i)
    if (node && node.nodeType === 1 && (node as Element).tagName === 'Lernstoff') {
      result.push(node as Element)
    }
  }
  return result
}

// ── TEKosten-Parser ───────────────────────────────────────────────────────────

function parseTEKosten(el: Element | null): { baseValue: number; maxValue: number; advancementCosts: number[] } {
  if (!el) return { baseValue: 0, maxValue: 0, advancementCosts: [] }

  const values = Array.from({ length: 20 }, (_, i) => Number(el.getAttribute(`G${i}`) ?? 0))
  const firstNonZero = values.findIndex(v => v > 0)
  if (firstNonZero === -1) return { baseValue: 0, maxValue: 0, advancementCosts: [] }

  let lastNonZero = 0
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] > 0) { lastNonZero = i; break }
  }

  return {
    baseValue:        Math.max(0, firstNonZero - 1),
    maxValue:         lastNonZero,
    advancementCosts: values.slice(firstNonZero, lastNonZero + 1),
  }
}

// ── "Name+Wert,Name+Wert"-Listen parsen ──────────────────────────────────────

function parseNameValueList(raw: string): Array<{ skillId: string; value: number }> {
  return raw.split(',')
    .map(s => s.trim())
    .map(s => {
      const idx = s.lastIndexOf('+')
      if (idx === -1) return null
      const value = Number(s.substring(idx + 1))
      if (isNaN(value)) return null
      return { skillId: s.substring(0, idx).trim(), value }
    })
    .filter((s): s is { skillId: string; value: number } => s !== null)
}

// ── Fertigkeit → Skill ────────────────────────────────────────────────────────

function parseFertigkeit(el: Element): Skill {
  const name   = a(el, 'Name')
  const dp     = getChild(el, 'Dynprops')
  const assocs = directChildren(el, 'Assoc').filter(x => a(x, 'typ') === 'LE-Kosten')
  const tek    = parseTEKosten(getChild(el, 'TEKosten'))

  const skill: Skill = {
    id:               name,
    name,
    groups:           assocs.map(x => normalizeGroupName(a(x, 'sWert'))),
    difficulty:       {},   // nicht in EVA-XML enthalten
    learnCost:        assocs.length > 0 ? Number(a(assocs[0], 'iWert')) : 0,
    advancementCosts: tek.advancementCosts,
    baseValue:        tek.baseValue,
    maxValue:         tek.maxValue,
    linkedProperty:   a(dp, 'Attribut'),
    notes:            '',
  }

  const ung = a(dp, 'EWungelernt')
  if (ung) skill.unlearnedValue = Number(ung)

  return skill
}

// ── Klasse → CharacterType ────────────────────────────────────────────────────

function parseKlasse(el: Element): CharacterType {
  const id       = a(el, 'Name')
  const dp       = getAttribs(getChild(el, 'Dynprops'))
  const epkosten = getChild(el, 'EPKosten')

  const hasZAU = dp['ZAU'] === 'true'
  const hasKAE = dp['KAE'] === 'true'
  let category: string
  if      (hasZAU && hasKAE) category = 'KampfZauberer'
  else if (hasZAU)           category = 'Zauberer'
  else if (hasKAE)           category = 'Kämpfer'
  else                       category = 'Freie'

  const groupCosts: Record<string, number> = {}
  const spellCosts: Record<string, number> = {}

  if (epkosten) {
    const attrs = epkosten.attributes
    for (let i = 0; i < attrs.length; i++) {
      const item = attrs.item(i)
      if (!item) continue
      const v = Number(item.value)
      if (SPELL_GROUP_KEYS.has(item.name)) {
        if (v > 0) spellCosts[SPELL_GROUP_MAP[item.name]] = v
      } else {
        groupCosts[normalizeGroupName(item.name)] = v
      }
    }
  }

  const type: CharacterType = {
    id,
    name:       dp['Name-m'] || id,
    category,
    groupCosts,
  }
  if (Object.keys(spellCosts).length > 0) type.spellCosts = spellCosts

  return type
}

// ── Rasse → Race ──────────────────────────────────────────────────────────────

function parseRasse(el: Element): Race {
  const name   = a(el, 'Name')
  const dp     = getAttribs(getChild(el, 'Dynprops'))
  const assocs = directChildren(el, 'Assoc')

  // Erlaubte Klassen (iWert=5 kennzeichnet Klassen)
  const availableTypes = assocs
    .filter(x => a(x, 'typ') === 'Erlaubt' && Number(a(x, 'iWert')) === 5)
    .map(x => a(x, 'sWert'))

  const forbiddenSkills = assocs
    .filter(x => a(x, 'typ') === 'Verboten')
    .map(x => a(x, 'sWert'))

  const race: Race = {
    id:             name.toLowerCase().replace(/[\s/]+/g, '-'),
    name,
    availableTypes,
  }

  if (forbiddenSkills.length > 0) race.forbiddenSkills = forbiddenSkills
  if (dp['LPbonus']) race.lpModifier = Number(dp['LPbonus'])

  // Eigenschaftsrestriktionen
  // TODO: Semantik (positiv vs. negativ) anhand des Regelwerks prüfen.
  const restrictions: Record<string, { max: number }> = {}
  for (const key of RACE_PROPERTY_KEYS) {
    if (dp[key] !== undefined) {
      restrictions[key] = { max: Math.abs(Number(dp[key])) }
    }
  }
  if (Object.keys(restrictions).length > 0) race.propertyRestrictions = restrictions

  // Angeborene Fertigkeiten
  const angeboren = getChild(el, 'Angeboren')
  if (angeboren) {
    const raw = a(angeboren, 'Name')
    if (raw) {
      const parsed = parseNameValueList(raw)
      if (parsed.length > 0) race.skills = parsed
    }
  }

  // Ungelernt-Boni
  if (dp['ungelernt']) {
    const parsed = parseNameValueList(dp['ungelernt'])
    if (parsed.length > 0) race.skillBonuses = parsed
  }

  return race
}

// ── Zauber → Spell ────────────────────────────────────────────────────────────

function parseZauber(el: Element): Spell {
  const name         = a(el, 'Name')
  const dp           = getChild(el, 'Dynprops')
  const prereqAssocs = directChildren(el, 'Assoc').filter(x => a(x, 'typ') === 'Lernprereq')

  // Bei mehreren Schulen: Schule mit dem höchsten Prerequisit-Grad wählen
  const spellGroupAssoc = prereqAssocs
    .sort((x, y) => Number(a(y, 'iWert')) - Number(a(x, 'iWert')))[0]

  const rawGroup   = spellGroupAssoc ? a(spellGroupAssoc, 'sWert') : ''
  const spellGroup = SPELL_GROUP_MAP[rawGroup] ?? rawGroup

  return {
    id:               name,
    name,
    level:            Number(a(dp, 'Stufe')) || 0,
    spellType:        a(dp, 'Art'),
    spellGroup,
    elements:         [a(dp, 'Agens'), a(dp, 'Reagens')].filter(s => s.length > 0),
    material:         null,
    apCost:           a(dp, 'AP'),
    castingTime:      a(dp, 'Zauberdauer'),
    range:            a(dp, 'Reichweite'),
    targetType:       a(dp, 'Wirkungsziel'),
    effectArea:       a(dp, 'Wirkungsbereich'),
    duration:         a(dp, 'Wirkungsdauer'),
    origin:           a(dp, 'Ursprung'),
    shortDescription: '',
    source:           '',
  }
}

// ── Standard-Metadaten ────────────────────────────────────────────────────────

function makeKodexMetadata(): RulebookMetadata {
  return {
    id:        'eva-kodex',
    title:     'M5 Kodex (EVA)',
    version:   '1.0.0',
    isCore:    false,
    createdAt: new Date().toISOString(),
    notes:     'Automatisch konvertiert aus m5kodex.xml (EVA-Charaktersoftware)',
  }
}

function makeArkanumMetadata(): RulebookMetadata {
  return {
    id:        'eva-arkanum',
    title:     'Arkanum (EVA)',
    version:   '1.0.0',
    isCore:    false,
    createdAt: new Date().toISOString(),
    notes:     'Automatisch konvertiert aus m5arkanum.xml (EVA-Charaktersoftware)',
  }
}

// ── Öffentliche API ───────────────────────────────────────────────────────────

/**
 * Kodex-XML parsen: liefert Fertigkeiten, Klassen und Rassen.
 * Sprachen, Schriften, Herkünfte und Stände sind nicht in EVA-XML enthalten.
 *
 * @param xmlString - ISO-8859-1-dekodierter XML-String
 * @param metadata  - Optionale Metadaten (Standard: makeKodexMetadata())
 */
export function parseKodexXml(
  xmlString: string,
  metadata: RulebookMetadata = makeKodexMetadata(),
): RulebookData {
  const decoded = xmlString.replace(/encoding="[^"]*"/i, 'encoding="UTF-8"')
  const doc     = new DOMParser().parseFromString(decoded, 'text/xml')
  const ls      = rootLernstoffe(doc)

  return {
    metadata,
    skills:         ls.filter(e => e.getAttribute('Typ') === 'Fertigkeit').map(parseFertigkeit),
    types:          ls.filter(e => e.getAttribute('Typ') === 'Klasse').map(parseKlasse),
    races:          ls.filter(e => e.getAttribute('Typ') === 'Rasse').map(parseRasse),
    origins:        [],
    socialStatuses: [],
    languages:      [],
    scripts:        [],
  }
}

/**
 * Arkanum-XML parsen: liefert Zauber.
 * Zauberbeschreibungen sind nicht in EVA-XML enthalten.
 *
 * @param xmlString - ISO-8859-1-dekodierter XML-String
 * @param metadata  - Optionale Metadaten (Standard: makeArkanumMetadata())
 */
export function parseArkanumXml(
  xmlString: string,
  metadata: RulebookMetadata = makeArkanumMetadata(),
): RulebookData {
  const decoded = xmlString.replace(/encoding="[^"]*"/i, 'encoding="UTF-8"')
  const doc     = new DOMParser().parseFromString(decoded, 'text/xml')
  const ls      = rootLernstoffe(doc)

  return {
    metadata,
    spells:            ls.filter(e => e.getAttribute('Typ') === 'Zauber').map(parseZauber),
    spellDescriptions: [],
  }
}

/**
 * EVA-XML automatisch erkennen und parsen (Kodex oder Arkanum).
 * Erkennung anhand der vorhandenen Lernstoff-Typen.
 *
 * @param xmlString - ISO-8859-1-dekodierter XML-String
 * @throws Wenn keine bekannten Lernstoff-Typen gefunden werden.
 */
export function parseEvaXml(xmlString: string): RulebookData {
  const decoded = xmlString.replace(/encoding="[^"]*"/i, 'encoding="UTF-8"')
  const doc     = new DOMParser().parseFromString(decoded, 'text/xml')
  const ls      = rootLernstoffe(doc)

  const typen = new Set(ls.map(e => e.getAttribute('Typ')))

  if (typen.has('Fertigkeit') || typen.has('Klasse') || typen.has('Rasse')) {
    const meta = makeKodexMetadata()
    return {
      metadata:       meta,
      skills:         ls.filter(e => e.getAttribute('Typ') === 'Fertigkeit').map(parseFertigkeit),
      types:          ls.filter(e => e.getAttribute('Typ') === 'Klasse').map(parseKlasse),
      races:          ls.filter(e => e.getAttribute('Typ') === 'Rasse').map(parseRasse),
      origins:        [],
      socialStatuses: [],
      languages:      [],
      scripts:        [],
    }
  }

  if (typen.has('Zauber')) {
    const meta = makeArkanumMetadata()
    return {
      metadata:          meta,
      spells:            ls.filter(e => e.getAttribute('Typ') === 'Zauber').map(parseZauber),
      spellDescriptions: [],
    }
  }

  throw new Error(
    'Unbekannter EVA-XML-Typ: Keine Fertigkeiten, Klassen, Rassen oder Zauber gefunden.'
  )
}
