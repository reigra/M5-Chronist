# MagusNG

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

Eine Progressive Web App (PWA) zur Erstellung und Verwaltung von Charakteren im Tabletop-Rollenspiel **Midgard M5**.

---

## Zweck

MagusNG ermöglicht es, Midgard-M5-Charaktere Schritt für Schritt zu erstellen und zwischen Abenteuern weiterzuentwickeln. Die App ist für Desktop-Browser ausgelegt und kann als PWA installiert werden, um auch offline nutzbar zu sein.

---

## Funktionen

- Neue Midgard-M5-Charaktere anlegen
- Bestehende Charaktere verwalten und steigern
- Offline-Nutzung nach dem ersten Laden
- Charaktere als lokale JSON-Dateien speichern (kein Cloud-Konto erforderlich)
- Regelwerke (Fertigkeiten, Kosten, Rassen, Typen) aus lokalen JSON-Dateien laden

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
