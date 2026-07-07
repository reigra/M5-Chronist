# Google Drive Anbindung — Implementierung & Anleitung

## 1. Überblick

Die MagusNG-PWA soll JSON-Dateien (Charaktere **und** Regelwerke) nicht nur aus dem lokalen Dateisystem (File System Access API) laden/exportieren können, sondern auch **aus Google Drive**. Der gesamte OAuth-Flow läuft clientseitig — kein Backend nötig.

### Anwendungsfälle

| Von/ Nach | Charakter (.json) | Regelwerk (.json) |
|---|---|---|
| **Lokales Dateisystem** | ✅ Bestehend (`CharacterStorage`) | ✅ Bestehend (`RulesStorage.importFiles()`) |
| **Google Drive → App** | ✅ Neu: Import aus Drive | ✅ Neu: Import aus Drive |
| **App → Google Drive** | ✅ Neu: Export nach Drive | ✅ Neu: Export nach Drive |

### Architektur

```
FileProvider (Interface)
  ├── LocalFileProvider (FS Access API, bestehend)
  └── GoogleDriveProvider (Google Picker + Drive API v3, neu)

CharacterStorage (bestehend)
  └── nutzt FileProvider für Import/Export

RulesStorage (bestehend)
  └── nutzt FileProvider für Import/Export
```

**Google Picker API** wird für den **Import** verwendet (Datei-Auswahl-Dialog), die **Drive API v3** (REST) für den **Export** (Upload), weil der Picker keinen Upload-Support hat.

---

## 2. Google Cloud App-Registrierung (einmalig durch Entwickler)

### Schritt 1: Projekt erstellen

1. Gehe zu https://console.cloud.google.com/
2. Klicke oben auf Projekt auswählen → **Neues Projekt**
3. Projektname: `MagusNG` (oder beliebig)
4. Klicke **Erstellen**

### Schritt 2: Google Drive API aktivieren

1. Gehe zu https://console.cloud.google.com/apis/library/drive.googleapis.com
2. Klicke **Aktivieren**

### Schritt 3: OAuth-Consent-Screen konfigurieren

1. Gehe zu https://console.cloud.google.com/apis/credentials/consent
2. User Type: **Extern** (für PWA mit mehreren Nutzern)
3. **App-Informationen:**
   - App-Name: `MagusNG`
   - User-Support-E-Mail: (deine E-Mail)
   - Developer-Contact-E-Mail: (deine E-Mail)
4. **Scopes:**
   - Klicke `Scope hinzufügen`
   - Wähle: `.../auth/drive.file` (Zugriff nur auf Dateien, die der Nutzer über die App auswählt/erstellt — für Import und Export)
   - Klicke **Aktualisieren**
5. **Testnutzer:**
   - Füge deine eigene E-Mail hinzu (während der Entwicklung)
   - Später (für Produktion) → **Veröffentlichen** → "In Produktion"

### Schritt 4: API-Key erstellen

1. Gehe zu https://console.cloud.google.com/apis/credentials
2. Klicke **Anmeldedaten erstellen** → **API-Schlüssel**
3. Optional: **Schlüssel einschränken** (empfohlen):
   - **HTTP-Referrer**: `https://*.gitlab.io/*` (für prod) und `http://localhost:*` (für dev)
   - **API**: Google Drive API
4. API-Key kopieren (z.B. `AIzaSy...`)

### Schritt 5: OAuth-2.0-Client-ID erstellen

1. Gehe zu https://console.cloud.google.com/apis/credentials
2. Klicke **Anmeldedaten erstellen** → **OAuth-Client-ID**
3. Anwendungstyp: **Webanwendung**
4. Name: `MagusNG PWA`
5. **Authorized JavaScript Origins:**
   - `http://localhost:5173` (Vite dev)
   - `https://deine-gruppe.gitlab.io` (GitLab Pages prod)
6. **Authorized Redirect URIs:**
   - `http://localhost:5173` (Vite dev)
   - `https://deine-gruppe.gitlab.io` (GitLab Pages prod)
   - (Kein spezifischer Pfad nötig — Google Picker verwendet Popup)
7. Client-ID kopieren (z.B. `123456.apps.googleusercontent.com`)

### Schritt 6: Als Vite-Env-Variablen ins Projekt

`.env` (wird in `.gitignore` — nicht einchecken):

```
VITE_GOOGLE_API_KEY=AIzaSy...
VITE_GOOGLE_CLIENT_ID=123456.apps.googleusercontent.com
VITE_GOOGLE_APP_ID=123456  (die numerische Projekt-ID aus GCP)
```

`.env.example` (wird eingecheckt — als Vorlage):

```
VITE_GOOGLE_API_KEY=
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_APP_ID=
```

Diese Variablen müssen auch in den GitLab-CI-Variablen hinterlegt werden (Settings → CI/CD → Variables), damit der Build sie injizieren kann.

---

## 3. Implementierungsplan

### 3.1 Dateien (neu & geändert)

| Datei | Status | Beschreibung |
|---|---|---|
| `src/services/FileProvider.ts` | **Neu** | Interface + `LocalFileProvider` + `GoogleDriveProvider` |
| `src/vite-env.d.ts` | Geändert | `ImportMetaEnv` um `VITE_GOOGLE_*` ergänzt |
| `.env.example` | **Neu** | Vorlage für Google-Env-Vars |
| `.gitlab-ci.yml` | Geändert | `variables:`-Block mit `VITE_GOOGLE_*` |
| `src/constants/ui.ts` | Geändert | 7 neue Drive-UI-Strings |
| `src/services/CharacterStorage.ts` | Geändert | Neue Methoden `readFromDrive()` / `importFromDrive()` / `exportToDrive()` / `remove()` |
| `src/services/RulesStorage.ts` | Geändert | Neue Methoden `importFromDrive()` / `exportToDrive()` |
| `src/views/HomeView.vue` | Geändert | Button für Google Drive Charakter-Import (mit Diff/Overwrite-Dialog) |
| `src/views/CharacterView.vue` | Geändert | Button für Export nach Google Drive |
| `src/views/RulesView.vue` | Geändert | Buttons für Import/Export von Regelwerken via Google Drive |

### 3.2 Interface `FileProvider`

**`src/services/FileProvider.ts`:**

Das Interface ist **generisch** — es verarbeitet JSON-Daten als `unknown`. Der Aufrufer (CharacterStorage / RulesStorage) kümmert sich um Typisierung und Migration.

```typescript
export interface FileProvider {
  readonly name: string

  /** Ein JSON-Objekt aus einer Datei lesen. */
  readFile(nameHint?: string): Promise<{ data: unknown; fileName: string }>

  /** Ein JSON-Objekt in eine Datei schreiben. */
  writeFile(data: unknown, suggestedName: string): Promise<void>

  /** Prüfen, ob dieser Provider im aktuellen Browser verfügbar ist. */
  isAvailable(): boolean
}
```

- `readFile` gibt `data` (geparstes JSON) + `fileName` zurück — der Aufrufer ruft dann z.B. `CharacterStorage.migrate(data)` oder prüft `data.metadata?.id`
- `writeFile` bekommt ein beliebiges JSON-serialisierbares Objekt + Namensvorschlag

### 3.3 `LocalFileProvider`

Kapselt die bestehende FS Access API Logik aus `CharacterStorage` + `RulesStorage`:

```typescript
export class LocalFileProvider implements FileProvider {
  readonly name = 'Lokales Dateisystem'

  async readFile(): Promise<{ data: unknown; fileName: string }> {
    if (!('showOpenFilePicker' in window)) throw new Error(...)
    const [handle] = await (window as any).showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    })
    const file = await handle.getFile()
    const text = await file.text()
    return { data: JSON.parse(text), fileName: file.name }
  }

  async writeFile(data: unknown, suggestedName: string): Promise<void> {
    if (!('showSaveFilePicker' in window)) throw new Error(...)
    const handle = await (window as any).showSaveFilePicker({
      suggestedName,
      types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }],
    })
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()
  }

  isAvailable(): boolean {
    return 'showOpenFilePicker' in window
  }
}
```

### 3.4 `GoogleDriveProvider`

**Entscheidungen (2016-06-17):**
- **Einfache Variante**: Token nur in Memory (kein IndexedDB-Caching) — später erweiterbar
- **Sicherer Download**: Drive API v3 `files.get?alt=media` statt Picker-`downloadUrl`
- **Kein Provider-Switching**: Services bekommen separate Drive-Methoden, die intern `GoogleDriveProvider` erzeugen
- **Inline-Typ-Stubs**: Google API Typen werden lokal in `FileProvider.ts` deklariert (keine extra Packages)
- **loadScript** als private Helper-Funktion in `FileProvider.ts`
- **Folderscoped Picker**: Picker wird auf den jeweiligen Unterordner (`MagusNG/characters` oder `MagusNG/rules`) eingeschränkt — via `DocsView().setParent(folderId)`
- **Exporte landen im richtigen Unterordner**: Upload-Metadaten enthalten `parents: [folderId]` für `characters` bzw. `rules`
- **Konstruktor-Parameter**: `new GoogleDriveProvider('characters')` oder `new GoogleDriveProvider('rules')` — der Provider verwaltet selbst die Ordner-Hierarchie

**Ablauf (Import):**

1. Access Token holen (OAuth 2.0 via `google.accounts.oauth2`)
2. Google Identity Services API laden (`<script src="https://accounts.google.com/gsi/client">` — einmalig)
3. Google Picker API laden (`<script src="https://apis.google.com/js/api.js">` — einmalig)
4. `ensureFolderTree()` legt `MagusNG/characters` (bzw. `MagusNG/rules`) an, falls nicht vorhanden
5. `new google.picker.PickerBuilder()` mit `DocsView().setParent(folderId)` öffnet Datei-Dialog (auf Ordner beschränkt)
6. Nutzer wählt Datei → Callback erhält `{ action: 'picked', docs: [{ id, name }] }`
7. `GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media` → JSON parsen → zurückgeben

**Ablauf (Export):**

1. Access Token holen (gleicher OAuth-Client)
2. `ensureFolderTree()` legt den Zielordner an, falls nicht vorhanden
3. Drive API v3: `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`
4. Metadaten (`name`, `parents: [folderId]`) + Datei-Inhalt als `multipart/form-data` senden

**Implementierung:**

```typescript
// ── Google API type stubs (no extra packages needed) ─────────────────────────
declare global {
  var google: {
    accounts: {
      oauth2: {
        initTokenClient(config: {
          client_id: string
          scope: string
          callback: (response: { access_token?: string; error?: string }) => void
        }): { requestAccessToken(): void }
      }
    }
    picker: {
      PickerBuilder: new () => {
        setAppId(id: string): any
        setOAuthToken(token: string): any
        addView(view: any): any
        setCallback(fn: (data: any) => void): any
        build(): { setVisible(v: boolean): void }
      }
      DocsView: new () => { setParent(id: string): any; setIncludeSubFolders(b: boolean): any }
      Action: { PICKED: string }
    }
  }
  var gapi: {
    load(api: string, params: { callback: () => void }): void
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = src
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.head.appendChild(el)
  })
}

export function formatDate(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_')
}

export class GoogleDriveProvider implements FileProvider {
  readonly name = 'Google Drive'
  private accessToken: string | null = null
  private pickerApiLoaded = false
  private gisApiLoaded = false
  private folderId: string | null = null

  constructor(private folder: 'characters' | 'rules') {}

  async readFile(): Promise<{ data: unknown; fileName: string }> {
    const token = await this.ensureAccessToken()
    await this.ensureFolderTree(token)
    const doc = await this.openPicker(token)
    const json = await this.downloadFile(doc.id, token)
    return { data: JSON.parse(json), fileName: doc.name }
  }

  async writeFile(data: unknown, suggestedName: string): Promise<void> {
    const token = await this.ensureAccessToken()
    await this.ensureFolderTree(token)
    const metadata = { name: suggestedName, mimeType: 'application/json', parents: [this.folderId!] }
    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
    form.append('file', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) throw new Error('Google Drive upload failed')
  }

  isAvailable(): boolean {
    return !!import.meta.env.VITE_GOOGLE_CLIENT_ID
  }

  private async ensureAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken
    await this.loadGisApi()

    return new Promise((resolve, reject) => {
      google.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (res) => {
          if (res.error) { reject(new Error(res.error)); return }
          this.accessToken = res.access_token!
          resolve(res.access_token!)
        },
      }).requestAccessToken()
    })
  }

  private async ensureFolderTree(token: string): Promise<void> {
    if (this.folderId) return

    const rootId = await this.findOrCreateFolder(token, null, 'MagusNG')
    this.folderId = await this.findOrCreateFolder(token, rootId, this.folder)
  }

  private async findOrCreateFolder(token: string, parentId: string | null, name: string): Promise<string> {
    const query = parentId
      ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
      : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`

    const search = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await search.json()
    if (result.files?.length > 0) return result.files[0].id

    const body: any = { name, mimeType: 'application/vnd.google-apps.folder' }
    if (parentId) body.parents = [parentId]
    const create = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const folder = await create.json()
    return folder.id
  }

  private async openPicker(token: string): Promise<{ id: string; name: string }> {
    await this.loadPickerApi()
    return new Promise((resolve) => {
      const view = new google.picker.DocsView().setParent(this.folderId!)
      const picker = new google.picker.PickerBuilder()
        .setAppId(import.meta.env.VITE_GOOGLE_APP_ID as string)
        .setOAuthToken(token)
        .addView(view)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const doc = data.docs[0]
            resolve({ id: doc.id, name: doc.name })
          }
        })
        .build()
      picker.setVisible(true)
    })
  }

  private async loadPickerApi(): Promise<void> {
    if (this.pickerApiLoaded) return
    await loadScript('https://apis.google.com/js/api.js')
    await new Promise<void>((resolve) => gapi.load('picker', { callback: () => resolve() }))
    this.pickerApiLoaded = true
  }

  private async loadGisApi(): Promise<void> {
    if (this.gisApiLoaded) return
    await loadScript('https://accounts.google.com/gsi/client')
    this.gisApiLoaded = true
  }

  private async downloadFile(fileId: string, token: string): Promise<string> {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) throw new Error('Failed to download file from Google Drive')
    return res.text()
  }
}
```

**Bekannte Fehler/Probleme während der Implementierung:**

| Problem | Lösung |
|---|---|
| `gapi.setApiKey()` nicht Teil der modernen Picker-API | Entfernt; API-Key wird via HTTP-Referrer-Einschränkung in der Cloud Console geschützt |
| `google.picker.DocsView().setIncludeSubFolders()` existiert nicht | Entfernt; Picker zeigt nur Dateien direkt im Elternordner |
| `google.picker.ViewId.DOCS` zeigt *alle* Drive-Dateien | Ersetzt durch `DocsView().setParent(folderId)` — Picker auf MagusNG-Unterordner beschränkt |
| Google Identity Services (`google.accounts.oauth2`) benötigt eigenes Script | `loadGisApi()` lädt `https://accounts.google.com/gsi/client` vor dem OAuth-Flow |
| Drive API v3 erwartet `parents` als `["folderId"]`, nicht `"folderId"` | Array-Syntax korrigiert |
| Dateien werden nicht überschrieben — Drive erlaubt Duplikate | Datumsstempel im Dateinamen zur Unterscheidung |
| `setIncludeSubFolders` existiert nicht auf `DocsView` | Entfernt; Picker beschränkt auf den direkten Elternordner |

> **Hinweis:** Für den Export (`writeFile`) nutzen wir die **Drive API v3** direkt (kein Picker), weil der Picker keinen Upload-Support hat. Der OAuth-Scope `drive.file` beschränkt den Zugriff auf Dateien, die mit der App erstellt/geöffnet wurden.

### 3.5 Token-Persistenz für Offline (später)

Der Access-Token läuft nach 1h ab. **In dieser Version**: einfaches In-Memory-Caching (Token lebt nur für die Session).

**Geplant für später**: Refresh-Token via `prompt: 'consent'` in IndexedDB speichern:

```typescript
private async ensureAccessToken(): Promise<string> {
  // 1. Check IndexedDB-Cache
  const cached = await this.loadToken()
  if (cached && cached.expiresAt > Date.now()) return cached.token

  // 2. Neuen Token holen (mit consent prompt für refresh_token)
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      prompt: 'consent',
      callback: async (res) => {
        if (res.error) { reject(new Error(res.error)); return }
        await this.saveToken(res.access_token!, res.expires_in!)
        resolve(res.access_token!)
      },
    })
    client.requestAccessToken()
  })
}
```

> **Achtung:** `prompt: 'consent'` zeigt den Consent-Screen *jedes Mal* — daher nur beim ersten Mal setzen.

### 3.6 Anbindung an `CharacterStorage`

Neue Methoden (bestehende `importFromFile()` / `exportToFile()` bleiben unverändert):

```typescript
import { GoogleDriveProvider, formatDate } from './FileProvider'

export class CharacterStorage {
  /** Charakter aus Google Drive lesen (ohne zu speichern — für den Diff-Vergleich). */
  async readFromDrive(): Promise<{ data: unknown; fileName: string }> {
    const provider = new GoogleDriveProvider('characters')
    return provider.readFile()
  }

  /** Charakter aus Google Drive importieren (lesen + migrieren + speichern). */
  async importFromDrive(): Promise<Character> {
    const { data } = await this.readFromDrive()
    const character = this.migrate(data)
    await this.save(character)
    return character
  }

  /** Charakter nach Google Drive exportieren. */
  async exportToDrive(character: Character): Promise<void> {
    const provider = new GoogleDriveProvider('characters')
    const name = `${sanitizeFileName(character.name)}_${formatDate()}.json`
    await provider.writeFile(character, name)
  }

  /** Charakter aus IndexedDB löschen. */
  async remove(id: string): Promise<void> {
    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror    = () => { db.close(); reject(tx.error) }
    })
  }
}
```

### 3.7 Anbindung an `RulesStorage`

Neue Methoden (bestehende `importFiles()` bleibt unverändert):

```typescript
import { GoogleDriveProvider, formatDate, sanitizeFileName } from './FileProvider'

export class RulesStorage {
  /** Regelwerk aus Google Drive importieren (einzelne Datei). */
  async importFromDrive(): Promise<SourceSummary> {
    const provider = new GoogleDriveProvider('rules')
    const { data, fileName } = await provider.readFile()
    const rulebook = data as RulebookData

    if (!rulebook.metadata?.id || !rulebook.metadata?.title) {
      throw new Error(`"${fileName}" is not a valid rules file — missing metadata.id or metadata.title.`)
    }

    this.normalizeIds(rulebook)

    const entry: StoredSource = {
      id:        rulebook.metadata.id,
      title:     rulebook.metadata.title,
      version:   rulebook.metadata.version ?? '?',
      priority:  await this.nextFreePriority(rulebook.metadata.priority ?? 999),
      enabled:   true,
      data:      rulebook,
    }

    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(entry)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror    = () => { db.close(); reject(tx.error) }
    })

    return { id: entry.id, title: entry.title, version: entry.version, priority: entry.priority, enabled: true }
  }

  /** Regelwerk nach Google Drive exportieren (einzelne Quelle). */
  async exportToDrive(sourceId: string): Promise<void> {
    const db = await this.open()
    const entry = await new Promise<StoredSource | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(sourceId)
      req.onsuccess = () => { db.close(); resolve(req.result) }
      req.onerror   = () => { db.close(); reject(req.error) }
    })

    if (!entry) throw new Error(`Source "${sourceId}" not found.`)

    const provider = new GoogleDriveProvider('rules')
    const name = `${entry.id}_${entry.version}_${formatDate()}.json`
    await provider.writeFile(entry.data, name)
  }
}
```

### 3.8 UI-Strings (`src/constants/ui.ts`)

```typescript
// Google Drive (Datei-Import/Export)
importGoogleDrive:      'Aus Google Drive importieren',
exportGoogleDrive:      'Nach Google Drive exportieren',
driveImportRules:       'Regelwerk aus Google Drive importieren',
driveExportRules:       'Regelwerk nach Google Drive exportieren',
driveExportRulesHint:   'Nur aktivierte Quellen können exportiert werden.',
driveUploadSuccess:     'Erfolgreich nach Google Drive hochgeladen.',
driveErrorPrefix:       'Google Drive Fehler:',
```

### 3.9 UI-Änderungen

**HomeView** — Import-Button mit Diff/Overwrite-Flow + Delete-Button:

```html
<button class="btn-nav" @click="importCharacterFromDrive">
  {{ UI.importGoogleDrive }}
</button>

<!-- Pro Charakter-Zeile: Löschen + Import aus Drive -->
<button class="btn btn-remove" @click="removeCharacter(character.id)">
  {{ UI.remove }}
</button>
```

Der Import-Drive-Dialog zeigt bei existierendem Charakter (gleiche `id`) eine Diff-Ansicht und fragt nach Bestätigung zum Überschreiben.

**CharacterView** — Export-Button für Google Drive:

```html
<button class="btn-nav" @click="exportToDrive">
  {{ UI.exportGoogleDrive }}
</button>
```

**RulesView** — Zwei Buttons, einer für Import, einer pro Quelle für Export:

```html
<!-- Im Header (neben rulesImportBtn) -->
<button class="btn-nav" @click="importRuleFromDrive">
  {{ UI.driveImportRules }}
</button>

<!-- Pro Quellen-Zeile (neben remove/priority-Buttons) -->
<button
  v-if="source.enabled"
  class="btn-icon"
  @click="exportRuleToDrive(source.id)"
  :title="UI.driveExportRules"
>☁</button>
```

---

## 4. Anleitung für Nutzer

### 4.1 Voraussetzungen

- **Google-Konto** (für Google Drive Zugriff)
- **Chromium-basierter Browser** (Chrome, Edge, Opera) — Firefox/Safari werden nicht unterstützt

### 4.2 Ordnerstruktur in Google Drive

MagusNG legt bei der ersten Nutzung folgende Ordnerstruktur in deinem Google Drive an:

```
MagusNG/
  ├── characters/   ← Charakter-Exporte & -Importe
  └── rules/        ← Regelwerk-Exporte & -Importe
```

- Der Picker-Importdialog ist auf den jeweiligen Unterordner beschränkt
- Exporte landen automatisch im richtigen Unterordner

### 4.3 Erste Einrichtung

1. Öffne MagusNG in Chrome/Edge
2. Klicke auf **"Aus Google Drive importieren"** (Startseite oder Charakterbogen)
3. Ein Google-Popup öffnet sich:
   - Melde dich mit deinem Google-Konto an (falls nicht bereits geschehen)
   - Klicke auf **"Zulassen"** — MagusNG darf dann auf deine Google-Drive-Dateien zugreifen
   - **Hinweis:** MagusNG kann nur Dateien sehen/laden, die du über die App auswählst (Scope: `drive.file`)
4. Der Google Drive Datei-Dialog öffnet sich (gefiltert auf den `MagusNG/characters`-Ordner) — wähle eine `.json`-Charakterdatei aus
5. Der Charakter wird geladen und in der lokalen IndexedDB gespeichert

### 4.4 Regelwerk aus Google Drive importieren

1. Öffne die **Regeln-Seite** (Zahnrad-Icon)
2. Klicke auf **"Regelwerk aus Google Drive importieren"**
3. Ein Google-Popup öffnet sich (Zustimmung erforderlich)
4. Wähle die `.json`-Regelwerkdatei in Google Drive aus (Picker zeigt nur Dateien im `MagusNG/rules`-Ordner)
5. Das Regelwerk wird importiert und in der Liste angezeigt
6. **Hinweis:** Die Datei muss ein valides MagusNG-Regelwerk sein (`metadata.id` und `metadata.title`)

### 4.5 Regelwerk nach Google Drive exportieren

1. Öffne die **Regeln-Seite**
2. Klicke neben einer aktivierten Quelle auf das **☁-Icon**
3. Die Datei wird als `<sourceId>_<version>_<YYYY-MM-DD>.json` in `MagusNG/rules/` gespeichert
4. Verwende diesen Export z.B. zum Teilen mit anderen oder als Backup

### 4.6 Charakter nach Google Drive exportieren

1. Öffne den Charakterbogen des gewünschten Charakters
2. Klicke auf **"Nach Google Drive exportieren"**
3. Die Datei wird als `<Charaktername>_<YYYY-MM-DD>.json` in `MagusNG/characters/` gespeichert

### 4.7 Offline-Zugriff

- Nach einmaliger Autorisierung bleibt der Zugriff für ca. 1 Stunde gültig
- Für dauerhaften Offline-Zugriff: Installiere MagusNG als PWA (Browser-Menü → "App installieren")
- Nach erneuter Autorisierung (ca. alle 6 Monate) bleibt der Zugriff bestehen

### 4.8 Zugriff widerrufen

1. Gehe zu https://myaccount.google.com/permissions
2. Suche "MagusNG" in der Liste der verbundenen Apps
3. Klicke auf den Eintrag → **"Zugriff entfernen"**
4. Bestätige — MagusNG kann nicht mehr auf dein Google Drive zugreifen

---

## 5. Sicherheitshinweise

| Aspekt | Massnahme |
|---|---|
| **Client-ID** | Ist öffentlich (im JS sichtbar) — das ist normal für Browser-Apps. Durch HTTP-Referrer-Einschränkung wird Missbrauch verhindert. |
| **API-Key** | Auf HTTP-Referrer eingeschränkt, sodass nur die PWA-Domain ihn verwenden kann. |
| **Zugriffsrechte** | `drive.file` Scope — die App sieht nur Dateien, die der Nutzer explizit über den Picker auswählt, nicht das gesamte Drive. |
| **Tokens** | Werden in IndexedDB gespeichert (nicht in `localStorage` — etwas sicherer vor XSS). |
| **Daten** | Alle Charakterdaten werden clientseitig verarbeitet — kein Server, keine Datenübertragung ausser zu Google Drive. |

---

## 6. GitLab CI Integration

Die Environment-Variablen müssen in GitLab CI verfügbar sein:

```yaml
# .gitlab-ci.yml (Auszug)
pages:
  script:
    - npm ci
    - npm run build
  variables:
    VITE_GOOGLE_API_KEY: $VITE_GOOGLE_API_KEY
    VITE_GOOGLE_CLIENT_ID: $VITE_GOOGLE_CLIENT_ID
    VITE_GOOGLE_APP_ID: $VITE_GOOGLE_APP_ID
  artifacts:
    paths:
      - public
```

Im GitLab-Repo unter **Settings → CI/CD → Variables** folgende Variablen anlegen:

| Variable | Wert |
|---|---|
| `VITE_GOOGLE_API_KEY` | `AIzaSy...` |
| `VITE_GOOGLE_CLIENT_ID` | `123456.apps.googleusercontent.com` |
| `VITE_GOOGLE_APP_ID` | `123456...` |
