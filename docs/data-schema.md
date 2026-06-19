# MagusM5 — Datenschema

Dieses Dokument beschreibt die JSON-Datenstrukturen der Anwendung.
Es gibt zwei Kategorien: **Regeldaten** (unveränderlich, aus Regelwerken) und **Charakterdaten** (Speicherstand des Spielers).

Alle Dateien verwenden UTF-8 und die Endung `.json`.

---

## Regeldaten

Regeldaten werden aus einer oder mehreren Quell-JSON-Dateien geladen und im IndexedDB zwischengespeichert. Beim Laden werden alle aktiven Quellen zu einem einzigen `RulesData`-Objekt zusammengeführt.

### Struktur einer Regelwerk-Quelldatei (`RulebookData`)

Jede Quelldatei enthält einen Metadaten-Block und beliebig viele der folgenden Sektionen. Nicht jede Quelle enthält alle Sektionen.

```json
{
  "metadata": {
    "id": "kodex",
    "title": "Der Kodex",
    "version": "1402",
    "priority": 10,
    "createdAt": "2026-05-01",
    "notes": ""
  },
  "skills": [...],
  "types": [...],
  "races": [...],
  "origins": [...],
  "socialStatuses": [...],
  "languages": [...],
  "scripts": [...],
  "spells": [...],
  "spellDescriptions": [...],
  "equipment": [...],
  "skillRules": {...},
  "costColumns": [...],
  "costPatterns": [...]
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `metadata.id` | `string` | Eindeutige Quellenkennung |
| `metadata.title` | `string` | Anzeigename der Quelle |
| `metadata.version` | `string` | Ausgabe oder Druckjahr (nur Anzeige) |
| `metadata.priority` | `number` *(optional)* | Numerische Priorität: niedriger = höhere Priorität. `0` = Hausregel, `10` = Kernquelle, `999` = Fallback |
| `metadata.createdAt` | `string` | Erstellungsdatum der Datei |
| `metadata.notes` | `string` | Optionale Anmerkungen |

---

### `skills` — Fertigkeiten (`Skill`)

```json
{
  "id": "Klettern",
  "name": "Klettern",
  "typ": "Fertigkeit",
  "groups": ["Alltag", "Körper"],
  "difficulty": { "Alltag": "leicht", "Körper": "normal" },
  "learnCost": 1,
  "advancementCosts": [1, 2, 5, 10, 10, 20],
  "baseValue": 8,
  "maxValue": 18,
  "linkedProperty": "Gs",
  "bonusKey": "AnB",
  "notes": "",
  "costPatternId": 0,
  "unlearnedValue": 3,
  "gradValues": [{ "grad": 1, "fw": 8 }, { "grad": 4, "fw": 10 }]
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | `string` | Eindeutige ID, entspricht dem deutschen Regelbuchnamen |
| `name` | `string` | Anzeigename |
| `groups` | `string[]` | Fertigkeitsgruppen (z.B. `"Alltag"`, `"Kampf"`) — bestimmt EP-Kosten über den Charaktertyp |
| `difficulty` | `object` | Schwierigkeitsgrad pro Gruppe (`"leicht"`, `"normal"`, `"schwer"`, `"sehr schwer"`) — nur Anzeigewert |
| `learnCost` | `number` | LE-Kosten zum Erlernen der Fertigkeit |
| `advancementCosts` | `number[]` | TE-Kosten pro Steigerungsschritt, beginnend bei `baseValue`. Index 0 = Kosten von `baseValue` auf `baseValue + 1`. Fehlt bei Fertigkeiten ohne Steigerungstabelle (z.B. angeborene Fertigkeiten). |
| `baseValue` | `number` | Anfangs-FW beim Erlernen |
| `maxValue` | `number` | Maximaler erreichbarer FW |
| `linkedProperty` | `string` | Eigenschaft, die zum EW addiert wird (z.B. `"Gs"`) |
| `bonusKey` | `string` *(optional)* | Abgeleiteter Bonus, der zusätzlich auf den EW addiert wird (z.B. `"AnB"`, `"ZauB"`) |
| `notes` | `string` | Optionale Regelhinweise |
| `typ` | `string` *(optional)* | Quelltyp aus dem EVA-XML (z.B. `"Fertigkeit"`, `"Waffenfertigkeit"`) |
| `costPatternId` | `number` *(optional)* | Index in `costPatterns` für regionale EP-Kosten (Mogadil-System). Fehlt = Standard-Kosten via `advancementCosts`. |
| `unlearnedValue` | `number` *(optional)* | EW-Wert bei ungelernt verwenden. Fehlt = Fertigkeit kann nicht ungelernt eingesetzt werden. |
| `gradValues` | `Array<{grad, fw}>` *(optional)* | Grad-abhängige Steigerungstabelle (Abwehr, Resistenz, Zaubern). Wenn vorhanden, wird die Fertigkeit nicht per EP gesteigert, sondern erhöht sich automatisch beim Erreichen bestimmter Grade. |

---

### `types` — Charaktertypen (`CharacterType`)

```json
{
  "id": "Kr",
  "name": "Krieger",
  "category": "Kämpfer",
  "groupCosts": {
    "Alltag": 3,
    "Kampf": 2,
    "Waffen": 2
  },
  "propertyBonuses": [
    { "id": "AnB", "value": 1 }
  ]
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | `string` | Offizielle Midgard-Abkürzung (z.B. `"Kr"`, `"Hä"`, `"Dr"`) |
| `name` | `string` | Vollständiger Anzeigename |
| `category` | `string` | Typkategorie: `"Kämpfer"` \| `"KampfZauberer"` \| `"Zauberer"` |
| `groupCosts` | `object` *(optional)* | EP-Kosten pro TE für jede Fertigkeitsgruppe |
| `spellCosts` | `object` *(optional)* | EP-Kosten pro TE für jede Zaubergruppe. Nur bei `"Zauberer"` und `"KampfZauberer"`. |
| `fightCosts` | `object` *(optional)* | EP-Kosten pro TE für Kampffertigkeiten (Ars Armorum) |
| `propertyBonuses` | `Array<{id, value}>` *(optional)* | Flache Boni auf Eigenschaften oder Resistenzen |
| `isMeta` | `boolean` *(optional)* | `true` = Meta-Typ, der Felder an alle Typen einer Kategorie vererbt. Kein spielbarer Typ. |

---

### `races` — Rassen (`Race`)

```json
{
  "id": "elfen",
  "name": "Elfen",
  "propertyRestrictions": {
    "St": { "max": 16 },
    "Gs": { "min": 10 }
  },
  "lpModifier": -2,
  "availableTypes": ["Dr", "Sc"],
  "propertyBonuses": [
    { "id": "ResBg", "value": 2 }
  ],
  "forbiddenSkills": ["Grobschmied"],
  "skillBonuses": [],
  "skills": [
    { "skillId": "Eldalyn", "value": 12 }
  ]
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | `string` | Eindeutige ID |
| `name` | `string` | Anzeigename |
| `propertyRestrictions` | `object` *(optional)* | Min/Max-Grenzen für Basiseigenschaften bei der Charaktererschaffung |
| `derivedRestrictions` | `object` *(optional)* | Min/Max-Grenzen für abgeleitete Eigenschaften (z.B. `Au`) |
| `lpModifier` | `number` *(optional)* | Bonus oder Malus auf Lebenspunkte |
| `availableTypes` | `string[]` | Erlaubte Typ-IDs. Leeres Array = alle Typen erlaubt. |
| `propertyBonuses` | `Array<{id, value}>` *(optional)* | Flache Boni auf Eigenschaften oder Resistenzen |
| `forbiddenSkills` | `string[]` *(optional)* | Gesperrte Fertigkeiten (IDs aus `skills`) |
| `skillBonuses` | `Array<{skillId, value}>` *(optional)* | Flache Boni auf Fertigkeitswürfe |
| `skills` | `Array<{skillId, value}>` *(optional)* | Angeborene Fertigkeiten mit Startwert |
| `fixedSize` | `string` *(optional)* | Erzwungene Größe (kein freie Wahl bei der Erschaffung) |
| `fixedHandedness` | `string` *(optional)* | Erzwungene Händigkeit |

---

### `origins` — Herkünfte (`Origin`)

```json
{
  "id": "Alba",
  "name": "Alba",
  "description": "",
  "startingSkills": [],
  "startingLanguages": []
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | `string` | Eindeutige ID |
| `name` | `string` | Anzeigename |
| `description` | `string` | Beschreibungstext |
| `startingSkills` | `string[]` | Fertigkeits-IDs, die bei der Erschaffung gewährt werden |
| `startingLanguages` | `string[]` | Sprachen, die bei der Erschaffung bekannt sind |

---

### `socialStatuses` — Sozialer Stand (`SocialStatus`)

```json
{
  "id": "volk",
  "name": "Volk",
  "startingSkills": {
    "le": 4,
    "group": "Alltag",
    "maxDifficulty": "normal"
  }
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | `string` | Eindeutige ID |
| `name` | `string` | Anzeigename |
| `startingSkills.le` | `number` | Anzahl der Lerneinheiten bei der Erschaffung |
| `startingSkills.group` | `string` | Fertigkeitsgruppe, aus der gelernt werden darf |
| `startingSkills.maxDifficulty` | `string` *(optional)* | Maximale Schwierigkeit der wählbaren Fertigkeiten |

---

### `languages` — Sprachen (`Language`)

```json
{
  "id": "handelssprache",
  "name": "Handelssprache",
  "old": false,
  "regions": ["Alba", "Myrkjartan"]
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | `string` *(optional)* | Eindeutige ID. Fehlt sie, wird beim Import auf `name` normalisiert. |
| `name` | `string` | Anzeigename |
| `old` | `boolean` *(optional)* | `true` = veraltete Sprache |
| `regions` | `string[]` | Regionen, in denen die Sprache gesprochen wird |

---

### `scripts` — Schriften (`Script`)

```json
{
  "id": "runen",
  "name": "Runen",
  "old": true,
  "secret": false,
  "regions": ["Alba", "Myrkjartan"]
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | `string` *(optional)* | Eindeutige ID. Fehlt sie, wird beim Import auf `name` normalisiert. |
| `name` | `string` | Anzeigename |
| `old` | `boolean` *(optional)* | `true` = veraltete Schrift |
| `secret` | `boolean` *(optional)* | `true` = geheime Schrift |
| `regions` | `string[]` | Regionen, in denen die Schrift verwendet wird |

---

### `spells` — Zaubersprüche (`Spell`)

```json
{
  "id": "Laufen wie der Wind",
  "name": "Laufen wie der Wind",
  "level": 5,
  "learnCost": 2,
  "spellType": "Gestenzauber",
  "spellGroup": "Veränd.",
  "elements": ["Holz", "Erde"],
  "material": null,
  "apCost": "3",
  "castingTime": "10 sec",
  "range": "-",
  "targetType": "Körper",
  "effectArea": "Zauberer",
  "duration": "10 min",
  "origin": "druidisch",
  "shortDescription": "Der Zauberer läuft bis zu 10 min lang mit vierfacher Geschwindigkeit.",
  "source": "Arkanum S. 142"
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | `string` | Eindeutige ID, entspricht dem deutschen Regelbuchnamen |
| `name` | `string` | Anzeigename |
| `level` | `number` | Zauberstufe (1–10) |
| `learnCost` | `number` *(optional)* | Lernkosten in Trainingseinheiten |
| `spellType` | `string` | z.B. `"Wortzauber"`, `"Gestenzauber"`, `"Gedankenzauber"` |
| `spellGroup` | `string` | Zaubergruppe — entspricht einem Schlüssel in `type.spellCosts` |
| `elements` | `string[]` | Zugeordnete Elemente |
| `material` | `string \| null` | Benötigte Materialkomponente, `null` wenn keine |
| `apCost` | `string` | AP-Kosten (String, da Werte wie `"1 je Wesen"` möglich) |
| `castingTime` | `string` | Zauberzeit (z.B. `"10 sec"`) |
| `range` | `string` | Reichweite (z.B. `"-"`, `"20 m"`) |
| `targetType` | `string` | Zieltyp (z.B. `"Körper"`, `"Umgebung"`) |
| `effectArea` | `string` | Wirkungsbereich (z.B. `"Zauberer"`, `"bis zu 6 Wesen"`) |
| `duration` | `string` | Wirkungsdauer |
| `origin` | `string` | Zaubertradition (z.B. `"druidisch"`, `"arkane Magie"`) |
| `shortDescription` | `string` | Kurzbeschreibung für Listen und Charakterbogen |
| `source` | `string` | Regelbuchreferenz (z.B. `"Arkanum S. 142"`) |

---

### `spellDescriptions` — Volltext-Beschreibungen (`SpellDescription`)

```json
{
  "id": "Laufen wie der Wind",
  "description": "Der Zauberer läuft bis zu 10 min lang rasend..."
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | `string` | Entspricht `Spell.id` |
| `description` | `string` | Vollständiger Regeltext |

---

### `equipment` — Ausrüstung (`EquipmentItem`)

```json
{
  "id": "langschwert",
  "name": "Langschwert",
  "group": "Schwerter",
  "description": "Ein typisches Langschwert",
  "location": "Gürtel",
  "price": 15,
  "weight": 1.5,
  "damage": "1W6+1",
  "propertyRestrictions": { "St": { "min": 11 } },
  "waffentyp": "Angriff",
  "waffe": true,
  "anb": 0,
  "schb": 0,
  "abb": 0,
  "magisch": false,
  "spezialwaffe": false,
  "skillId": "Schwerter"
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | `string` | Eindeutige ID |
| `name` | `string` | Anzeigename |
| `group` | `string` | Kategorie (z.B. `"Schwerter"`, `"Rüstungen"`) |
| `description` | `string` | Beschreibungstext |
| `location` | `string` | Trageort (z.B. `"Gürtel"`, `"Rucksack"`) |
| `price` | `number` | Preis in Goldstücken |
| `weight` | `number` | Gewicht in kg |
| `damage` | `string` *(optional)* | Schadenswürfel (nur bei Waffen) |
| `propertyRestrictions` | `object` *(optional)* | Voraussetzungen an Eigenschaften (z.B. `{ "St": { "min": 11 } }`) |
| `distance` | `string[]` *(optional)* | Reichweitenstufen (nur bei Fernkampfwaffen) |
| `saveAP` | `number` *(optional)* | AP-Vorzug durch Rüstung |
| `waffentyp` | `string` *(optional)* | Waffentyp (z.B. `"Angriff"`, `"Fern"`) |
| `waffe` | `boolean` *(optional)* | `true` = wird als Waffe behandelt |
| `anb` | `number` *(optional)* | Angriffsbonus |
| `schb` | `number` *(optional)* | Schadensbonus |
| `abb` | `number` *(optional)* | Abwehrbonus |
| `magisch` | `boolean` *(optional)* | `true` = magischer Gegenstand |
| `spezialwaffe` | `boolean` *(optional)* | `true` = Spezialwaffe des Charakters |
| `skillId` | `string` *(optional)* | ID der zugehörigen Waffenfertigkeit (z.B. `"Schwerter"`) |

---

### `skillRules` — Fertigkeits-Sonderregeln (`SkillRulesConfig`)

Konfiguriert zwei Sonderfälle: **Split-Skills** (eine Fertigkeit wird als mehrere Zeilen angezeigt) und **Multi-Instance-Skills** (eine Fertigkeit kann mehrfach mit Spezialisierung gelernt werden).

```json
{
  "splitSkills": [
    {
      "baseSkillId": "Resistenz",
      "variants": [
        { "displayName": "Resistenz (Geist)", "bonusKey": "ResBg" },
        { "displayName": "Resistenz (Körper)", "bonusKey": "ResBk" }
      ]
    }
  ],
  "multiInstanceSkills": [
    {
      "baseSkillId": "Sprache",
      "idPrefix": "Sprache:",
      "instanceSource": { "type": "rules", "rulesKey": "languages", "nameField": "name" }
    }
  ]
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `splitSkills` | `SplitSkillRule[]` | Liste der Split-Skill-Konfigurationen |
| `multiInstanceSkills` | `MultiInstanceSkillRule[]` | Liste der Multi-Instance-Skill-Konfigurationen |

#### `SplitSkillRule`

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `baseSkillId` | `string` | ID der Basis-Fertigkeit in `skills` (z.B. `"Resistenz"`) |
| `variants` | `SplitSkillVariant[]` | Anzeige-Varianten mit optionalem `bonusKey` |

#### `MultiInstanceSkillRule`

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `baseSkillId` | `string` | ID der Basis-Fertigkeit in `skills` (z.B. `"Sprache"`) |
| `idPrefix` | `string` | Präfix für die Skill-IDs im Charakter (z.B. `"Sprache:"`) |
| `instanceSource` | `object` | Quelltyp: `{ type: "rules", rulesKey, nameField }` für Daten aus `languages`/`scripts`, oder `{ type: "fixed", values }` für feste Liste |

---

### `costColumns` — Kosten-Tabellenspalten (Mogadil)

Spaltenüberschriften für die Mogadil-Tabellen. Jeder Eintrag entspricht einem Typ-Schlüssel in `costPatterns`.

```json
["Kr", "Hä", "Dr", "Sc", "Bk", "Ma", "He", "Pa"]
```

### `costPatterns` — Kosten-Tabellen (Mogadil)

Zweidimensionales Array, das die EP-Kosten pro TE für Fertigkeiten definiert. Wird im Mogadil-System anstelle von `advancementCosts` einer Fertigkeit verwendet. Die Fertigkeit referenziert über `costPatternId` eine Zeile, die Spalte wird durch den Charaktertyp bestimmt.

```json
[
  [1, 1, 1, 2, 2, 3, 3, 4],
  [2, 3, 5, 4, 5, 6, 5, 7]
]
```

---

## Zusammengeführte Regeldaten (`RulesData`)

Beim Laden werden alle aktiven Quellen nach Priorität sortiert und zu einem einzigen `RulesData`-Objekt zusammengeführt. Die Merge-Strategie ist **First-Wins auf Feldebene**: Die Quelle mit der höchsten Priorität (niedrigster `priority`-Wert) gewinnt bei Konflikten. Für `types` gibt es eine spezielle Merge-Logik, die Meta-Typen (`isMeta`) auf alle Typen derselben Kategorie anwendet.

```json
{
  "skills": [...],
  "types": [...],
  "races": [...],
  "origins": [...],
  "socialStatuses": [...],
  "languages": [...],
  "scripts": [...],
  "spells": [...],
  "spellDescriptions": [...],
  "equipment": [...],
  "skillRules": {...},
  "costColumns": [...],
  "costPatterns": [...]
}
```

Das `RulesData`-Objekt entspricht in seiner Struktur dem `RulebookData`-Schema, jedoch sind alle List-Felder (außer `skillRules`, `costColumns`, `costPatterns`) immer vorhanden — ggf. als leere Arrays.

---

## Charakterdaten (`Character`)

Ein Charakter wird vollständig in einer einzigen Struktur gespeichert.

```json
{
  "id": "c1f3d8a2-...",
  "name": "Siandra von Kalmaran",
  "player": "Max Mustermann",
  "raceId": "mensch",
  "typeId": "Hä",
  "originId": "Alba",
  "socialStatusId": "adel",
  "totalEs": 500,
  "availableEp": 120,
  "gold": 35,
  "properties": {
    "St": 12, "Gs": 14, "Gw": 13, "Ko": 11,
    "In": 15, "Zt": 8,  "pA": 12, "Wk": 10,
    "Au": 14, "LP": 30, "AP": 20, "B": 10
  },
  "boni": {
    "AusB": 1, "SchB": 0, "AnB": 1, "AbB": 1,
    "ZauB": 0, "ResBg": 2, "ResBk": 1
  },
  "skills": [
    { "skillId": "Reiten", "value": 12, "pp": 0 }
  ],
  "spells": [
    { "spellId": "Laufen wie der Wind", "pp": 0 }
  ],
  "weaponSpecializations": ["Langschwert"],
  "inventory": [],
  "personalia": {
    "geschlecht": "weiblich",
    "haendigkeit": "rechts",
    "alter": 24,
    "groesse": 168,
    "gewicht": 62,
    "gestalt": "schlank, dunkelhaarig",
    "glaube": "Hesinde",
    "gg": 3,
    "sg": 1
  },
  "createdAt": "2026-05-22T10:00:00Z",
  "updatedAt": "2026-05-22T12:00:00Z"
}
```

### Hauptfelder

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | `string` | Eindeutige UUID, wird bei der Erstellung generiert |
| `name` | `string` | Charaktername |
| `player` | `string` | Name des Spielers |
| `raceId` | `string` | Referenz auf `Race.id` |
| `typeId` | `string` | Referenz auf `CharacterType.id` |
| `originId` | `string` | Referenz auf `Origin.id` |
| `socialStatusId` | `string` | Referenz auf `SocialStatus.id` |
| `totalEs` | `number` | Gesamter Erfahrungsschatz (kumulativ, wächst nur) |
| `availableEp` | `number` | Aktuell verfügbare EP (wird beim Steigern reduziert) |
| `gold` | `number` *(optional)* | Goldstücke |
| `createdAt` | `string` | ISO-Zeitstempel der Erstellung |
| `updatedAt` | `string` | ISO-Zeitstempel der letzten Änderung |
| `weaponSpecializations` | `string[]` *(optional)* | IDs der Spezialwaffen (max. 3 für Krieger, sonst 1) |
| `spellSpecialization` | `string` *(optional)* | Spezialgebiet des Magiers (`spellGroup`-Key) |
| `inventory` | `EquipmentItem[]` *(optional)* | Ausrüstungsgegenstände (vollständige Objekte, siehe `equipment`) |

### `properties` — Eigenschaften

| Schlüssel | Eigenschaft |
|-----------|-------------|
| `St` | Stärke |
| `Gs` | Geschicklichkeit |
| `Gw` | Gewandtheit |
| `Ko` | Konstitution |
| `In` | Intelligenz |
| `Zt` | Zaubertalent |
| `pA` | Persönliche Ausstrahlung |
| `Wk` | Willenskraft |
| `Au` | Aussehen |
| `LP` | Lebenspunkte |
| `AP` | AP-Maximum |
| `B` | Bewegungsweite |

### `boni` — Abgeleitete Boni

| Schlüssel | Bedeutung |
|-----------|-----------|
| `AusB` | Ausdauerbonus |
| `SchB` | Schadensbonus |
| `AnB` | Angriffsbonus |
| `AbB` | Abwehrbonus |
| `ZauB` | Zauberbonus |
| `ResBg` | Resistenzbonus gegen Geistmagie |
| `ResBk` | Resistenzbonus gegen Körpermagie |

### `skills` — Erlernte Fertigkeiten

```json
{ "skillId": "Reiten", "value": 12, "pp": 0 }
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `skillId` | `string` | Referenz auf `Skill.id` |
| `value` | `number` | Aktueller Fertigkeitswert (FW) |
| `pp` | `number` *(optional)* | Praktikapunkte (Power Points) für diese Fertigkeit |

### `spells` — Erlernte Zaubersprüche

```json
{ "spellId": "Laufen wie der Wind", "pp": 0 }
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `spellId` | `string` | Referenz auf `Spell.id` |
| `pp` | `number` *(optional)* | Praktikapunkte (Power Points) für diesen Zauber |

### `personalia` — Beschreibende Eigenschaften *(optional)*

Alle Felder optional (Rückwärtskompatibilität mit älteren Speicherständen).

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `geschlecht` | `string` | z.B. `"männlich"`, `"weiblich"`, `"divers"` |
| `haendigkeit` | `string` | `"rechts"` \| `"links"` \| `"beidhändig"` |
| `alter` | `number` | Alter in Jahren |
| `groesse` | `number` | Größe in cm |
| `gewicht` | `number` | Gewicht in kg |
| `gestalt` | `string` | Freitext: körperliche Erscheinung |
| `glaube` | `string` | Gottheit oder Glaube |
| `gg` | `number` | Göttergunst |
| `sg` | `number` | Schicksalsgunst |
