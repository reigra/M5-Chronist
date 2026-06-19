# Hilfe & FAQ

> [!WARNING] Warnung
> Dieser Text wurde per KI erzeugt und kann Fehler enthalten. Alle Angaben ohne Gewähr.

## Inhaltsverzeichnis

- [Wie funktioniert die App?](#wie-funktioniert-die-app)
- [Wie erstelle ich einen Charakter?](#wie-erstelle-ich-einen-charakter)
- [Wie steigere ich Fertigkeiten?](#wie-steigere-ich-fertigkeiten)
- [Wie verwalte ich Regelwerke?](#wie-verwalte-ich-regelwerke)
- [Wie kann ich meine Daten sichern?](#wie-kann-ich-meine-daten-sichern)

---

## Wie funktioniert die App?

MagusNG ist eine **Offline-first PWA** – sie läuft komplett im Browser, ohne Server.

- Alle Daten werden lokal in deinem Browser gespeichert (IndexedDB).
- Du kannst die App auf deinem Rechner installieren und dann auch **offline** nutzen.
- Es gibt keinen Login, keine Cloud-Synchronisation (außer optionalem Google Drive Export).
- Unterstützt werden Chromium-Browser (Chrome, Edge, Opera). Firefox und Safari haben noch keine vollständige Unterstützung für die Dateisystem-API.

Zurück zum [Inhaltsverzeichnis](#inhaltsverzeichnis)

---

## Wie erstelle ich einen Charakter?

1. Klicke oben in der Navigation auf **+ Neuer Charakter**.
2. Wähle Rasse, Typ und gib einen Namen ein.
3. Trage die Eigenschaftswerte (St, Gs, Gw, …) sowie Erfahrung und Gold ein.
4. Füge Fertigkeiten und ggf. Zaubersprüche hinzu.
5. Klicke auf **Charakter erstellen**.

Dein Charakter wird automatisch gespeichert und erscheint auf der Startseite.

> [!TIP]
> Die genauen Eigenschaften, Fertigkeiten und Kosten richten sich nach den geladenen Regelwerken. Lade zuerst die passenden Regeln, bevor du einen Charakter erstellst.

Zurück zum [Inhaltsverzeichnis](#inhaltsverzeichnis)

---

## Wie steigere ich Fertigkeiten?

1. Öffne den Charakter und klicke auf **Steigern**.
2. Wähle eine bekannte Fertigkeit und klicke auf **Steigern**, um den Fertigkeitswert (FW) zu erhöhen.
3. Um eine neue Fertigkeit zu lernen, wähle sie aus der Liste **Neue Fertigkeit lernen**.
4. Die Kosten werden in EP und GS angezeigt, bevor du bestätigst.
5. Nach dem Bestätigen wird der Charakter aktualisiert.

> [!WARNING] Warnung
> **Zu beachten:**
> - Manche Fertigkeiten sind Grad-beschränkt – sie können nicht über einen bestimmten FW gesteigert werden.
> - Waffenfertigkeiten benötigen eine Spezialisierung (z. B. „Schwert“ oder „Axt“).
> - Du kannst EP auch gegen Gold ersetzen, falls nicht genug EP vorhanden sind.

Zurück zum [Inhaltsverzeichnis](#inhaltsverzeichnis)

---

## Wie verwalte ich Regelwerke?

Unter **Regeln** kannst du Regelwerke importieren, aktivieren/deaktivieren und priorisieren.

1. Klicke in der Navigation auf **Regeln**.
2. Importiere eine Regelwerk-Datei (JSON-Format) über den Button **Regeldateien importieren**.
3. Aktive Regeln werden zur Berechnung von Kosten und Werten herangezogen.
4. Über **Priorität ändern** kannst du die Reihenfolge festlegen – weiter oben = höhere Priorität.
5. Bei Konflikten gewinnt: Hausregel → Kernregel → sonstige (erster Treffer pro Feld).

Regelwerke kannst du auch aus Google Drive importieren oder exportieren.

Zurück zum [Inhaltsverzeichnis](#inhaltsverzeichnis)

---

## Wie kann ich meine Daten sichern?

**Charaktere exportieren:** Auf dem Charakterbogen klicke auf **Auf Festplatte exportieren**. Die Datei wird als JSON heruntergeladen.

**Charaktere importieren:** Auf der Startseite klicke auf **Charakter von Festplatte importieren** und wähle die JSON-Datei aus.

**Regelwerke sichern:** Unter **Regeln** kannst du Regeldateien exportieren (Google Drive) oder lokal speichern.

**Google Drive:** Falls verfügbar, kannst du Charaktere und Regeln mit Google Drive synchronisieren. Dafür ist eine Internetverbindung erforderlich.

Zurück zum [Inhaltsverzeichnis](#inhaltsverzeichnis)
