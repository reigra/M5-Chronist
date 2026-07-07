# LaTeX-Export für MagusNG

## Ziel

Ein Button "Als LaTeX exportieren" auf dem Charakterblatt generiert eine `.tex`-Datei,
kompatibel mit Martin Väths `m5figur-mv.cls`.  
Der User bekommt ein fertiges PDF — entweder lokal kompiliert (via `pdflatex`, selbst
installiert) oder direkt aus der PWA via **TeXLive.net API** (kostenloser
Webservice, kein Server-Setup nötig).  
Die API-Variante ist **Online-only** — ohne Internet gibt es kein PDF.

## Abhängigkeiten

- `m5figur-mv.cls` (LPPL-1.3c) von Martin Väth — wird nach `tools/LaTeX/` heruntergeladen
  und im generierten `.tex` per `\documentclass{m5figur-mv}` referenziert.
  Bezug: <https://www.martin-vath.de/midgard5/> oder CTAN.
- **TeXLive.net** (<https://texlive.net>) — öffentlicher, kostenloser LaTeX-Kompilierungsdienst
  des TeXLive-Teams. Der Service akzeptiert per `multipart/form-data`-POST beliebige `.tex`-
  Dateien samt zusätzlicher Ressourcen (hier: `.cls`) und gibt das fertige PDF zurück.
  Kein API-Key, keine Registrierung.

## Verifikation (Hello World)

Der Service lässt sich mit `curl` testen:

```bash
# Einfaches Hello World — liefert eine gültige PDF-Datei:
curl -s -L -X POST \
  -F "filename[]=document.tex" \
  -F "filecontents[]=\documentclass{article}\begin{document}Hello World!\end{document}" \
  -F "return=pdf" \
  "https://texlive.net/cgi-bin/latexcgi" \
  -o hello.pdf
```

- `return=pdf` → rohes PDF; `return=pdfjs` → PDF.js-Viewer; `return=log` → Log-Datei
- Mit `-F "filename[]=m5figur-mv.cls" -F "filecontents[]=..."` können Begleitdateien
  (wie die Klasse) mitgeschickt werden.
- Der Endpoint ist `/cgi-bin/latexcgi` (nicht `/cgi-bin/latex` — der gibt 404).

## Schritte

### 1. `m5figur-mv.cls` besorgen

- Von Martin Väths Seite herunterladen → `tools/LaTeX/m5figur-mv.cls`
- Lizenz: LPPL-1.3c (ungeändert, nur Kopie)

### 2. `LatexExportService` (`src/services/LatexExportService.ts`)

Neuer Service mit folgenden Methoden:

```
generate(character: Character, rules: RulesData): string
```

Erzeugt vollständigen `.tex`-Inhalt.

```
async compileToPdf(texContent: string, clsContent: string): Promise<Blob>
```

Sendet `.tex` + `.cls` per `multipart/form-data` an `https://texlive.net/cgi-bin/latexcgi`
und gibt das PDF als `Blob` zurück. Bei Fehlern → `throw` (Fehlertext aus API-Response
parsen). Ersetzt den bisherigen manuellen Kompilierungsschritt.

Erzeugt vollständigen `.tex`-Inhalt:

| LaTeX | PWA-Quelle |
|---|---|
| `\DefData{Figur}` | `character.name` |
| `\DefData{Spieler}` | `character.player` |
| `\DefData{Typ}` | `rules.types.find(t ⇒ t.id === c.typeId)?.name` |
| `\DefData{Grad}` | `computeGrad(c.totalEs)` |
| `\DefData{St/Gs/Gw/Ko/In/Zt/Au/pA/Wk}` | `character.properties.*` |
| `\DefData{B}` | `{c.properties.B}{c.properties.B}` (Tupel) |
| `\DefData{Ausdauerbonus/Schadensbonus}` | `character.boni.AusB/SchB` |
| `\DefData{Angriffsbonus/Abwehrbonus}` | Tupel `{wert}{wert}` |
| `\DefData{ResistenzBonus}` | Tupel `{ResBg}{ResBk}` |
| `\DefData{Zauberbonus}` | `character.boni.ZauB` |
| `\DefData{LP/AP}` | `character.properties.LP/AP` |
| `\DefData{GG/SG}` | `character.personalia.gg/sg` |
| `\DefData{Alter/haendig/Groesse/…}` | `character.personalia.*` |
| `\DefData{Ruestung}` | aus Inventar (Gegenstände mit `saveAP`) |
| `\DefData{Raufen}` | `character.skills.find(s ⇒ s.skillId === 'Raufen')?.value ?? 6` |
| `\Fertigkeit1[]{}` | Nicht-Waffen-Fertigkeiten |
| `\Fertigkeit2[]{}` | Waffenfertigkeiten + Sprachen |
| `\Waffe1` | Inventar-Waffen (mit FW + Schaden + AB) |
| `\Zauber1/\Zauber2` | Gelernte Zauber (lookup in `rules.spells`) |
| `\Output{Figurenblatt}` | immer |
| `\Output{Abenteuerblatt}` | immer |
| `\Output{Zauberblatt}` | nur wenn `isCaster` |

### 3. UI-Ergänzungen

- `src/constants/ui.ts`: +2 Strings
  - `sheetExportLatex: 'Als LaTeX exportieren'`
  - `sheetExportLatexPdf: 'Als PDF (LaTeX) exportieren'`
- `CharacterView.vue`: Zwei Buttons (oder einer mit Split-Button / Menü)
  1. **„Als LaTeX exportieren"** — lädt `.tex` herunter (wie bisher geplant)
  2. **„Als PDF (LaTeX) exportieren"** — ruft `compileToPdf()` auf, speichert das
     resultierende PDF via `showSaveFilePicker` (`<sanitized_name>.pdf`)
     - Button deaktiviert wenn `navigator.onLine === false`
     - Optional: Lade-Indikator während API-Call

### 4. Dokumentation

- `tools/LaTeX/README.md`: Hinweis wie kompiliert wird
- `AGENTS.md`: kurzer Hinweis auf das Feature

## Betroffene Dateien

| Datei | Status |
|---|---|
| `tools/LaTeX/m5figur-mv.cls` | **NEU** (download) |
| `tools/LaTeX/PLAN.md` | diese Datei |
| `src/services/LatexExportService.ts` | **NEU** |
| `src/constants/ui.ts` | +2 Strings |
| `src/views/CharacterView.vue` | 2 Buttons + Handler |

## Nicht abgedeckt (Phase 2)

- EP-Verlauf (Datum01–20)
- Magische Gegenstände (`\Magisch`)
- Sinneswerte (Sehen, Hören, Riechen, Nachtsicht, 6. Sinn)
- Mehrere Charaktere in einer `.tex`
- Automatische Berechnung von EW aus FW + Leiteigenschaft
  (die `m5figur-mv.cls` kann das — wir liefern nur FW + `\Fertig`-Referenzen)
