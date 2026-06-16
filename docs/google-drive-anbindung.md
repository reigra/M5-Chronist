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
| `src/constants/ui.ts` | Geändert | Neue UI-Strings |
| `src/services/CharacterStorage.ts` | Geändert | Nutzt `FileProvider` für Import/Export |
| `src/services/RulesStorage.ts` | Geändert | Nutzt `FileProvider` für Import/Export |
| `src/views/HomeView.vue` | Geändert | Button für Google Drive Charakter-Import |
| `src/views/CharacterSheetView.vue` | Geändert | Button für Export nach Google Drive |
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

**Ablauf (Import):**

1. Access Token holen (OAuth 2.0 via `google.accounts.oauth2`)
2. Google Picker API laden (`<script src="https://apis.google.com/js/api.js">` — einmalig)
3. `new google.picker.PickerBuilder()` öffnet Datei-Dialog
4. Nutzer wählt Datei → Callback erhält `{ action: 'picked', docs: [{ id, name, downloadUrl }] }`
5. `downloadUrl` fetchen → JSON parsen → zurückgeben

**Ablauf (Export):**

1. Access Token holen (gleicher OAuth-Client)
2. Drive API v3: `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`
3. Metadaten (`name`) + Datei-Inhalt als `multipart/form-data` senden

**Implementierung:**

```typescript
export class GoogleDriveProvider implements FileProvider {
  readonly name = 'Google Drive'
  private accessToken: string | null = null
  private pickerApiLoaded = false

  async readFile(): Promise<{ data: unknown; fileName: string }> {
    const token = await this.ensureAccessToken()
    const doc = await this.openPicker(token)
    const json = await this.fetchFile(doc.downloadUrl, token)
    return { data: JSON.parse(json), fileName: doc.name }
  }

  async writeFile(data: unknown, suggestedName: string): Promise<void> {
    const token = await this.ensureAccessToken()
    const metadata = { name: suggestedName, mimeType: 'application/json' }
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

    return new Promise((resolve, reject) => {
      google.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (res) => {
          if (res.error) { reject(new Error(res.error)); return }
          this.accessToken = res.access_token
          resolve(res.access_token!)
        },
      }).requestAccessToken()
    })
  }

  private async openPicker(token: string): Promise<{ id: string; name: string; downloadUrl: string }> {
    await this.loadPickerApi()
    return new Promise((resolve) => {
      const picker = new google.picker.PickerBuilder()
        .setAppId(import.meta.env.VITE_GOOGLE_APP_ID)
        .setOAuthToken(token)
        .addView(google.picker.ViewId.DOCS)
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) {
            const doc = data.docs[0]
            resolve({ id: doc.id, name: doc.name, downloadUrl: doc.downloadUrl })
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

  private async fetchFile(url: string, token: string): Promise<string> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error('Failed to download file from Google Drive')
    return res.text()
  }
}
```

> **Option: MagusNG-Ordner für Exporte**
>
> Standardmäßig landen exportierte Dateien im Google Drive **Stammverzeichnis**. Alternativ kann ein `MagusNG`-Ordner (folder) angelegt und als Ziel verwendet werden:
>
> 1. Vor dem Upload prüfen: `GET https://www.googleapis.com/drive/v3/files?q=name='MagusNG' and mimeType='application/vnd.google-apps.folder' and trashed=false`
> 2. Falls nicht gefunden: Ordner anlegen via `POST https://www.googleapis.com/drive/v3/files` mit `{ name: 'MagusNG', mimeType: 'application/vnd.google-apps.folder' }` → `folderId` merken
> 3. Upload-Metadaten um `parents: [folderId]` ergänzen
>
> Vorteil: Alle Exporte liegen an einem Ort, auch nach mehrfachem Export. Nachteil: Zusätzlicher API-Call vor jedem Upload.

> **Hinweis:** Für den Export (`writeFile`) nutzen wir die **Drive API v3** direkt (kein Picker), weil der Picker keinen Upload-Support hat. Der OAuth-Scope `drive.file` beschränkt den Zugriff auf Dateien, die mit der App erstellt/geöffnet wurden.

### 3.5 Token-Persistenz für Offline

Der Access-Token läuft nach 1h ab. Für längerfristigen Zugriff (und Offline-Fähigkeit) kann ein **Refresh-Token** via `prompt: 'consent'` angefordert und in IndexedDB gespeichert werden:

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
      prompt: 'consent',  // ← force refresh_token
      callback: async (res) => {
        if (res.error) { reject(new Error(res.error)); return }
        // Token + expires_in in IndexedDB speichern
        await this.saveToken(res.access_token!, res.expires_in!)
        resolve(res.access_token!)
      },
    })
    client.requestAccessToken()
  })
}
```

> **Achtung:** `prompt: 'consent'` zeigt den Consent-Screen *jedes Mal* — daher sollte er nur beim ersten Mal gesetzt werden. Für nachfolgende Aufrufe ohne `prompt` liefert Google nur einen Access-Token (ohne Refresh), der 1h gültig ist.

### 3.6 Anbindung an `CharacterStorage`

```typescript
export class CharacterStorage {
  private provider: FileProvider = new LocalFileProvider()

  setProvider(provider: FileProvider): void {
    this.provider = provider
  }

  async importFromFile(): Promise<Character> {
    const { data } = await this.provider.readFile()
    const character = this.migrate(data)
    await this.save(character)
    return character
  }

  async exportToFile(character: Character): Promise<void> {
    await this.provider.writeFile(character, `${character.name}.json`)
  }
}
```

### 3.7 Anbindung an `RulesStorage`

Sowohl Import als auch Export von Regelwerken sind neu. `RulesStorage` bekommt zwei neue Methoden:

```typescript
export class RulesStorage {
  private provider: FileProvider = new LocalFileProvider()

  setProvider(provider: FileProvider): void {
    this.provider = provider
  }

  /** Regelwerk aus Google Drive importieren (einzelne Datei). */
  async importFromDrive(): Promise<SourceSummary> {
    const { data, fileName } = await this.provider.readFile()
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

    // Exportiert das Regelwerk als valides RulebookData-JSON
    await this.provider.writeFile(entry.data, `${entry.id}.json`)
  }
}
```

### 3.8 UI-Strings (`src/constants/ui.ts`)

```typescript
// Google Drive (Datei-Import/Export)
importGoogleDrive:       'Aus Google Drive importieren',
exportGoogleDrive:       'Nach Google Drive exportieren',
drivePickerTitle:        'Datei aus Google Drive auswählen',
driveUploadSuccess:      'Erfolgreich nach Google Drive hochgeladen.',
driveError:              'Google Drive Fehler:',
driveImportRules:        'Regelwerk aus Google Drive importieren',
driveExportRules:        'Regelwerk nach Google Drive exportieren',
driveExportRulesHint:    'Nur aktivierte Quellen können exportiert werden.',
```

### 3.9 UI-Änderungen

**HomeView** — Button für Charakter-Import aus Google Drive:

```html
<button class="btn-nav" @click="importCharacterFromDrive">
  {{ UI.importGoogleDrive }}
</button>
```

**CharacterSheetView** — Export-Button für Google Drive:

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

### 4.2 Erste Einrichtung

1. Öffne MagusNG in Chrome/Edge
2. Klicke auf **"Aus Google Drive importieren"** (Startseite oder Charakterbogen)
3. Ein Google-Popup öffnet sich:
   - Melde dich mit deinem Google-Konto an (falls nicht bereits geschehen)
   - Klicke auf **"Zulassen"** — MagusNG darf dann auf deine Google-Drive-Dateien zugreifen
   - **Hinweis:** MagusNG kann nur Dateien sehen/laden, die du über die App auswählst (Scope: `drive.file`)
4. Der Google Drive Datei-Dialog öffnet sich — wähle eine `.json`-Charakterdatei aus
5. Der Charakter wird geladen und in der lokalen IndexedDB gespeichert

### 4.3 Regelwerk aus Google Drive importieren

1. Öffne die **Regeln-Seite** (Zahnrad-Icon)
2. Klicke auf **"Regelwerk aus Google Drive importieren"**
3. Ein Google-Popup öffnet sich (Zustimmung erforderlich)
4. Wähle die `.json`-Regelwerkdatei in Google Drive aus
5. Das Regelwerk wird importiert und in der Liste angezeigt
6. **Hinweis:** Die Datei muss ein valides MagusNG-Regelwerk sein (`metadata.id` und `metadata.title`)

### 4.4 Regelwerk nach Google Drive exportieren

1. Öffne die **Regeln-Seite**
2. Klicke neben einer aktivierten Quelle auf das **☁-Icon**
3. Die Datei wird als `<sourceId>.json` in dein Google Drive gespeichert
4. Verwende diesen Export z.B. zum Teilen mit anderen oder als Backup

### 4.5 Charakter nach Google Drive exportieren

1. Öffne den Charakterbogen des gewünschten Charakters
2. Klicke auf **"Nach Google Drive exportieren"**
3. Die Datei wird als `<Charaktername>.json` in deinem Google Drive gespeichert

### 4.6 Offline-Zugriff

- Nach einmaliger Autorisierung bleibt der Zugriff für ca. 1 Stunde gültig
- Für dauerhaften Offline-Zugriff: Installiere MagusNG als PWA (Browser-Menü → "App installieren")
- Nach erneuter Autorisierung (ca. alle 6 Monate) bleibt der Zugriff bestehen

### 4.7 Zugriff widerrufen

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
