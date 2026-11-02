# Keeping the crew builder up to date

This is for the game's owner. You don't need to be a programmer. When the rules change, you change data files, never the app's code.

## What you need once

- **Python 3** (to read the rulebook into data).
- **Node.js** (version 20 or later) to test and build the app. In this folder, run `npm install` once.

## When the rulebook changes

1. **Have the new rulebook to hand.** The rulebook is not kept in this repository. You need the designer's folder of markdown chapters (`00-front.md`, `01-world.md` and so on) somewhere on your computer.
2. **Read the rules into data.** In this folder, run:

   ```
   npm run rules -- path/to/the/rulebook/folder
   ```

   (This is the same as `python3 tools/extract_rules.py path/to/the/rulebook/folder`. You can also copy the folder into this one as `rulebook/`; it is ignored by git, so it won't be added to the repository, and then `npm run rules` alone works.) It rewrites the files in `data/generated/`. Never edit those by hand.

   If it stops with an error like *"table '| Weapon | Copy | Old stock' not found"*, a table's header in the book was renamed. Either put the old header back in the book, or ask Claude Code to "fix the table header in the extractor".
3. **Check nothing got lost.** Open `data/generated/_meta.json`. The line `"unlinkedShopItems": []` must be an empty list. If an item name appears there, the shop sells something the gear tables don't describe (often a spelling difference between chapter 7 and section 11.3). Make the two names match in the book and run step 2 again.
4. **Update the hand-kept rules.** Open `data/manual/crew-rules.json`. It holds the limits and faction rules the builder enforces that are not tables in the book: starting parts, the nine-fighter limit, slot sizes, starting kits, faction price rules and so on. Every value says which section it comes from (`"source"`). If the new rulebook changes one of these, change the number or name here.

   Examples:
   - Starting parts go from 60 to 70: change `creation.startingParts.value` to `70`.
   - The Bodgers' discount becomes 2 parts: change `amount` in the Bodgers' `priceRules` to `2`.
   - A faction's starting kit changes: edit its `startingKit` list (item name, `copy` or `old stock`, and how many).
   And if a **table row** changed (a story event, an injury result, a task table, finds, the drop table), update its entry in `data/manual/outcomes.json`. Each row lists what it does, for example `{"parts": -5}, {"tag": "Reliable"}` for "5 parts: the crew gains Reliable". The tests tell you if a row is missing or a name is wrong.
5. **Run the tests.**

   ```
   npm test
   ```

   Every rule the app enforces has a test that uses the real data, and every data file is checked against its expected shape. If something fails, the message says which file or rule. Ask Claude Code to look if you're unsure.
6. **The version.** The rules version shown in the app comes from the rulebook's front page ("Version 0.3, ..." in the rulebook's `00-front.md`), through `_meta.json`. Change it in the book and step 2 picks it up.
7. **Build and publish.**

   ```
   npm run build
   ```

   Copy the `dist/` folder to any static web host. Players get the new rules the next time they open the app online.

## The battle companion and the after-battle steps

These read the book's own tables too: the consequence tables, clashes, states, conditions, the voices, the injury tables, story events, task tables, finds and league points. Change a row in the book, run step 2, and the app shows the new row. The few numbers that are not tables (five rounds then a d6, two conditions put a fighter down, Words per battle, which injury table each way of ending rolls) are in the `battle` and `afterBattle` parts of `crew-rules.json`, each with its section.

## Faction rules

Each faction in `crew-rules.json` has an `effects` list: the faction rules the app acts on (Fines, Box office, the mark, research tasks, and so on). Each names its rule number or subfaction, when it applies, and its number (`amount`). The rule's text always comes from the book. If a faction rule's number changes (say Fines become 3 parts), change `amount`. If a rule is removed, delete its effect; if a subfaction now replaces a different rule, the book's table already says so and the app follows it.

## Trying it on your computer

`npm run dev` and open the address it prints. `npm run preview` shows the built version (the one that works offline).

## Questions the book doesn't answer

When the app meets a rule the book doesn't settle, ask the designer, and record the decision in `data/manual/crew-rules.json` or `outcomes.json` with the section it belongs to.

## Saved crews

Players' crews live in their own browser, and in the files they export. A crew saved under an old rules version opens with the new rules and is checked against them: anything no longer legal shows up as a red message to fix.
