- Umlaute in LaTeX robuster gemacht

## [v0.17.1] - 2026-08-18
- Hosting jetzt auf Cloudflare (https://magusng.silber.de / https://magusng-dev.silbaer.de)

## [v0.17.0] - 2026-08-12

### Rule Parse Scripte
- Mogadil: Skill-Gruppen-Deduktion in den Parser integriert — Skills mit groupCostCats, Typen mit groupCosts (ersetzt costPatterns/costColumns)
- Mogadil: Waffenfertigkeiten werden als eigene Skills ausgegeben (inkl. Waffen-Kosten pro Typ)
- Mogadil: Download-Fix 
- EVA: Fix Download
- Book-Parser: gemeinsame Bibliothek für Parser

## [v0.16.0] - 2026-07-27


### Rule Parse Scripte
- Mogadil neue Version (Fix Leiteigenschaft für Fälschen)
- FIX: Layoutänderungen in Lerntabellen hat parser gebrochen

### Diverses
- Analysescript für Mogadil (Groupcost der Klassen & Skillgruppen der Skills ermitteln)
- Plan um den Algorithmus des Analysescrips in den Mogadil-Parser zu integrieren
- Skill-Parser für Ars Armorum und Mysterium

## [v0.15.1] - 2026-07-19

### Diverses
- sast und secret detection aus CI raus

## [v0.15.0] - 2026-07-19

### Gradaufstieg (Grad-Up)
- Neues Popup beim Gradaufstieg: Wizard mit N Durchläufen (ein Schritt pro Grad)
- AP-Erhöhung: 1W3 + Klassenbonus + ΔAusB (Grad 1–5) bzw. 1W3 + ΔAusB (Grad ≥ 6)
- Eigenschaftssteigerung: W%-Wurf pro Gradschritt (1W3 auf eine freie Eigenschaft)
- FW-Updates: Abwehr, Resistenz und Zaubern werden auf den neuen Grad-Wert gesetzt
- GradUpService als immutable Service (folgt bestehender Architektur)
- Neue Regel-Daten: apGain pro Charaktertyp, gradUpRules mit W%-Tabelle

### Charaktervalidierung
- CharacterValidator: validate() mit 7 Prüfkategorien, autoFix() und correctIssues()
- FormulaEngine: sicherer Recursive-Descent-Parser für Formeln aus dem Regelwerk
- UniversalRules: formulas[] und innateSkills[] im Regelwerk (nicht mehr hartkodiert)
- Rassen- und Klassen-Boni auf Eigenschaften (ResBk, ResBg) mit mode (add/set)
- Dice-Formeln: W% als W100-Würfel korrekt erkannt; Range-Validierung statt exaktem Vergleich
- Fehlende Rassen-Skills werden in autoFix() und correctIssues() ergänzt
- MISSING_RACIAL_SKILL von warning auf error geändert (blockiert Speichern)
- CharacterLoadService persistiert autoFix()-Korrekturen in IndexedDB
- CharacterEditView validiert bei Rasse/Klassen-Wechsel (lesend)
- Gradtabelle aus den Mogadil Lerntabellen ins Regelwerk

### Rule Parse Scripte
- EVA: propertyBonuses aus ZAU/KAE für Klassen (Resistenz-Boni)
- EVA: apbonus aus Dynprops für Gradaufstieg
- Mogadil: Kategorie-Ableitung (Kämpfer/KampfZauberer/Zauberer) aus Spell- und Waffen-Kosten
- Mogadil: AP-Gain pro Typ basierend auf Kategorie

### Fixes
- W% in FormulaEngine korrigiert (wurde nicht als Dice-Token erkannt)
- Formeln mit Würfeln werden per Range validiert (verhindert false positives)
- Validierungs-Reihenfolge: Rassen-Skills vor InnateSkills (rassenspezifische Werte haben Vorrang)
- Rassen-Spezifische Skills fehlten beim automatischen Fix nach dem Laden
- Fehlende Umlaute und Fertigkeiten im LaTeX/PDF-Datenblatt

## [v0.14.1] - 2026-07-11

### Fixes
- Zu lange Zauberbeschreibungen jetzt scrollbar

## [v0.14.0] - 2026-07-11

### Hausregeln
- Eigene Kurzbeschreibung von Spells eingeben und als Hausregel speichern. Kurzbeschreibung wird im LaTeX ausgegeben!

### LaTeX / PDF Datenblatt
- Sprüche werden in zwei Spalten ausgegeben
- Ausrichtung der Spalten auf Top geändert


### Fixes
- Fehler in EVA Parser beim min/max Attributwerten

### UX/UI
- Eingabe der EP beim steigern mit Gold begrenzt
- Sprüche werden jetzt alphabetisch sortiert und nicht mehr nach Level

## [v0.13.1] - 2026-07-10

### Fixes
- Bezeichnung der Spellgruppen Wundertaten und Zauberlieder hat nicht gepasst
- Eingesetztes Gold wird beim Steigern geprüft

### UX/UI
- Abbruch bei Drive File Selector wird behandelt (App hängt nicht mehr)
- Rückmeldung bei Aktionen via Chips (Ok, Warnung, Fehler)
- Rückmeldung beim Export auf Google Drive

### Sonstiges
- lokales Build und Deploy angepasst
- Prüfung ob Drive Secrets vorhanden sind beim lokalen deploy
- Backupname enthält App-Version 

## [v0.13.0] - 2026-07-09

### Sonstiges
- Kontakt-E-Mail geändert

### Rule Parse Scripte
- Version der Scripte wird in Rule Metadaten geschrieben

### Fixes
- Berechnung des Schadens im LaTeX-Export korrigiert
- Abwehr mit Verteidigungswaffe: Parierwaffen-/Schilde-FW wird im LaTeX-Sheet berücksichtigt
- Scripte schreiben keine leeren Properties mehr

## [v0.12.2] - 2026-07-07

### Fixes
- Sinne können im Charakter-Editor negative Werte annehmen

## [v0.12.0] - 2026-07-07

### Backup & Wiederherstellung
- Backup aller Charaktere und Regelwerke als einzelne JSON-Datei (Download)
- Wiederherstellen eines Backups (Restore)

### LaTeX / PDF-Export
- Erste vollständige Version des LaTeX-Exports mit eigenem `.cls`
- Fix: Sinne werden im PDF korrekt dargestellt
- Fix: Fehlende Fertigkeiten im Charakter-Sheet ergänzt

### Google Drive
- Connect-Button im Nav-Bar zur einmaligen Autorisierung

### Hilfe
- Hilfe-Seite erweitert

### Fixes
- Steigern mit Gold: Es konnten mehr GS ausgegeben werden als der Charakter besitzt

## [v0.11.5] - 2026-06-27


### Google Drive Integration
- Token-Persistenz: Access-Token und Refresh-Token werden in localStorage gespeichert und über Browser-Neustarts hinweg vorgehalten
- Refresh-Token ermöglicht stumme Erneuerung des Access-Tokens ohne erneute Kontoauswahl
- Zugriff widerrufbar: "Trennen"-Button im Nav-Bar ruft Google-Revoke-Endpoint auf + löscht lokale Tokens
- Account-Anzeige im Nav-Bar: "Verbunden als mail@…" bei aktivem Token, sonst "Google Drive: nicht verbunden"
- Reaktives UI-Update: Custom-Event bei Token-Änderung – kein Seiten-Neuladen nötig
- Fehlermeldungen enthalten jetzt HTTP-Status + Response-Body (erleichtert Debugging)
- PKCE entfernt: Google Cloud Console OAuth-Client ist als "Web application" registriert und benötigt `client_secret` im Token-Exchange
- Integration ist jetzt in Production und für alle nutzbar

### UI & Navigation
- "+ Neuer Charakter" aus Nav-Bar entfernt, stattdessen als primärer Button auf der Startseite
- Google Drive-Status-Info im Nav-Bar (nur sichtbar wenn Drive-Features aktiviert sind)
- Versionsbanner: In Dev-Builds wird der normale Versionstext ausgeblendet, nur der DEV-Badge bleibt sichtbar

### Installation & CI
- CI-Pipeline aktualisiert
- Installationsskripte laden fehlende Abhängigkeiten nur noch bei Bedarf (kein erneuter Download wenn bereits vorhanden)

### Sonstiges
- Vorbereitungen für PDF-Export von Charakterblättern

## [v0.11.3] - 2026-06-19

### Google Drive Integration
- Import/Export von Charakteren und Regelwerken via Google Drive
- Automatische Ordnerstruktur (MagusNG/characters, MagusNG/rules)
- Diff-Ansicht beim erneuten Import eines existierenden Charakters

### Hilfe / FAQ
- FAQ-Seite hinzugefügt (noch mit KI-generiertem Inhalt)

### UI & Icons
- Icons (SVG/PNG) hinzugefügt und Hintergrundfarbe angepasst
- Browser-Warnung entfernt — App funktioniert auch in Firefox (lokaler Datei-Import/Export weiterhin Chromium-only)
- Buttons für lokalen Datei-Import/Export werden in Firefox ausgegraut mit Tooltip
- Button-Styles zentralisiert in src/styles/buttons.css und vereinheitlicht
- Ungenutzte UI-Strings aufgeräumt

### Deployment & CI
- Deployment auf Ubuntu LXC unter https://magusng-dev.silbaer.de/ (Entwicklungsstand)
- CI-Script gefixt

### Dokumentation
- Installationsanleitung und Data Schema aktualisiert

## [v0.10.2] - 2026-06-16

### Fixes
- Mogadil-Parser gefixt

## [v0.10.1] - 2026-06-16

### Lernen & Steigern
- Beim Steigern EP durch Gold ersetzen
- Lernen / Steigern mit PP (Praxis Punkte)
- Eingabe von PP im Charakterblatt (+/- Buttons)

### Mogadil-Import
- Quelle der Fertigkeiten (Mogadil) wird angezeigt
- Waffenfertigkeiten aus Mogadil
- Typen aus Mogadil werden importiert und genutzt

### UI & Sheet
- Spruchdetails im Charakterblatt
- Search-as-you-type bei Fertigkeiten und Sprüchen in der EditView
- Waffenskill wird zur Waffe gespeichert

### Scripts
- Arkanum-PDF-Parsing in Start-Installation.cmd integriert
- Extraktionsscripts für Arkanum und Kodex begonnen

### Fixes
- Inventory wurde beim Bearbeiten nicht mehr gelöscht
- Kleinere Unstimmigkeiten beim Parsen behoben
- Fehler in EVA-Datei (doppelte Sprachen) umgangen

## [v0.9.5] - 2026-06-13

### Mogadil-Import (Scripts)
- Mogadil Lerntabellen — 1. Versuch
- Mogadil Download und Parsen per Default aktiviert
- Testscripts für Merge mit Mogadil-Datei

### PWA & UI
- Reihenfolge/Priorität in der die Regeln geladen werden wird in der UI angezeigt
- Reihenfolge inm der die Regeln geladen werden änderbar
- Nummerische Priorität für Sortierung

## [v0.6.4] - 2026-06-10

### Berechnungen
- Zaubern, Raufen, Abwehr nutzen Bonus statt Attributswert

### Scripts
- Installation der Python-Tools vereinfacht
- Python-Skripte per Klick mit Ausgabe im Fenster

## [v0.6.3] - 2026-06-08

### Waffen & Ausrüstung
- Waffenfertigkeiten hinzugefügt
- Bonus für Waffenskills
- Dinge (Items) parsen
- Ausrüstung kann eingegeben werden
- Waffen werden als Dinge geparsed; Eingabe von Waffenattributen
- Spezialwaffe
- Ausrüstung kann editiert werden

### Sheet & Darstellung
- Sheet-Darstellung verbessert
- Darstellung Equipment

### Werte & Berechnungen
- Angebohrende Fertigkeiten

### Sonstiges
- Geschlecht als Option

## [v0.6.2] - 2026-06-06

### Gold & Lernen
- Goldstücke zum Charakter hinzugefügt
- Lernen mit Gold (Goldkosten für Fertigkeiten)
- Goldkosten im Popup bestätigen

### Spells
- Kosten für Sprüche korrigiert

### Entfernt
- EVA-Import aus PWA entfernt

## [v0.5.9] - 2026-06-05

- Dokumentation (README) aktualisiert

## [v0.5.8] - 2026-06-04

- Fix: Prüfung auf Vorhandensein von Python
