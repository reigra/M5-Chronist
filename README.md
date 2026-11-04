# M5 - Chronist

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

Eine Progressive Web App (PWA) zur Erstellung und Verwaltung von Charakteren für das Rollenspiel **Midgard M5**.

> M5 - Chronist ist ein Fork von [MagusNG](https://gitlab.com/silbaer/magusng-pwa) und wird seit November 2026 eigenständig weiterentwickelt. Details unter [Herkunft](#herkunft).

Diese Software ist ein reines Fanprojekt. Die Rechte an Midgard und dem Midgard-Regelwerk liegen beim Verlag für F&SF-Spiele GbR, Stelzenberg.

Die App läuft komplett im Browser, alle Daten werden nur in deinem Browser gespeichert. Sie läuft auch auf Tablets und Telefonen, das Layout ist für Handys aktuell aber nicht gut geeignet.

Die App läuft in allen modernen Browsern (Chrome, Edge, Firefox, Opera). Für den Import/Export von lokalen Dateien wird die File System Access API genutzt, die nur in Chromium-basierten Browsern (Chrome, Edge, Opera) und nur über HTTPS oder `localhost` verfügbar ist. Der Import/Export via Google Drive funktioniert in allen Browsern.

---

## Zweck

M5 - Chronist hält die Geschichte deiner Helden fest: Charaktere werden angelegt und zwischen Abenteuern weiterentwickelt. Die App ist für Desktop-Browser ausgelegt und kann als PWA installiert werden, um auch offline nutzbar zu sein.

---

## Funktionen

- Neue Charaktere anlegen
- Bestehende Charaktere verwalten und steigern
- Offline-Nutzung nach dem ersten Laden
- Charaktere als Dateien speichern (kein Cloud-Konto erforderlich)
- Regelwerke (Fertigkeiten, Kosten, Rassen, Typen) aus lokalen Dateien laden
- Ausrüstungsverwaltung (Waffen, Rüstung, Gegenstände)
- Charakterbogen als LaTeX/PDF exportieren
- Backup und Wiederherstellung aller Daten als ZIP-Datei
- Google Drive Integration (Import/Export von Charakteren, Regelwerken und Backups)

---

## Speicherung der Charaktere

Alle Daten werden lokal in deinem Browser gespeichert. Einmal importierte Regelwerke bleiben dauerhaft verfügbar, auch wenn du die App zwischendurch schließt. Das Gleiche gilt für die Charaktere.

> [!Warning] Achtung
> Die App befindet sich noch in Entwicklung. Erstelle nach jeder größeren Änderung ein Backup (Startseite → Backup) oder exportiere deine Charaktere. Datenverlust kann nicht ausgeschlossen werden.

---

## Quelle für Regelwerkdateien

Aus rechtlichen Gründen enthält die App keine Regeldaten. Jeder Nutzer muss sich die Dateien selbst erstellen.

> [!Warning] Achtung
> Dabei unbedingt das Copyright beachten! Im Allgemeinen ist die Weitergabe der erstellten Dateien nicht erlaubt.

Das Format der Regeldateien ist in [docs/data-schema.md](docs/data-schema.md) beschrieben.

Die Regeldateien werden mit Python-Skripten aus verschiedenen Quellen erzeugt. Das Basisregelwerk wird aus öffentlichen Quellen erstellt (kein eigenes Regelwerk notwendig); wenn vorhanden, werden auch die offiziellen Regelwerk-PDFs eingelesen. Die Skripte liegen im Verzeichnis `tools/`.

### Windows (einfach)

`tools/Start-Installation.cmd` doppelklicken. Das Skript lädt automatisch die aktuellen EVA-Daten herunter, entpackt sie und erzeugt die JSON-Dateien im Ordner `tools/rules/`.

Anschließend die erzeugten Dateien in der App unter **Regeln → Regeldateien importieren** hochladen.

---

## Kontakt

Fragen, Fehler und Wünsche bitte als [Issue](https://github.com/reigra/M5-Chronist/issues) melden.

---

## Technologie-Stack

| Ebene | Technologie |
|-------|-------------|
| Frontend | Vue 3, Vite, TypeScript |
| Middleware | TypeScript (Service-/Logikschicht) |
| Datenspeicherung | IndexedDB, File System Access API, Google Drive API |
| Datenformat | JSON |
| PWA | Service Worker, Web App Manifest |

---

## Architektur

Die App ist in drei Schichten aufgeteilt:

```
┌──────────────────────────────────────────────┐
│               Frontend (UI)                  │
│   Vue 3 + Vite + TypeScript                  │
│   - Charakterbogen-Ansicht                   │
│   - Steigerung, Zauber, Ausrüstung           │
│   - Regelverwaltung                          │
└─────────────────┬────────────────────────────┘
                  │
┌─────────────────▼────────────────────────────┐
│            Middleware (Service-Layer)        │
│   TypeScript                                 │
│   - Geschäftslogik & Validierung             │
│   - Charakter- und Regelzugriff              │
└─────────────────┬────────────────────────────┘
                  │
┌─────────────────▼────────────────────────────┐
│               Datenhaltung                   │
│   IndexedDB / File System Access API /       │
│   Google Drive                               │
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
Ansicht des aktuellen Charakterzustands mit allen Eigenschaften, Fertigkeiten und Metadaten, inklusive LaTeX/PDF-Export.

### 3. Charaktersteigerung
Verwaltung von Erfahrungspunkten (EP), Lernen und Steigern von Fertigkeiten gemäß den Regelkosten.

### 4. Regelwerke
Import und Verwaltung von Regelquellen (JSON) mit Prioritäten und Hausregeln.

### 5. Zauberverwaltung
EP-basiertes Lernen von Zaubersprüchen für zauberfähige Charaktertypen.

### 6. Ausrüstungsverwaltung
Verwaltung von Waffen, Rüstungen und Gegenständen inklusive Suchfunktion und Editier-Modal.

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

### Docker

Multi-Stage-Build (`node:24-alpine` → `nginx:alpine-slim`, ca. 22 MB):

```bash
docker build -t m5-chronist .
docker run -d -p 8080:80 m5-chronist
```

Die App ist dann unter `http://localhost:8080` erreichbar. Für den Zugriff über das Netzwerk ist HTTPS nötig (z. B. per Reverse Proxy), sonst sind der lokale Datei-Import und die PWA-Installation nicht verfügbar.

Google Drive wird zur Build-Zeit eingebunden. Ohne Build-Args bleiben die Drive-Buttons ausgeblendet:

```bash
docker build -t m5-chronist \
  --build-arg VITE_GOOGLE_API_KEY=... \
  --build-arg VITE_GOOGLE_CLIENT_ID=... \
  --build-arg VITE_GOOGLE_APP_ID=... \
  --build-arg VITE_GOOGLE_CLIENT_SECRET=... .
```

Optional: `--build-arg VITE_APP_VERSION=...` und `--build-arg VITE_PWA_NAME=...`.

#### Docker Compose

```bash
docker compose up -d --build
```

Die Variablen werden aus der Shell oder aus der `.env` im Projektordner gelesen. Neben den Build-Args oben gibt es `M5_PORT` für den Host-Port (Standard `8080`).

---

## Datenspeicherung

- **Charaktere** werden in IndexedDB gespeichert (Datenbank `M5-Chronist`, Store `characters`).
- **Regelwerke** werden vom Benutzer als Dateien importiert und in IndexedDB gespeichert (Datenbank `M5-Chronist-Rules`, Store `sources`).
- **Google Drive** (optional): Dateien landen im Ordner `M5-Chronist/` mit den Unterordnern `characters/` und `rules/`.
- Kein Cloud-Konto, kein Server erforderlich — alle Daten verbleiben lokal im Browser.

---

## Nicht-Ziele (aktuell)

- Kein Benutzerkonto oder Cloud-Synchronisation
- Kein Mehrspielermodus oder Spielleiter-Werkzeuge
- Kein Würfelwurf-System
- Kein Kampftracker

Diese Funktionen können in späteren Phasen hinzugefügt werden.

---

## Herkunft

M5 - Chronist ist ein Fork von **MagusNG**:

- Original: [gitlab.com/silbaer/magusng-pwa](https://gitlab.com/silbaer/magusng-pwa)
- Fork: [github.com/reigra/M5-Chronist](https://github.com/reigra/M5-Chronist)

Gemäß GPL-3.0 §5a: Diese Version wurde ab November 2026 gegenüber dem Original verändert. Wesentliche Änderungen:

- Umbenennung der App in „M5 - Chronist“, einschließlich interner Bezeichner (IndexedDB-Datenbanken, Google-Drive-Ordner, LaTeX-Klasse)
- Docker-Build (`Dockerfile`, `docker/nginx.conf`)

Die LaTeX-Dokumentklasse `tools/LaTeX/m5figur-chronist.cls` ist abgeleitet von [m5figur-mv](https://github.com/vaeth/m5figur-mv) (Martin Väth) und steht unter der LPPL 1.3c.

---

## Lizenz

Dieses Projekt ist unter der **GNU General Public License v3.0 (GPL-3.0)** lizenziert. Weitere Informationen findest du in der [LICENSE](LICENSE)-Datei.
