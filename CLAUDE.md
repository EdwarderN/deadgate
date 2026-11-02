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
2. Run `npm run rules` (= `python3 tools/extract_rules.py`). It stops with a clear error if a table it needs was renamed; fix the header prefix in the script.
3. Read `data/generated/_meta.json`: `unlinkedShopItems` lists shop entries the script could not join to a rules row. It should be empty.
4. Update `data/manual/crew-rules.json` for any changed limit or faction rule.
5. Run `npm test`. Add a test for any new rule (`tests/rules.test.ts`; data shape checks are in `tests/data.test.ts`).
6. Bump the displayed rules version: it is the "Version" line of `rulebook/00-front.md`, carried through `_meta.json`.
7. `npm run build` and publish `dist/`.

Keep this list accurate if you change the workflow, and add a short `MAINTAINING.md` for the human owner (not a programmer) that walks through the same steps in plain words.

## Code map

- `src/data/schema.ts`: Zod schemas for every file in `data/`. `src/data/rules.ts` loads, validates and derives lookups (items with slots, recruit prices, bot chassis, rites, advance lists, legends, the XP ladder).
- `src/engine/crew.ts`: prices, price rules (`priceRules[].kind`: `copyDiscount`, `recruitPrice`, `chassisDiscount`, `noSellerRoll`), starting kit, slots, stats, campaign actions.
- `src/engine/validate.ts`: every validator, each returning messages with a section number.
- `src/engine/dice.ts`: dice pools (keep best/lowest two, net edge cap), d66, and table lookup by cells like "24-26, 31-32".
- `src/engine/battle.ts`: the battle companion (conditions to down, states that cancel or end on activation, rounds, pods) and the after-battle steps (XP, Words, injury tables and what a result asks for, league points, tasks, the new break).
- `src/engine/outcomes.ts`: reads what a table result names (parts gained or paid, XP, Sore/Laid up, "starts the next battle Hyped", tags, contacts, silly traits) from the book's text, as tickable outcomes, and applies a list of changes to a crew. The after-battle screen previews each step's changes and applies them on one confirm.
- `src/engine/faction.ts`: faction rules the app acts on, read from `crew-rules.json` `factions[].effects` (where: setup, roundStart, pod, putDown, voice, voiceGood, afterBattle, captive, break, legend; what: reminder, xpEach, partsPer, partsIf, rating, nameEnemy, payment, research, sellDrop, cancelFighter, spinOffLegend, rollOwnTaskTable, captiveXp), `taskPay`, `typeRules` and `wordKind`, plus the faction pay cap. An effect keyed to a numbered `rule` turns off when the subfaction replaces that rule. The text shown is always the book's own. Rules that need no app action are listed as "rules in force" in the battle companion.
- `src/ui/`: builder steps, campaign screen, printable cards (`Print.tsx`), battle companion (`Battle.tsx`), after-battle steps (`AfterBattle.tsx`: the battle, injuries and captives, advances, the break, spend, done; empty steps are skipped), roll-or-enter dice controls (`Dice.tsx`). `public/sw.js`: offline cache.
- Battle and break rules in `crew-rules.json`: `dice`, `battle` (rounds, pod, positions and which injury table each rolls, Words, silly tables), `afterBattle` (table names, generic XP and league points mappings, task rules). Every name there is checked against the book by `tests/data.test.ts`.
- Structured additions to `crew-rules.json` (all with sources): `gear.kindSlots` (where each item kind goes), frame and armour keys, `moveModifiers`, `saveDice`, `prosthetics`, `injuryEffects`, `restrictedItems`, faction `startingKit[].assign`/`pick`, `typeSpecies`, `typeGrants`, `campaign` (air tax, selling, statuses), `sections` (where each kind of rule lives, for the in-app rule text).

## Data notes

- `catalog.json` is the shop joined to each item's rules row (`kind` says which table: weapon, armour, frame, grenade, device, medical kit, relic, robo-arm, prosthetic, shield, force field). Prices are per source: copy or old stock.
- Text fields keep the book's markdown bold (`**word**`); render it as bold, nothing more.
- Faction data (`factions.json`): numbered rules, subfactions (`replaces` is the rule number they replace), types, voice, starting kit and specials lines, own task and its d6 table. Structured kits and price rules are in `crew-rules.json`.
- Species, captain traits, advances (by list), injuries, glitches, silly traits, deeds, rumours, tags, contacts and the glossary are all generated.
- For the battle and the break, also generated: difficulties, severity, states, actions, consequence tables, lasting conditions, clash tables, the five voices (with each voice's own rule), the drop table, generic XP, deed tiers and their XP, Word audiences, the gentle and harsh injury tables, bot words, story events, downtime task tables, finds and league points.

## Suggested stack

A static web app: TypeScript, Vite, React (or Svelte if you prefer), schema validation of `data/` at load (Zod or similar), unit tests (Vitest) for every validator and price rule, browser storage plus JSON export and import, and a print stylesheet for the cards. No backend. It must run from a static host and offline.

## Quality bar

- Every validator has a test that uses the real data files.
- A test loads every data file against its schema, so a rulebook change that breaks the data fails loudly.
- Accessible: keyboard use, readable contrast, works at phone width.
- Ask the owner before inventing any rule the data does not cover; list such questions in `OPEN-QUESTIONS.md` rather than guessing silently.
