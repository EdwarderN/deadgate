#!/usr/bin/env python3
"""Extract the game data the crew builder needs from the rulebook markdown.

Run from the project root:   python3 tools/extract_rules.py
Reads:   rulebook/*.md          (the rulebook source, copied in unchanged)
Writes:  data/generated/*.json  (never edit these by hand: rerun this script)

Every table is found by the first words of its header row, exactly as the
rulebook prints it. If a rule change renames a header, this script stops with
an error that names the missing table, so nothing goes stale silently.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOK = os.path.join(ROOT, "rulebook")
OUT = os.path.join(ROOT, "data", "generated")


def read(name):
    with open(os.path.join(BOOK, name), encoding="utf-8") as fh:
        return fh.read().splitlines()


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def table_at(lines, i):
    """Parse the markdown table whose header is lines[i]."""
    header = cells(lines[i])
    rows = []
    j = i + 2  # skip the --- row
    while j < len(lines) and lines[j].startswith("|"):
        vals = cells(lines[j])
        rows.append(dict(zip(header, vals)))
        j += 1
    return header, rows


def find_table(file, prefix, nth=1):
    lines = read(file)
    hits = [i for i, l in enumerate(lines) if l.startswith(prefix)]
    if len(hits) < nth:
        sys.exit(f"extract_rules: table '{prefix}' (#{nth}) not found in {file}. "
                 "The rulebook changed: update the prefix in tools/extract_rules.py.")
    return table_at(lines, hits[nth - 1])[1]


def tables_under_bold(file, prefix):
    """All tables starting with prefix, each keyed by the nearest **bold** line above it."""
    lines = read(file)
    out = {}
    for i, l in enumerate(lines):
        if l.startswith(prefix):
            k = i - 1
            while k >= 0 and not lines[k].startswith("**"):
                k -= 1
            label = re.match(r"\*\*(.+?)\*\*", lines[k]).group(1) if k >= 0 else f"table {i}"
            out[label] = table_at(lines, i)[1]
    if not out:
        sys.exit(f"extract_rules: no table '{prefix}' in {file}.")
    return out


def tables_under_heading(file, prefix):
    """All tables starting with prefix, each keyed by the nearest ### heading above it,
    with the first paragraph under that heading (a voice's own rule, say)."""
    lines = read(file)
    out = {}
    for i, l in enumerate(lines):
        if l.startswith(prefix):
            k = i - 1
            while k >= 0 and not lines[k].startswith("### "):
                k -= 1
            if k < 0:
                continue
            label = lines[k][4:].strip()
            intro = next((x.strip() for x in lines[k + 1:i] if x.strip() and not x.startswith("|")), "")
            out[label] = {"intro": intro, "rows": table_at(lines, i)[1]}
    if not out:
        sys.exit(f"extract_rules: no table '{prefix}' under a ### heading in {file}.")
    return out


def deed_tiers():
    """'**Small deeds** (2 XP; no Legend)' -> {'Small deeds': {'tier': 'Small', 'xp': 2}}"""
    out = {}
    for l in read("13-after.md"):
        m = re.match(r"\*\*((\w+) deeds)\*\* \((\d+) XP", l)
        if m:
            out[m.group(1)] = {"tier": m.group(2), "xp": int(m.group(3))}
    if not out:
        sys.exit("extract_rules: no '**Small deeds** (2 XP' lines in 13-after.md.")
    return out


def plain(md):
    return re.sub(r"\*\*(.+?)\*\*", r"\1", md).strip()


def num(s):
    s = plain(s)
    return None if s in ("–", "-", "") else int(re.match(r"-?\d+", s).group(0))


# ---------- shop: one entry per buyable item and source ----------
def shop():
    items = []
    groups = tables_under_bold("11-crews.md", "| Weapon | Copy | Old stock")
    groups.update(tables_under_bold("11-crews.md", "| Item | Copy | Old stock"))
    for group, rows in groups.items():
        for r in rows:
            name = plain(r[list(r)[0]])
            note = None
            m = re.match(r"(.+?) \((.+)\)$", name)
            if m:
                name, note = m.group(1), m.group(2)
            names = [n.strip() for n in name.split(" / ")]
            copy_name, old_name = (names[0], names[-1])
            for source, col, nm in (("copy", "Copy", copy_name), ("old stock", "Old stock", old_name)):
                price = num(r[col])
                if price is not None:
                    items.append({"name": nm[0].upper() + nm[1:], "group": group, "source": source,
                                  "price": price, "note": note})
    for r in find_table("11-crews.md", "| Relic | Price"):
        items.append({"name": plain(r["Relic"]), "group": "Relics", "source": "old stock",
                      "price": num(r["Price"]), "note": "relic"})
    return items


def recruits():
    out = []
    for r in find_table("11-crews.md", "| Recruit | Price"):
        out.append({"recruit": plain(r["Recruit"]), "price": plain(r["Price"])})
    return out


def factions():
    lines = read("12-factions.md")
    starts = [i for i, l in enumerate(lines) if re.match(r"## 12\.[2-9] ", l)]
    out = []
    for n, s in enumerate(starts):
        e = starts[n + 1] if n + 1 < len(starts) else len(lines)
        block = lines[s:e]
        f = {"section": re.match(r"## (12\.\d)", block[0]).group(1),
             "name": re.sub(r"## 12\.\d ", "", block[0]).strip(),
             "rules": [], "subfactions": [], "types": [], "ownTaskTable": []}
        for i, l in enumerate(block):
            m = re.match(r"(\d)\. \*\*(.+?)\*\* ?(.*)", l)
            if m and not f["subfactions"]:
                f["rules"].append({"n": int(m.group(1)), "name": m.group(2).rstrip("."), "text": m.group(3)})
            if l.startswith("| Subfaction | Replaces"):
                f["subfactions"] = [{"name": plain(r["Subfaction"]), "replaces": int(r["Replaces"]), "rule": r["Rule"]}
                                    for r in table_at(block, i)[1]]
            if l.startswith("| Type | Trait"):
                f["types"] = [{"name": re.sub(r"\s*\(.*\)", "", plain(r["Type"])), "label": plain(r["Type"]), "trait": r["Trait"]}
                              for r in table_at(block, i)[1]]
            for key, tag in (("voice", "**Voice"), ("startingKit", "**Starting kit:**"), ("specials", "**Specials:**"),
                             ("captiveFate", "**Captive fate"), ("ownTask", "**Own task"), ("noWords", "**No Words.**")):
                if l.startswith(tag):
                    f[key] = l
            if l.startswith("| d6 | Result") and "ownTask" in f and not f["ownTaskTable"]:
                f["ownTaskTable"] = table_at(block, i)[1]
        out.append(f)
    return out


def research():
    return {"field": find_table("12-factions.md", "| d6 | Field study"),
            "lab": find_table("12-factions.md", "| d6 | Lab study")}


DATA = {
    "species": lambda: find_table("04-fighters.md", "| Species | Move"),
    "slots": lambda: find_table("07-gear.md", "| Slot | What goes in it"),
    "weapon_traits": lambda: find_table("07-gear.md", "| Trait | Effect"),
    "weapons": lambda: find_table("07-gear.md", "| Weapon | Source | Hands"),
    "armour": lambda: find_table("07-gear.md", "| Armour | Save dice"),
    "armour_by_source": lambda: find_table("07-gear.md", "| Source | Armour rule"),
    "frames": lambda: find_table("07-gear.md", "| Frame | Basic"),
    "robo_arms": lambda: find_table("07-gear.md", "| Source | Basic | Boosted (1 Energy, once"),
    "grenades": lambda: find_table("07-gear.md", "| Grenade | Basic"),
    "devices": lambda: find_table("07-gear.md", "| Device | Basic"),
    "medical_kits": lambda: find_table("07-gear.md", "| Tier | Kit"),
    "drop_items": lambda: find_table("07-gear.md", "| Drop item | Slot"),
    "relics": lambda: find_table("08-special.md", "| Relic (rite)"),
    "psionic_powers": lambda: find_table("08-special.md", "| Power | Number"),
    "captain_traits": lambda: find_table("11-crews.md", "| Captain trait | Rule"),
    "shop": shop,
    "recruits": recruits,
    "factions": factions,
    "research_studies": research,
    "xp_ladder": lambda: find_table("13-after.md", "| Advance | Total Experience"),
    "advances": lambda: tables_under_bold("13-after.md", "| Advance | Rule"),
    "injuries_light": lambda: find_table("13-after.md", "| d6 | Injury (title)", 1),
    "injuries_heavy": lambda: find_table("13-after.md", "| d6 | Injury (title)", 2),
    "prosthetics": lambda: find_table("13-after.md", "| Injury | Replacement"),
    "glitches": lambda: find_table("13-after.md", "| d6 | Glitch (title)"),
    "recovery_words": lambda: find_table("13-after.md", "| Recovery word | Effect"),
    "silly_traits": lambda: tables_under_bold("13-after.md", "| d6 | Trait (nickname)"),
    "deeds": lambda: tables_under_bold("13-after.md", "| # | Deed"),
    "rumours": lambda: find_table("13-after.md", "| Rumour | Deed"),
    "tags": lambda: find_table("14-break.md", "| Tag | Gained when"),
    "contacts": lambda: find_table("14-break.md", "| Contact | Use them to"),
    "tasks": lambda: find_table("14-break.md", "| Task | Test"),
    "glossary": lambda: find_table("18-glossary.md", "| Term | Meaning"),
    # ---- the battle companion and the after-battle steps ----
    "difficulties": lambda: find_table("03-dice.md", "| Difficulty | Target"),
    "severity": lambda: find_table("03-dice.md", "| Margin | Severity"),
    "states": lambda: find_table("05-battle.md", "| State | What it does"),
    "actions": lambda: find_table("05-battle.md", "| Action | What it does"),
    "consequences": lambda: tables_under_bold("06-hits.md", "| d6 | Result"),
    "lasting_conditions": lambda: find_table("06-hits.md", "| Condition | Bot name"),
    "clashes": lambda: tables_under_bold("06-hits.md", "| d66 | Result"),
    "voices": lambda: tables_under_heading("08-special.md", "| d6 | Result | Effect | Mark"),
    "bot_states": lambda: find_table("08-special.md", "| State | When | What it does"),
    "drop_table": lambda: find_table("09-setup.md", "| d66 | What came out"),
    "generic_xp": lambda: find_table("13-after.md", "| Deed | XP"),
    "deed_tiers": deed_tiers,
    "word_audiences": lambda: find_table("13-after.md", "| Audience | What it is"),
    "injury_tables": lambda: tables_under_bold("13-after.md", "| d66 | Result"),
    "bot_words": lambda: find_table("13-after.md", "| Organic result | Bot result"),
    "story_rows": lambda: find_table("14-break.md", "| Row | Choose it when"),
    "story_events": lambda: tables_under_bold("14-break.md", "| d6 | Event | Accept"),
    "task_tables": lambda: tables_under_bold("14-break.md", "| 2d6 | Result"),
    "finds": lambda: find_table("14-break.md", "| d6 | Find"),
    "league_points": lambda: find_table("14-break.md", "| What | Points"),
}


def key(name):
    """A plain lower-case key: 'Tool-blade (a wrench...)' -> 'tool-blade'."""
    n = plain(name).lower()
    n = re.sub(r"\s*\(.*?\)", "", n)
    return n.strip()


def catalog(gen):
    """Join every shop entry to its rules row. Unlinked entries are listed in _meta.json."""
    stats = {}
    for r in gen["weapons"]:
        stats[key(r["Weapon"])] = ("weapon", r)
    for r in gen["armour"]:
        stats[key(r["Armour"]) + " armour"] = ("armour", r)
    for r in gen["frames"]:
        stats[key(r["Frame"]) + " frame"] = ("frame", r)
    for r in gen["grenades"]:
        stats[key(r["Grenade"]) + " grenades"] = ("grenade", r)
    for r in gen["devices"]:
        stats[key(r["Device"])] = ("device", r)
    for r in gen["medical_kits"]:
        stats[key(r["Kit"])] = ("medical kit", r)
    for r in gen["relics"]:
        stats[key(r["Relic (rite)"])] = ("relic", r)
    stats["robo-arm"] = ("robo-arm", {r["Source"]: r for r in gen["robo_arms"]})
    stats["physical shield"] = ("shield", {"rule": "Hands 1, Block reaction, 2 dents (section 7.4)"})
    stats["force field"] = ("force field", {"rule": "Belt 1, no Hands, shots and blasts only, 1 Energy a use (section 7.4)"})
    for p in gen["prosthetics"]:
        stats.setdefault(key(p["Replacement"]), ("prosthetic", p))
    out, unlinked = [], []
    for item in gen["shop"]:
        k = key(item["name"])
        kind, row = stats.get(k, (None, None))
        if kind is None:
            unlinked.append(item["name"])
        out.append(dict(item, key=k, kind=kind, rules=row))
    return out, sorted(set(unlinked))


def main():
    os.makedirs(OUT, exist_ok=True)
    version = next((l for l in read("00-front.md") if "Version" in l), "")
    m = re.search(r"Version ([\d.]+)", version)
    meta = {"rulebookVersion": m.group(1).strip() if m else "unknown", "files": {}}
    gen = {}
    for name, fn in DATA.items():
        gen[name] = data = fn()
        with open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
        meta["files"][name] = len(data)
    cat, unlinked = catalog(gen)
    with open(os.path.join(OUT, "catalog.json"), "w", encoding="utf-8") as fh:
        json.dump(cat, fh, indent=2, ensure_ascii=False)
    meta["files"]["catalog"] = len(cat)
    meta["unlinkedShopItems"] = unlinked
    with open(os.path.join(OUT, "_meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2, ensure_ascii=False)
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
