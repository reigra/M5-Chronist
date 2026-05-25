# Midgard M5 — Character System

This document describes how a Midgard M5 character is structured, how it is created, and how it can be advanced. It forms the basis for all business logic in the app.

---

## Character Overview

A character is made up of the following building blocks:

```
Character
├── Identity (name, player, etc.)
├── Race
├── Type (class)
├── Origin
├── Social Status (Stand)
├── Base Properties
├── Derived Properties
└── Skills
```

---

## 1. Base Properties (Basiseigenschaften)

Every character has a set of numeric base properties. These are determined during character creation and can be modified by race bonuses.

| Short | Full Name | Description |
|-------|-----------|-------------|
| `St` | Stärke | Physical strength |
| `Gs` | Geschicklichkeit | Agility, fine motor skills |
| `Gw` | Gewandtheit | Dexterity, body control |
| `Ko` | Konstitution | Physical toughness and health |
| `In` | Intelligenz | Mental capacity |
| `Zt` | Zaubertalent | Arcane aptitude |

> **Note:** The exact list and names must be verified against the official Midgard M5 rules. This table is a starting point and must be confirmed before implementation.

---

## 2. Secondary and Derived Properties

In addition to the six base properties, a character has a second group of values. Some of these are rolled during character creation; others are derived from the base properties. The exact rules for how each value is determined will be defined later.

| Short | Full Name |
|-------|-----------|
| `pA` | Persönliche Ausstrahlung (Personal Charisma) |
| `Wk` | Willenskraft (Willpower) |
| `Au` | Aussehen (Appearance) |
| `AusB` | Ausdauerbonus (Endurance Bonus) |
| `LP` | Lebenspunkte (Hit Points) |
| `AP` | AP-Maximum (Action Points / Endurance) |
| `SchB` | Schadensbonus (Damage Bonus) |
| `B` | Bewegungsweite (Movement Range) |
| `AnB` | Angriffsbonus (Attack Bonus) |
| `AbB` | Abwehrbonus (Defense Bonus) |
| `ZauB` | Zauberbonus (Magic Bonus) |
| `ResB` | Resistenzbonus (Resistance Bonus) |

> **Note:** Exact formulas and which values are rolled vs. derived will be defined in a later step. The app will read these rules from the rules data files rather than hardcoding them.

---

## 3. Race (Rasse)

The race determines:
- Adjustments to base properties (bonuses/penalties).
- Base movement speed.
- Starting languages.
- Special racial abilities or restrictions.
- Which types (classes) are available.

### Known Races

| ID | Name | Notes |
|----|------|-------|
| `human` | Mensch (Human) | No restrictions, most flexible |
| `dwarf` | Zwerg (Dwarf) | High Ko and St, low Gk |
| `elf` | Elf | High Gk and Zt, low Ko |
| `halfling` | Halbling | High Gk, low St |
| `gnome` | Gnom | Magic-affine |
| `half_elf` | Halbelf | Mixed human/elf traits |

> **Note:** The full list and all modifiers must be read from the rules JSON files. This table lists known races as a reference.

---

## 4. Type (Typ / Klasse)

The type defines the character's profession and determines:
- Which skills can be learned (and at what cost group).
- Starting LP and AP values.
- Starting equipment options.
- Advancement restrictions.

### Known Types

| ID | Name | Focus |
|----|------|-------|
| `warrior` | Krieger | Combat |
| `ranger` | Waldläufer | Wilderness, ranged combat |
| `thief` | Dieb | Stealth, traps, locks |
| `merchant` | Händler | Social, trading |
| `sorcerer` | Hexer | Arcane magic |
| `wizard` | Zauberer | Arcane magic (high power) |
| `healer` | Heiler | Healing, herbalism |
| `bard` | Barde | Social, music, some magic |
| `priest` | Priester | Divine magic, healing |
| `knight` | Ritter | Heavy combat, nobility |
| `assassin` | Assassine | Stealth, combat |
| `scout` | Späher | Reconnaissance |

> **Note:** The full and authoritative list must come from the rules JSON files.

---

## 5. Origin (Herkunft)

Origin represents where the character grew up (city, village, wilderness, nobility, etc.). It affects:
- Starting skills and languages.
- Social status options.
- Possibly base property adjustments.

Origin is selected during character creation and is stored as a reference ID. Its effects are defined in the rules data.

---

## 6. Social Status (Stand)

Social status represents the character's position in society (e.g., serf, free citizen, craftsman, noble). It affects:
- Starting gold and equipment.
- Social interaction modifiers.
- Which types are available.

---

## 7. Skills (Fertigkeiten)

Skills are the core of character advancement. A skill has:
- A **current level** (Fertigkeitswert, FW), typically 1–20.
- A **category** (e.g., combat, social, magic, knowledge).
- A **cost group** that determines how expensive it is to learn or improve.

### Skill States

| State | Description |
|-------|-------------|
| Not known | Character has not learned this skill |
| Learned | Character has the skill at a base level |
| Advanced | Character has improved the skill above base |

### Learning vs. Advancing

- **Learning** a new skill: The character pays a one-time cost to gain the skill.
- **Advancing** an existing skill: The character pays a cost to raise the skill level by one step.
- Costs are paid in **Experience Points (EP)**.

### Who Can Learn What

Not every type can learn every skill. Rules for this are stored in the rules data:
- `allowed`: The type can learn and advance this skill normally.
- `restricted`: The type can learn the skill, but at a higher cost.
- `forbidden`: The type cannot learn this skill.

### Cost Factors

The EP cost for learning or advancing a skill depends on:
1. The skill's **cost group** (A, B, C, etc. — lower = cheaper).
2. The **type** of the character (type-specific cost modifiers).
3. The **current level** of the skill (higher levels cost more).
4. Whether the skill is a **primary** or **secondary** skill for the type.

Cost tables will be loaded from the rules JSON files.

---

## 8. Character Creation Flow

```
1. Choose Race
      ↓ (filters available types)
2. Choose Type
      ↓ (filters available origins)
3. Choose Origin
      ↓
4. Choose Social Status
      ↓
5. Roll / Assign Base Properties
      ↓ (race modifiers applied)
6. Calculate Derived Properties
      ↓
7. Select Starting Skills
      ↓ (type + origin define available starting skills)
8. Choose Name and Identity
      ↓
9. Save Character
```

---

## 9. Character Advancement Flow

```
1. Load existing character
      ↓
2. Add earned EP
      ↓
3. Choose skill to learn or advance
      ↓ (app validates: allowed for type? enough EP?)
4. Pay EP cost
      ↓
5. Update character data
      ↓
6. Save character
```

---

## 10. Open Questions

The following details need to be confirmed before implementation. They may require reviewing the official Midgard M5 rulebook or providing the relevant rules data files.

| # | Question |
|---|----------|
| 1 | Exact list of base properties and their names (short and full) |
| 2 | Exact formulas for derived properties |
| 3 | Full list of races and their property modifiers |
| 4 | Full list of types and their skill access rules |
| 5 | Full cost table structure (cost groups, level-based costs) |
| 6 | Full list of origins and their effects |
| 7 | Full list of social statuses and their effects |
| 8 | Full skill list with categories and cost groups |
