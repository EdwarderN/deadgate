#!/usr/bin/env python3
"""Update the app to a new rulebook, and report what changed.

    python3 tools/update_rules.py path/to/rulebook          (or: npm run update-rules -- path/to/rulebook)

1. Reads the new rulebook (kept outside this repository) into data/generated/,
   using tools/extract_rules.py. It stops with a clear error if a table it
   needs was renamed.
2. Compares the new data with the data the app had, file by file: rows added,
   removed and changed, and the rules version.
3. Says which hand-kept entries to check: data/manual/outcomes.json for table
   rows whose text changed (story events, injuries, tasks, finds, drops,
   faction tasks), and data/manual/crew-rules.json for faction rules and
   anything named there.
4. Runs the tests (unless --no-tests). They fail if a book row has no entry in
   outcomes.json, or a name in data/manual no longer exists in the book.

Writes the report to stdout and, with --report FILE, to a markdown file.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = os.path.join(ROOT, "data", "generated")

# Generated files whose rows have a hand-kept twin in data/manual/outcomes.json.
OUTCOME_TABLES = {
    "story_events": "storyEvents",
    "injury_tables": "injuryTables",
    "task_tables": "taskTables",
    "finds": "finds",
    "drop_table": "dropTable",
    "tasks": "taskBase",
}
# Generated files that data/manual/crew-rules.json refers to by name or number.
# Generated files whose names are saved on players' crews (injuries, traits, items, tags...).
SAVED_NAMES = ["injuries_light", "injuries_heavy", "glitches", "silly_traits", "captain_traits", "advances",
               "deeds", "rumours", "tags", "contacts", "catalog", "species", "factions"]
CREW_RULES_TABLES = ["factions", "captain_traits", "tags", "contacts", "silly_traits", "species",
                     "recruits", "league_points", "generic_xp", "states", "positions", "deed_tiers"]


def load(folder):
    out = {}
    for f in sorted(os.listdir(folder)):
        if f.endswith(".json"):
            with open(os.path.join(folder, f), encoding="utf-8") as fh:
                out[f[:-5]] = json.load(fh)
    return out


def rows_of(data):
    """Flatten a generated file into {label: row}, whatever its shape."""
    out = {}
    def first(row):
        if isinstance(row, dict):
            for k in ("name", "key", "title"):
                if k in row and isinstance(row[k], str):
                    return row[k]
            v = next(iter(row.values()), "")
            return v if isinstance(v, str) else json.dumps(v)[:60]
        return str(row)
    def walk(x, prefix):
        if isinstance(x, list):
            for r in x:
                label = re.sub(r"\*\*", "", first(r))
                key = f"{prefix}{label}"
                if key in out:
                    key += f" ({r.get('source', '') if isinstance(r, dict) else ''})"
                out[key] = r
        elif isinstance(x, dict):
            if all(isinstance(v, (list, dict)) for v in x.values()) and not any(isinstance(v, str) for v in x.values()):
                for k, v in x.items():
                    walk(v, f"{prefix}{k} / ")
            else:
                out[prefix.rstrip(" /") or "(file)"] = x
    walk(data, "")
    return out


def short(x, n=110):
    t = re.sub(r"\*\*", "", x if isinstance(x, str) else json.dumps(x, ensure_ascii=False))
    return t if len(t) <= n else t[: n - 1] + "…"


def changed_fields(a, b):
    """The fields of a row that differ, old and new, shortened."""
    if not (isinstance(a, dict) and isinstance(b, dict)):
        return {"": (short(a), short(b))}
    out = {}
    for k in sorted(set(a) | set(b), key=lambda k: list(b).index(k) if k in b else 999):
        if json.dumps(a.get(k), sort_keys=True) != json.dumps(b.get(k), sort_keys=True):
            out[k] = (short(a.get(k, "")), short(b.get(k, "")))
    return out


def diff(old, new):
    o, n = rows_of(old), rows_of(new)
    added = [k for k in n if k not in o]
    removed = [k for k in o if k not in n]
    changed = [k for k in n if k in o and json.dumps(n[k], sort_keys=True) != json.dumps(o[k], sort_keys=True)]
    return added, removed, changed


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    report_file = None
    if "--report" in sys.argv:
        i = sys.argv.index("--report")
        report_file = sys.argv[i + 1] if i + 1 < len(sys.argv) else None
        if report_file in args:
            args.remove(report_file)
    if not args:
        sys.exit("update_rules: give the rulebook folder: python3 tools/update_rules.py path/to/rulebook")
    book = os.path.abspath(args[0])

    before = tempfile.mkdtemp(prefix="rules-before-")
    for f in os.listdir(GEN):
        shutil.copy(os.path.join(GEN, f), before)
    old = load(before)

    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "extract_rules.py"), book], capture_output=True, text=True)
    if r.returncode != 0:
        # Leave the app's data as it was.
        for f in os.listdir(before):
            shutil.copy(os.path.join(before, f), GEN)
        sys.exit(f"update_rules: the extractor stopped, and the app's data was left as it was.\n{r.stderr or r.stdout}")
    new = load(GEN)

    lines = ["# Rules update report", ""]
    ov, nv = old.get("_meta", {}).get("rulebookVersion"), new.get("_meta", {}).get("rulebookVersion")
    lines.append(f"Rulebook version: {ov} -> {nv}" + ("  (unchanged: was the Version line in 00-front.md updated?)" if ov == nv else ""))
    unlinked = new.get("_meta", {}).get("unlinkedShopItems", [])
    lines.append(f"Shop items with no rules row: {', '.join(unlinked) if unlinked else 'none'}")
    lines.append("")

    to_check_outcomes, to_check_crew, saved = [], [], []
    any_change = False
    for name in sorted(set(old) | set(new)):
        if name == "_meta":
            continue
        if name not in old:
            lines.append(f"## {name}: NEW FILE"); any_change = True; continue
        if name not in new:
            lines.append(f"## {name}: no longer produced"); any_change = True; continue
        a, rm, ch = diff(old[name], new[name])
        if not (a or rm or ch):
            continue
        any_change = True
        lines.append(f"## {name}")
        o_rows, n_rows = rows_of(old[name]), rows_of(new[name])
        for k in a:
            lines.append(f"- added: {k}: {short(n_rows[k])}")
        for k in rm:
            lines.append(f"- removed: {k}: {short(o_rows[k])}")
        for k in ch:
            lines.append(f"- changed: {k}")
            for field, (was, now) in changed_fields(o_rows[k], n_rows[k]).items():
                lines.append(f"    - {field}: {was}  ->  {now}")
        if name in OUTCOME_TABLES:
            to_check_outcomes += [f"{OUTCOME_TABLES[name]}: {k}" for k in a + rm + ch]
        if name == "factions":
            to_check_outcomes += [f"ownTasks: {k}" for k in a + rm + ch]
        if name in SAVED_NAMES:
            # Only removals and renames matter to saved crews, not a new price or rule text.
            renamed = [k for k in ch if any(re.search(r"name|injury|trait|glitch|advance|captain|tag|contact|rumour|deed|species|^weapon$|relic", f, re.I)
                                            and not re.search(r"what it does|rule|effect|meaning", f, re.I) for f in changed_fields(o_rows[k], n_rows[k]))]
            saved += [f"{name}: {k}" for k in rm] + [f"{name}: {k} ({'; '.join(f'{w} -> {n}' for w, n in changed_fields(o_rows[k], n_rows[k]).values())})" for k in renamed]
        if name in CREW_RULES_TABLES:
            to_check_crew += [f"{name}: {k}" for k in a + rm + ch]
        lines.append("")
    if not any_change:
        lines.append("No rules data changed.")

    lines.append("## What to check by hand")
    if to_check_outcomes:
        lines.append("data/manual/outcomes.json: does each of these rows still do what its entry says?")
        lines += [f"- {x}" for x in to_check_outcomes]
    if to_check_crew:
        lines.append("data/manual/crew-rules.json: faction rules, kits, price rules and names that refer to these:")
        lines += [f"- {x}" for x in to_check_crew]
    lines.append("Also read the changed chapters for rules that are not tables (limits, prices in the text, faction rules): those live in data/manual/crew-rules.json, each with its section.")
    if saved:
        lines.append("Players' saved crews may hold these old names (an injury, trait, item, tag...). The app warns on any crew that still has a name the new rules lack, and players fix it on the card:")
        lines += [f"- {x}" for x in saved]
    if not to_check_outcomes and not to_check_crew:
        lines.append("Nothing in the tables that data/manual refers to changed.")
    lines.append("")

    report = "\n".join(lines)
    print(report)
    if report_file:
        with open(report_file, "w", encoding="utf-8") as fh:
            fh.write(report + "\n")
    shutil.rmtree(before, ignore_errors=True)

    if "--no-tests" not in sys.argv:
        print("Running the tests…")
        t = subprocess.run(["npx", "vitest", "run"], cwd=ROOT)
        if t.returncode != 0:
            sys.exit("update_rules: tests failed. They name the file and the row or name to fix in data/manual.")
        print("All tests pass.")


if __name__ == "__main__":
    main()
