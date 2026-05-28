/**
 * Alle sichtbaren UI-Texte der Anwendung.
 * Zentrale Quelle für Konsistenz und einfache Übersetzung (i18n).
 * Verwendung: import { UI } from '../constants/ui'
 */
export const UI = {

  // ── Allgemein ────────────────────────────────────────────────────────────────
  loading:       'Wird geladen…',
  confirm:       'Bestätigen',
  cancel:        'Abbrechen',
  add:           'Hinzufügen',
  delete:        'Löschen',
  learnBtn:      'Lernen',
  notApplicable: '—',
  unitEp:        'EP',
  unitEs:        'ES',

  // ── App-Navigation ───────────────────────────────────────────────────────────
  appBrand:   'MagusNG',
  appNewChar: '+ Neuer Charakter',

  // ── Charakter-Navigation (Blatt, Fortschritt, Zaubersprüche) ─────────────────
  navSheet:       'Charakter Blatt',
  navAdvancement: 'Steigern',
  navEdit:        'Bearbeiten',
  navHome:        '← Startseite',

  // ── Zaubersprüche (Navigationsbutton und Abschnittsüberschrift) ───────────────
  spells: 'Zaubersprüche',

  // ── Browser-Kompatibilitätswarnung ───────────────────────────────────────────
  browserUnsupportedTitle: 'Nicht unterstützter Browser',
  browserWarningApp:
    'Diese App benötigt einen Chromium-basierten Browser (Chrome, Edge oder Opera). ' +
    'Firefox und Safari unterstützen die File System Access API nicht, ' +
    'die zum Importieren und Exportieren von Charakteren erforderlich ist.',
  browserWarningRules:
    'Das Importieren von Regeln erfordert einen Chromium-basierten Browser (Chrome, Edge oder Opera).',

  // ── Abschnitts-Überschriften ─────────────────────────────────────────────────
  secIdentity:    'Identität',
  secPersonalia:  'Personalia',
  secExperience:  'Erfahrung',
  secProps:       'Eigenschaften',
  secBoni:        'Boni',
  secSkills:      'Fertigkeiten',

  // ── Spalten- und Feldbezeichner ──────────────────────────────────────────────
  colSkill:    'Fertigkeit',
  colFw:       'FW',
  colEw:       'EW',
  colAttr:     'Eigenschaft',
  colLevel:    'Stufe',
  labelName:   'Name',
  colGroup:    'Gruppe',
  colCost:     'Kosten',
  colTitle:    'Titel',
  colVersion:  'Version',
  colActive:   'Aktiv',
  colNextCost: 'Nächste Kosten',
  colBaseFw:   'Basis-FW',
  colField:    'Feld',
  colSaved:    'Gespeichert',
  colIncoming: 'Eingehend',

  // ── Charakter-Feldbezeichner ─────────────────────────────────────────────────
  labelGrad:         'Grad',
  labelPlayer:       'Spieler',
  labelRace:         'Rasse',
  labelType:         'Typ',
  labelOrigin:       'Herkunft',
  labelStatus:       'Status',
  labelSocialStatus: 'Sozialer Status',
  labelEsTotal:      'ES (gesamt)',
  labelEpAvail:      'EP (verfügbar)',
  labelNextGrad:     'Nächster Grad bei',

  // ── Personalia-Feldbezeichner ─────────────────────────────────────────────────
  labelGeschlecht:  'Geschlecht',
  labelHaendigkeit: 'Händigkeit',
  labelAlter:       'Alter',
  labelGroesse:     'Größe (cm)',
  labelGewicht:     'Gewicht (kg)',
  labelGestalt:     'Gestalt',
  labelGlaube:      'Glaube',
  labelGG:          'GG (Göttergunst)',
  labelSG:          'SG (Schicksalsgunst)',

  haendigkeitOptions: ['rechts', 'links', 'beidhändig'] as const,

  // ── Eigenschafts-Labels (Charakterbogen) ─────────────────────────────────────
  propSt:   'Stärke (St)',
  propGs:   'Geschicklichkeit (Gs)',
  propGw:   'Gewandtheit (Gw)',
  propKo:   'Konstitution (Ko)',
  propIn:   'Intelligenz (In)',
  propZt:   'Zaubertalent (Zt)',
  propPa:   'Pers. Ausstrahlung (pA)',
  propWk:   'Willenskraft (Wk)',
  propAu:   'Aussehen (Au)',
  propAusb: 'Ausdauerbonus (AusB)',
  propLp:   'Lebenspunkte (LP)',
  propAp:   'Ausdauerpunkte (AP)',
  propSchb: 'Schadensbonus (SchB)',
  propB:    'Bewegungsweite (B)',
  propAnb:  'Angriffsbonus (AnB)',
  propAbb:  'Abwehrbonus (AbB)',
  propZaub: 'Zauberbonus (ZauB)',
  propResbg: 'Resistenzbonus Geist (ResBg)',
  propResbk: 'Resistenzbonus Körper (ResBk)',

  // ── Eigenschafts-Abkürzungen (Formular) ──────────────────────────────────────
  propAbbrSt:   'St',
  propAbbrGs:   'Gs',
  propAbbrGw:   'Gw',
  propAbbrKo:   'Ko',
  propAbbrIn:   'In',
  propAbbrZt:   'Zt',
  propAbbrPa:   'pA',
  propAbbrWk:   'Wk',
  propAbbrAu:   'Au',
  propAbbrAusb: 'AusB',
  propAbbrLp:   'LP',
  propAbbrAp:   'AP',
  propAbbrSchb: 'SchB',
  propAbbrB:    'B',
  propAbbrAnb:  'AnB',
  propAbbrAbb:  'AbB',
  propAbbrZaub: 'ZauB',
  propAbbrResbg: 'ResBg',
  propAbbrResbk: 'ResBk',

  // ── EP/ES-Anzeige (Fortschritt, Zaubersprüche) ────────────────────────────────
  epAvailable: 'EP verfügbar:',
  esTotal:     'ES gesamt',

  // ── Leere-Listen-Hinweise ────────────────────────────────────────────────────
  emptySkillsLearned: 'Noch keine Fertigkeiten gelernt.',
  emptySkillsForm:    'Noch keine Fertigkeiten hinzugefügt.',
  emptySpellsLearned: 'Noch keine Zaubersprüche gelernt.',
  emptySpellsForm:    'Noch keine Zaubersprüche hinzugefügt.',
  emptyChars:
    'Noch keine Charaktere gespeichert. Importiere eine Charakter-JSON-Datei, um zu beginnen.',

  // ── Startseite (HomeView) ────────────────────────────────────────────────────
  homeTitle:          'Magus NG',
  homeImportBtn:      'Charakter aus JSON importieren',
  homeIsAlreadySaved: 'ist bereits gespeichert.',
  homeOverwriteTitle: 'Bestehenden Charakter überschreiben?',
  homeDiffSubtitle:   'Die folgenden Werte würden sich ändern:',
  homeNoDiff:
    'Keine Unterschiede gefunden – die Datei entspricht dem gespeicherten Charakter.',
  homeOverwriteBtn:   'Überschreiben',
  homeActiveRules:    'Aktive Regeln',
  homeNoRules:        'Keine Regeln geladen.',
  homeManageRules:    'Regeln verwalten',

  // ── Charakterbogen (CharacterSheetView) ──────────────────────────────────────
  sheetExport:          'Als JSON exportieren',
  sheetExportHint:      'Charakter als JSON exportieren',
  sheetExportHintNA:    'Benötigt einen Chromium-basierten Browser',
  sheetUnsupportedType: 'Charakter wird von geladenen Regelwerken nicht unterstützt.',

  // ── Fortschritt (AdvancementView) ────────────────────────────────────────────
  advAddEp:          'EP hinzufügen',
  confirmLearnPfx:   'Lernen:',
  confirmFor:        'für',
  confirmAdvancePfx: 'Steigern:',
  advFromFw:         'von FW',
  advToFw:           'auf FW',
  advKnownSkills:    'Bekannte Fertigkeiten',
  advAdvanceBtn:        'Steigern',
  advMaxTag:            'Max',
  advGradBased:          'Grad-basiert',
  advNotAdvanceable:    'nicht steigerbar',
  advLearnNewSkill:     'Neue Fertigkeit lernen',

  // ── Zaubersprüche-Ansicht (SpellsView) ───────────────────────────────────────
  spellsNotCaster: 'Dieser Charaktertyp kann keine Zaubersprüche wirken.',
  spellsEpAfter:   'EP danach:',
  spellsKnown:     'Bekannte Zaubersprüche',
  spellsLearnNew:  'Neuen Zauberspruch lernen',

  // ── Regeln (RulesView) ───────────────────────────────────────────────────────
  rulesTitle:          'Regeln',
  rulesImportBtn:      'Regeldateien importieren…',
  rulesGithubBtn:      'Von Github laden',
  rulesGithubLoading:  'Wird geladen…',
  rulesGithubSuccess:  (n: number) => `${n} Regelwerk(e) erfolgreich geladen.`,
  rulesGithubNoAssets: 'Dieses Release enthält keine JSON-Assets.',
  rulesGithubAvailable:   'Erhältlich auf Github',
  rulesGithubDownloadBtn: 'Herunterladen',
  rulesEmptyHint:
    'Keine Regeln geladen. Importiere eine Regelwerk-JSON-Datei, um zu beginnen.',

  // ── Charakterformular (CharacterFormView) ────────────────────────────────────
  formEditTitle:             'Charakter bearbeiten',
  formNewTitle:              'Neuer Charakter',
  formLoadingRules:          'Regeln werden geladen…',
  formCharNamePlaceholder:   'Name des Charakters',
  formPlayerNamePlaceholder: 'Name des Spielers',
  formSelectPlaceholder:     '— wählen —',
  formEsTotalLabel:          'ES gesamt (Erfahrungsschatz)',
  formEpAvailLabel:          'EP verfügbar',
  formAddSkillPlaceholder:   '— Fertigkeit hinzufügen —',
  formAddSpellPlaceholder:   '— Zauberspruch hinzufügen —',
  formSaving:                'Wird gespeichert…',
  formSaveChanges:           'Änderungen speichern',
  formCreateChar:            'Charakter erstellen',

} as const
