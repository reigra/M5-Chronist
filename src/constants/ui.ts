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
  close:         'Schließen',
  add:           'Hinzufügen',
  delete:        'Löschen',
  learnBtn:      'Lernen',
  notApplicable: '—',
  unitEp:        'EP',
  unitEs:        'ES',
  selectPlaceholder: 'Bitte auswählen …',

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

  // ── Browser-Kompatibilitätshinweis ───────────────────────────────────────────
  browserUnsupportedHint:
    'Dieser Browser wird nicht unterstützt. Bitte Chrome, Edge oder Opera verwenden.',

  // ── Abschnitts-Überschriften ─────────────────────────────────────────────────
  secIdentity:            'Identität',
  secPersonalia:          'Personalia',
  secIdentityPersonalia:  'Identität, Personalia & Spezialisierungen',
  secExperience:          'Erfahrung',
  secProps:               'Eigenschaften',
  secBoni:                'Boni',
  secPropsBoni:           'Eigenschaften & Boni',
  secCombat:          'Kampf',
  secWeaponSkills:    'Waffenfertigkeiten',
  secSkills:          'Fertigkeiten',
  secUnlearnedSkills: 'Ungelernte Fertigkeiten',

  // ── Spalten- und Feldbezeichner ──────────────────────────────────────────────
  colSkill:    'Fertigkeit',
  colFw:       'FW',
  colPp:       'PP',
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
  labelGold:         'Gold (GS)',
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

  geschlechtOptions: ['männlich', 'weiblich'] as const,
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

  // ── Ausrüstungs-Ansicht (EquipmentView) ─────────────────────────────────────
  navEquipment:         'Ausrüstung',
  equipHeader:          'Ausrüstung',
  equipColName:         'Name',
  equipColLocation:     'Ort',
  equipColWeight:       'Gewicht (kg)',
  equipEmpty:           'Keine Ausrüstung vorhanden.',
  equipSearchPlaceholder: 'Name eingeben oder suchen…',
  equipAddBtn:          'Hinzufügen',
  equipUpdateBtn:       'Aktualisieren',
  equipSaveBtn:         'Speichern',
  equipCancelBtn:       'Abbrechen',
  equipLabelName:       'Name',
  equipLabelGroup:      'Gruppe',
  equipLabelLocation:   'Ort',
  equipLabelDesc:       'Beschreibung',
  equipLabelPrice:      'Preis (GS)',
  equipLabelWeight:     'Gewicht (kg)',
  equipLabelWaffe:      'Waffe',
  equipLabelDamage:     'Schaden',
  equipLabelWaffentyp:  'Waffentyp',
  equipLabelSaveAP:     'AP-Schutz',
  equipLabelAnb:        'Angriffs Bonus',
  equipLabelSchb:       'Schadens Bonus',
  equipLabelAbb:        'Abwehr Bonus',
  equipLabelMagisch:      'Magisch',
  equipLabelSpezialwaffe: 'Spezialwaffe',
  equipLabelSkill:       'Fertigkeit',

  // ── Leere-Listen-Hinweise ────────────────────────────────────────────────────
  emptySkillsLearned: 'Noch keine Fertigkeiten gelernt.',
  emptySkillsForm:    'Noch keine Fertigkeiten hinzugefügt.',
  emptySpellsLearned: 'Noch keine Zaubersprüche gelernt.',
  emptySpellsForm:    'Noch keine Zaubersprüche hinzugefügt.',
  emptyChars:
    'Noch keine Charaktere gespeichert. Importiere eine Charakter-Datei, um zu beginnen.',

  // ── Startseite (HomeView) ────────────────────────────────────────────────────
  homeTitle:          'Magus NG',
  homeImportBtn:      'Charakter von Festplatte importieren',
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
  sheetExport:          'Download Charakter',
  sheetExportHint:      'Charakter exportieren',
  sheetUnsupportedType: 'Charakter wird von geladenen Regelwerken nicht unterstützt.',
  sheetExportLatex:     'Download LaTeX',
  sheetExportLatexPdf:  'Download PDF',

  // ── Fortschritt (AdvancementView) ────────────────────────────────────────────
  advAddEp:             'EP hinzufügen',
  advGoldLearnCost:     'Lernkosten (GS):',
  advGoldAdvanceCost:   'Trainingskosten (GS):',
  advGoldEpReplacement: 'EP-Ersatz (GS):',
  advGoldEpReplaced:    'EP mit Gold ersetzt:',
  advEpAfterDeduction:  'EP danach:',
  confirmLearnPfx:      'Lernen:',
  confirmFor:           'für',
  confirmAdvancePfx:    'Steigern:',
  advFromFw:            'von FW',
  advToFw:              'auf FW',
  advKnownSkills:       'Bekannte Fertigkeiten',
  advAdvanceBtn:        'Steigern',
  advMaxTag:            'Max',
  advGradBased:         'Grad-basiert',
  advNotAdvanceable:    'nicht steigerbar',
  advLearnNewSkill:     'Neue Fertigkeit lernen',
  advLearnWeaponSkill:  'Neue Waffenfertigkeit lernen',
  advChooseInstance:    'Spezialisierung:',
  advChoosePlaceholder: '— bitte wählen —',

  // ── Zaubersprüche-Ansicht (SpellsView) ───────────────────────────────────────
  spellsNotCaster: 'Dieser Charaktertyp kann keine Zaubersprüche wirken.',
  spellsEpAfter:   'EP danach:',
  spellsKnown:     'Bekannte Zaubersprüche',
  spellsLearnNew:  'Neuen Zauberspruch lernen',
  spellDetailView:  'Details',
  spellOverviewView: 'Übersicht',

  // ── Regeln (RulesView) ───────────────────────────────────────────────────────
  rulesTitle:          'Regeln',
  rulesImportBtn:      'Regeldateien importieren…',
  rulesReorderBtn:     'Priorität ändern',
  rulesReorderExit:    'Fertig',
  rulesReorderCol:     'Verschieben',
  rulesGithubAvailable:   'Erhältlich auf Github',
  rulesGithubDownloadBtn: 'Herunterladen',
  rulesEmptyHint:
    'Keine Regeln geladen. Importiere eine Regelwerk-Datei, um zu beginnen.',

  // ── Charakterformular (CharacterFormView) ────────────────────────────────────
  formEditTitle:             'Charakter bearbeiten',
  formNewTitle:              'Neuer Charakter',
  formLoadingRules:          'Regeln werden geladen…',
  formCharNamePlaceholder:   'Name des Charakters',
  formPlayerNamePlaceholder: 'Name des Spielers',
  formSelectPlaceholder:     '— wählen —',
  formEsTotalLabel:          'ES gesamt (Erfahrungsschatz)',
  formEpAvailLabel:          'EP verfügbar',
  formGoldLabel:             'Gold (Goldstücke)',
  formAddSkillPlaceholder:   '— Fertigkeit hinzufügen —',
  formAddSpellPlaceholder:   '— Zauberspruch hinzufügen —',
  formSaving:                'Wird gespeichert…',
  formSaveChanges:           'Änderungen speichern',
  formCreateChar:            'Charakter erstellen',

  // ── Spezialisierungen ──────────────────────────────────────────────────────
  secSpecializations: 'Spezialisierungen',
  labelWeaponSpec:    'Spezialwaffe',
  labelSpellSpec:     'Spezialgebiet',

  // ── Zauberschulen (spellGroup → Langname) ──────────────────────────────────────
  spellGroupNames: {
    'Beherr.':   'Beherrschen',
    'Beweg.':    'Bewegen',
    'Erkenn.':   'Erkennen',
    'Erschaff.': 'Erschaffen',
    'Formen':    'Formen',
    'Veränd.':   'Verändern',
    'Zerstören': 'Zerstören',
    'Wunder':    'Wunder',
    'Lied':      'Lied',
    'Dweom.':    'Dweomer',
  } as Record<string, string>,


  // ── Hilfe ──────────────────────────────────────────────────────────────────────
  helpNav:         'Hilfe',
  helpBackToOverview: 'Zurück zur Übersicht',
  helpNotFoundTitle:  'Seite nicht gefunden',
  helpNotFoundText:   'Die angeforderte Hilfeseite existiert nicht.',

  // ── Google Drive (Datei-Import/Export) ───────────────────────────────────────
  importGoogleDrive:    'Charakter von Google Drive importieren',
  exportGoogleDrive:    'Google Drive export',
  driveImportRules:     'Regelwerk aus Google Drive importieren',
  driveExportRules:     'Regelwerk nach Google Drive exportieren',
  driveErrorPrefix:     'Google Drive Fehler:',
} as const
