# CLAUDE.md: The Dead Gate crew builder

Read `BRIEF.md` first: it says what to build and for whom. This file says how to build it so that rule changes stay cheap.

## The one rule: rules are data

The game is in playtest, and its rules change often. **No rule text, price, number or name of a game thing may be hard-coded in components or logic.**

- `rulebook/` is the source of truth: the rulebook's own markdown, copied in unchanged.
- `tools/extract_rules.py` reads it and writes `data/generated/*.json`. Never edit those files by hand; rerun the script.
- `data/manual/crew-rules.json` holds the rules the builder enforces that are not tables in the book (budgets, slot limits, faction kits and price rules). Each value names its rulebook section.
- The app reads only `data/`. Logic is generic: a validator is a function of the data (for example "belt slots used <= gear.beltSlots.value"), never "if faction == 'Bodgers' and item == 'Crank charger'". Where a faction rule needs code, key it off `crew-rules.json` (for example `priceRules`), so adding or removing such a rule is a data change.

## When the rules change

1. Replace `rulebook/` with the new rulebook markdown.
2. Run `python3 tools/extract_rules.py`. It stops with a clear error if a table it needs was renamed; fix the header prefix in the script.
3. Read `data/generated/_meta.json`: `unlinkedShopItems` lists shop entries the script could not join to a rules row. It should be empty.
4. Update `data/manual/crew-rules.json` for any changed limit or faction rule.
5. Run the tests. Add a test for any new rule.
6. Bump the displayed rules version (it comes from `_meta.json`).

Keep this list accurate if you change the workflow, and add a short `MAINTAINING.md` for the human owner (not a programmer) that walks through the same steps in plain words.

## Data notes

- `catalog.json` is the shop joined to each item's rules row (`kind` says which table: weapon, armour, frame, grenade, device, medical kit, relic, robo-arm, prosthetic, shield, force field). Prices are per source: copy or old stock.
- Text fields keep the book's markdown bold (`**word**`); render it as bold, nothing more.
- Faction data (`factions.json`): numbered rules, subfactions (`replaces` is the rule number they replace), types, voice, starting kit and specials lines, own task and its d6 table. Structured kits and price rules are in `crew-rules.json`.
- Species, captain traits, advances (by list), injuries, glitches, silly traits, deeds, rumours, tags, contacts and the glossary are all generated.

## Suggested stack

A static web app: TypeScript, Vite, React (or Svelte if you prefer), schema validation of `data/` at load (Zod or similar), unit tests (Vitest) for every validator and price rule, browser storage plus JSON export and import, and a print stylesheet for the cards. No backend. It must run from a static host and offline.

## Quality bar

- Every validator has a test that uses the real data files.
- A test loads every data file against its schema, so a rulebook change that breaks the data fails loudly.
- Accessible: keyboard use, readable contrast, works at phone width.
- Ask the owner before inventing any rule the data does not cover; list such questions in `OPEN-QUESTIONS.md` rather than guessing silently.
