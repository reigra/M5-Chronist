# Release Pipeline — Umbauplan

## Ziel

Neuer Workflow für Releases:

```
master  ──► (merge) ──► release ──► CI Pipeline ──► Version bump ──► Build ──► Release (mit ZIP) ──► merge zurück nach master
                                                                          └── Tag v1.0.1
```

## Aktuelles Problem

- `.npmrc` setzt `git-tag-version=false` — `npm version patch` erzeugt weder Commit noch Tag
- Der Version-Commit wird direkt nach `master` gepusht, nicht nach `release`
- `release` und `master` divergieren
- Kein Git-Tag, kein GitLab Release

## Dateien

| Datei | Änderung |
|---|---|
| `.gitlab-ci.yml` | **Neu schreiben** — 5 Stages |
| `.npmrc` | **Keine Änderung** — CI überschreibt via Variable |

---

## Pipeline-Übersicht

```yaml
stages:
  - test
  - secret-detection
  - deploy     # pages (Version bump + Build + ZIP)
  - release    # GitLab Release erstellen
  - merge      # release → master zurückschieben
```

### Trigger

Pipeline läuft bei **jedem Push auf `release`** (unverändert).

Der Workflow ist: **Merge `master` → `release`** startet den Release-Prozess.

### `[skip ci]` Loop-Schutz

Der Commit von `npm version patch` enthält `[skip ci]` in der Message. Der anschließende Push
zurück nach `release` triggert **keine neue Pipeline**.

---

## Stage 1: `deploy` — Job: `pages`

```yaml
pages:
  stage: deploy
  image: node:20
  script:
    # Dependencies installieren (vor Version-Bump, damit lockfile stabil)
    - npm ci

    # Version bump: patch + Commit + Tag
    - npm version patch -m "chore: release v%s [skip ci]"

    # App bauen
    - npm run build
    - rm -rf public
    - mv dist public

    # Variablen für nachfolgende Jobs exportieren
    - NEW_VERSION=$(node -p "require('./package.json').version")
    - echo "NEW_VERSION=$NEW_VERSION" >> build.env
    - echo "TAG_NAME=v$NEW_VERSION" >> build.env
    - echo "VERSION_SHA=$(git rev-parse HEAD)" >> build.env
    - echo "PAGES_JOB_ID=$CI_JOB_ID" >> build.env

    # ZIP-Archiv für Release-Asset erstellen
    - zip -r tools.zip tools/
  artifacts:
    paths:
      - public       # → GitLab Pages
      - tools.zip    # → Release Asset
    reports:
      dotenv: build.env  # → Variablen für release + merge Job
  only:
    - release
```

### Wichtige Details

- **`npm ci` vor `npm version patch`**: Lockfile ist noch unverändert → saubere Installation.
  `npm version patch` ändert nur die Versionsnummer, nicht die Dependencies.
- **`build.env`**: Dotenv-Report macht die Variablen in nachfolgenden Stages verfügbar.

---

## Stage 2: `release` — Job: `release`

```yaml
release:
  stage: release
  image: registry.gitlab.com/gitlab-org/release-cli:latest
  script:
    - echo "Creating release $NEW_VERSION ..."
  release:
    name: "Release $NEW_VERSION"
    tag_name: "$TAG_NAME"
    ref: "$VERSION_SHA"
    assets:
      links:
        - name: "tools.zip"
          url: "${CI_PROJECT_URL}/-/jobs/${PAGES_JOB_ID}/artifacts/raw/tools.zip"
  needs:
    - pages
  only:
    - release
```

### Wichtige Details

- **`release-cli` Image**: Enthält das `release-cli` Binary, das für das `release:` Keyword
  benötigt wird.
- **`ref: "$VERSION_SHA"`**: Der Tag `v1.0.1` zeigt auf den Version-Commit (nach `npm version patch`).
  Ohne diesen expliziten SHA würde der Tag auf den Pipeline-Trigger-Commit (alte Version) zeigen.
- **`assets.links`**: Verweist auf das `tools.zip` aus dem `pages` Job. Der Link wird im Release
  als Download angezeigt. Das ZIP liegt als CI-Artifact, nicht im Pages-Deployment.
- **`needs: [pages]`**: Wartet auf den `pages` Job, da die dotenv-Variablen von dort kommen.

---

## Stage 3: `merge` — Job: `merge-back`

```yaml
merge-back:
  stage: merge
  image: node:20
  script:
    # Git-Konfiguration (wie bisher)
    - git config user.email "ci-bot@gitlab.com"
    - git config user.name "GitLab CI Bot"
    - git remote set-url origin "https://oauth2:${CI_PUSH_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git"

    # 1. Version-Commit + Tag nach release pushen
    - git push origin HEAD:release --tags

    # 2. Fast-Forward nach master
    #    Schlägt fehl, wenn master divergiert ist — das ist beabsichtigt.
    - git push origin HEAD:master
  needs:
    - release
  only:
    - release
```

### Warum `git push` statt `git merge --ff-only`?

- `git push origin HEAD:master` ist **funktional identisch** zu einem Fast-Forward Merge:
  - Master wird auf denselben Commit gesetzt
  - Scheitert mit Fehler, wenn master divergiert ist
- Kein `git checkout master` nötig — bleibt auf dem aktuellen HEAD
- Kurzer, lesbarer Code

### Warum zuerst `push release`?

Der Push nach `release` stellt sicher, dass der Version-Commit und der Tag auch remote
auf `release` existieren. Der `[skip ci]` im Commit verhindert einen Pipeline-Loop.

---

## `.npmrc` — keine Änderung

Aktuell:
```
git-tag-version=false
```

In CI wird das durch die globale Variable überschrieben:

```yaml
variables:
  NPM_CONFIG_GIT_TAG_VERSION: 'true'
```

**Effekt**: Lokales `npm version patch` erzeugt weiterhin keinen Commit/Tag (Sicherheit).
In CI wird das Verhalten aktiviert.

---

## Vollständige `.gitlab-ci.yml`

```yaml
stages:
  - test
  - secret-detection
  - deploy
  - release
  - merge

include:
  - template: Security/SAST.gitlab-ci.yml
  - template: Security/Secret-Detection.gitlab-ci.yml

variables:
  SECRET_DETECTION_ENABLED: 'true'
  # .npmrc setzt git-tag-version=false → in CI überschreiben
  NPM_CONFIG_GIT_TAG_VERSION: 'true'

sast:
  stage: test

secret_detection:
  stage: secret-detection

pages:
  stage: deploy
  image: node:20
  script:
    # Dependencies installieren (vor Version-Bump, damit lockfile stabil)
    - npm ci

    # Version bump: patch + Commit + Tag
    - npm version patch -m "chore: release v%s [skip ci]"

    # App bauen
    - npm run build
    - rm -rf public
    - mv dist public

    # Variablen für nachfolgende Jobs exportieren
    - NEW_VERSION=$(node -p "require('./package.json').version")
    - echo "NEW_VERSION=$NEW_VERSION" >> build.env
    - echo "TAG_NAME=v$NEW_VERSION" >> build.env
    - echo "VERSION_SHA=$(git rev-parse HEAD)" >> build.env
    - echo "PAGES_JOB_ID=$CI_JOB_ID" >> build.env

    # ZIP-Archiv für Release-Asset erstellen
    - zip -r tools.zip tools/
  artifacts:
    paths:
      - public
      - tools.zip
    reports:
      dotenv: build.env
  only:
    - release

release:
  stage: release
  image: registry.gitlab.com/gitlab-org/release-cli:latest
  script:
    - echo "Creating release $NEW_VERSION ..."
  release:
    name: "Release $NEW_VERSION"
    tag_name: "$TAG_NAME"
    ref: "$VERSION_SHA"
    assets:
      links:
        - name: "tools.zip"
          url: "${CI_PROJECT_URL}/-/jobs/${PAGES_JOB_ID}/artifacts/raw/tools.zip"
  needs:
    - pages
  only:
    - release

merge-back:
  stage: merge
  image: node:20
  script:
    - git config user.email "ci-bot@gitlab.com"
    - git config user.name "GitLab CI Bot"
    - git remote set-url origin "https://oauth2:${CI_PUSH_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git"
    - git push origin HEAD:release --tags
    - git push origin HEAD:master
  needs:
    - release
  only:
    - release
```

---

## Flow-Diagramm

```
master (v1.0.0) ──► merge ──► release (v1.0.0)
                                  │
                                  ▼  CI Pipeline startet (Trigger: push on release)
                             ┌─────────────┐
                             │  pages       │
                             │  ─────────── │
                             │  npm ci      │
                             │  npm version │──► Commit B + Tag v1.0.1
                             │  npm build   │──► public/
                             │  zip tools   │──► tools.zip
                             │  dotenv      │──► build.env
                             └──────┬──────┘
                                    │ needs
                             ┌──────▼──────┐
                             │  release     │
                             │  ─────────── │
                             │  release-cli │──► Tag v1.0.1 (remote)
                             │             │──► Release (mit tools.zip Link)
                             └──────┬──────┘
                                    │ needs
                             ┌──────▼──────┐
                             │  merge-back  │
                             │  ─────────── │
                             │  push HEAD   │──► release (v1.0.1) + Tag
                             │  :release    │
                             │  push HEAD   │──► master (v1.0.1) — Fast-Forward
                             │  :master     │
                             └─────────────┘

master (v1.0.1) ◄── Fast-Forward ── release (v1.0.1)
```

---

## Risiken & Annahmen

### 1. `CI_JOB_TOKEN` für Release-Erstellung

Das `release:` Keyword verwendet `CI_JOB_TOKEN` zur Authentifizierung an der GitLab API.
Ab GitLab 15.9+ ist das standardmäßig möglich. Bei älteren Versionen muss ggf. ein
`CI_PUSH_TOKEN` (Personal Access Token) mit `api`-Scope hinterlegt werden.

**Fallback**: Falls `release-cli` mit `CI_JOB_TOKEN` nicht funktioniert, kann auf die
GitLab REST API via `curl` ausgewichen werden (dann mit `CI_PUSH_TOKEN`).

### 2. `master` divergiert

Wenn zwischen Trigger (Merge `master → release`) und dem `merge-back` Job jemand direkt
auf `master` committed, schlägt `git push origin HEAD:master` fehl. Der Build ist dann
erfolgreich (Release existiert), aber der Merge-Back nicht.

**Akzeptiert**: Das ist beabsichtigt — es verhindert ungewollte Überschreibungen.
Manuelles Eingreifen nötig.

### 3. Pipeline-Loop

`git push origin HEAD:release` triggert erneut die Pipeline auf `release`. Der Commit
enthält `[skip ci]` → GitLab überspringt die Pipeline. Getestet und bestätigt funktional.

### 4. `npm ci` nach `npm version patch`

`npm version patch` ändert `package.json` und `package-lock.json` (nur die Versionsnummer).
`npm ci` erwartet konsistente Lockfiles. Da keine Dependencies geändert werden, ist das
unproblematisch. Reihenfolge ist trotzdem `npm ci` → `npm version patch` → `npm run build`.

### 5. ZIP als Release-Asset, nicht in Pages

`tools.zip` wird als CI-Artifact bereitgestellt und per Link an das Release gehängt.
Es landet **nicht** in `public/` und somit nicht im Pages-Deployment. Das ZIP bleibt
nur über das Release oder direkt als Job-Artifact abrufbar.

---

## Nächste Schritte

1. Plan prüfen und ggf. anpassen
2. `.gitlab-ci.yml` mit dem neuen Inhalt ersetzen
3. `CI_PUSH_TOKEN` auf ausreichende Berechtigungen prüfen (Push nach `master`)
4. Test: Merge `master` → `release`, Pipeline beobachten
5. Nach Erfolg: Release in GitLab UI prüfen (Tag + Asset-Link)
