# MagusNG

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

Eine Progressive Web App (PWA) zur Erstellung und Verwaltung von Charakteren für Tabletop-Rollenspiele wie  **Midgard M5** und andere.

Diese Software ist ein reines Fanprojekt. Die Rechte an Midgard und dem Midgard-Regelwerk liegen beim Verlag für F&SF-Spiele oder Pegasus Spiele.  (Das versuche ich grad rauszufinden)

Du kannst die aktuelle Version der Software jederzeit [hier](https://magusng-pwa-823c6f.gitlab.io/) ausprobieren. 
Die App läuft komplett im Browser und auch alle Daten werden nur in deinem Browser gespeichert. Die App läuft auch auf Tablets und Telefonen, aber das Layout ist für Handys aktuell nicht gut geeignet.

---

## Zweck

MagusNG ermöglicht es, RPG-Charaktere Schritt für Schritt zu erstellen und zwischen Abenteuern weiterzuentwickeln. Die App ist für Desktop-Browser ausgelegt und kann als PWA installiert werden, um auch offline nutzbar zu sein.

---

## Funktionen

- Neue RPG-Charaktere anlegen
- Bestehende Charaktere verwalten und steigern
- Offline-Nutzung nach dem ersten Laden (TBD)
- Charaktere als lokale JSON-Dateien speichern (kein Cloud-Konto erforderlich)
- Regelwerke (Fertigkeiten, Kosten, Rassen, Typen) aus lokalen JSON-Dateien laden

## Speicherung der Charaktäre

Alle Daten werden lokal in deinem Browser gespeichert. Einmal importierte Regelwerke bleiben dauerhaft verfügbar, auch wenn du die App zwischendurch schließt.
Das gleiche gilt für die Charaktäre. Die Charaktäre kannst du auch zur Sicherung exportieren.

**Das empfehle ich auf jeden fall nach jeder größeren Änderung!**
Das Program ist noch in der Entwicklungsphase und ich kann nicht garantieren, dass nicht auch Daten verloren gehen!

## Quelle für Regelwerkdateien

Aus rechtlichen Gründen kann ich keine Dateien mit den Regeln mitliefern. Diese muss sich jeder Nutzer selbst erstellen oder erstellen lassen.

> [!Warning] Achtung
> Dabei unbedingt das Copyright beachten! Im Allgemeinen ist die Weitergabe der erstellten Dateien nicht erlaubt

Das Format der Regeldateien wird [hier](docs/data-schema.md) beschrieben. Falls sich Fragen ergeben könnt ihr mich gerne kontaktieren (siehe unten).

Alternativ kann man die Regeln aus EVA importieren. EVA findest du auf [ebruenner.de](https://ebruenner.de) ([Direktlink](http://ebruenner.de/download/EVA.zip)) 
In dem Archiv findest du (u.a.) zwei XML Dateien:
- m5arkanum.xml
- m5kodex.xml

Diese kannst du unter "Regeln verwalten" in der PWA speichern. 

> [!important] Wichtig
> Die Unterstützung der EVA-Dateien ist explizit experimentell und einige Sachen werden nicht wie gewünscht funktionieren! 

## Kontakt

Wenn du ein Problem mit der App hast, kannst du ein Issue erstellen.

Du kannst mich auch über [Mastodon](https://social.tchncs.de/deck/@silbaer) oder [Signal](https://signal.me/#eu/k3jTHrQSX-LOVOw4Xw_pVuci-kXdACgPZz3-VRvD0ID_sfDjxUhNqrHlIf7hsg1j).

---

## Technologie-Stack

| Ebene | Technologie |
|-------|-------------|
| Frontend | Vue 3, Vite, TypeScript |
| Middleware | TypeScript (Service-/Logikschicht) |
| Datenspeicherung | IndexedDB, File System Access API |
| Datenformat | JSON |
| PWA | Service Worker, Web App Manifest |

---

## Architektur

Die App ist in drei Schichten aufgeteilt:

```
┌──────────────────────────────────────────────┐
│               Frontend (UI)                  │
│   Vue 3 + Vite + TypeScript                  │
│   - Charakter-Erstellungsassistent           │
│   - Charakterbogen-Ansicht                   │
│   - Fertigkeitsverwaltung                    │
└─────────────────┬────────────────────────────┘
                  │
┌─────────────────▼────────────────────────────┐
│            Middleware (Service-Layer)         │
│   TypeScript                                 │
│   - Geschäftslogik & Validierung             │
│   - Charakter- und Regelzugriff              │
└─────────────────┬────────────────────────────┘
                  │
┌─────────────────▼────────────────────────────┐
│               Datenhaltung                   │
│   IndexedDB / File System Access API         │
│   - Regelwerke aus JSON lesen                │
│   - Charakterdateien lesen / schreiben       │
└──────────────────────────────────────────────┘
```

---

## Module

### 1. Charakter-Erstellung *(geplant)*
Schritt-für-Schritt-Assistent zur Erstellung eines neuen Charakters.  
Schritte: Rasse → Typ → Herkunft → Stand → Grundeigenschaften → Abgeleitete Werte → Startfertigkeiten.

### 2. Charakterbogen
Schreibgeschützte Ansicht des aktuellen Charakterzustands mit allen Eigenschaften, Fertigkeiten und Metadaten.

### 3. Charaktersteigerung
Verwaltung von Erfahrungspunkten (EP), Lernen und Steigern von Fertigkeiten gemäß den Regelkosten.

### 4. Regelwerke
Import und Verwaltung von Regelquellen (JSON) über IndexedDB.

### 5. Zauberverwaltung
EP-basiertes Lernen von Zaubersprüchen für zauberfähige Charaktertypen.

---

## Entwicklung

### Voraussetzungen

- Node.js 20+
- npm

### Installation

```bash
npm install
```

### Entwicklungsserver starten

```bash
npm run dev
```

### Produktions-Build erstellen

```bash
npm run build
```

### Build-Vorschau

```bash
npm run preview
```

---

## Datenspeicherung

- **Charaktere** werden in IndexedDB gespeichert (Datenbank `MagusM5`, Store `characters`).
- **Regelwerke** werden vom Benutzer als JSON-Dateien importiert und in IndexedDB gespeichert (Datenbank `MagusM5-Rules`, Store `sources`).
- Kein Cloud-Konto, kein Server erforderlich — alle Daten verbleiben lokal im Browser.

---

## Nicht-Ziele (aktuell)

- Kein Benutzerkonto oder Cloud-Synchronisation
- Kein Mehrspielermodus oder Spielleiter-Werkzeuge
- Kein Würfelwurf-System
- Kein Kampftracker

Diese Funktionen können in späteren Phasen hinzugefügt werden.

---

## Lizenz

Dieses Projekt ist unter der **GNU General Public License v3.0 (GPL-3.0)** lizenziert. Weitere Informationen findest du in der [LICENSE](LICENSE)-Datei.
