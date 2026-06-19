# Changelog

## [v0.10.3] - 2026-06-16

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
