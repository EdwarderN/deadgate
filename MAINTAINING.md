# Keeping the crew builder up to date

This is for the game's owner. You don't need to be a programmer. When the rules change, you change data files, never the app's code.

## What you need once

- **Python 3** (to read the rulebook into data).
- **Node.js** (version 20 or later) to test and build the app. In this folder, run `npm install` once.

## When the rulebook changes

The rulebook is not kept in this repository. Keep the designer's folder of chapters (`00-front.md`, `01-world.md` and so on) anywhere on your computer, or simply send it to Claude Code and ask it to "update the app to the new rulebook".

To do it yourself, in this folder:

1. **Install once:** Python 3 and Node.js (version 20 or later), then `npm install`.
2. **Run the update:**

   ```
   npm run update-rules -- path/to/the/rulebook/folder
   ```

   It reads the new rulebook into the app's data, then prints a **report**: every table row that was added, removed or changed, with the old and new text, and a list of what to check by hand. Then it runs the tests.

   If it stops with *"table '…' not found"*, a table's header in the book was renamed. Put the old header back in the book, or ask Claude Code to "fix the table header in the extractor". The app's data is left as it was.
3. **Check what the report lists:**
   - **Table rows** (story events, injuries, tasks, finds, drops): each has an entry in `data/manual/outcomes.json` saying what it does, for example `{"parts": -5}, {"tag": "Reliable"}` for "5 parts: the crew gains Reliable". Make each listed entry match the new text.
   - **Limits, faction rules, kits and prices in the text** live in `data/manual/crew-rules.json`, each with its section. Change the number or name there.
   - **Renamed injuries, traits or items:** players' saved crews keep the old name. The app shows a warning on those crews, and the player picks the new one on the card.
4. **Run the tests** (`npm test`) until they pass. They fail if a table row has no entry, if a number in an entry no longer matches the book (say a story event now pays 5 parts and its entry still says 4), or if a name in the hand-kept files no longer exists in the book. The message names the file and the row.
5. **The version** shown in the app comes from the "Version" line in the rulebook's `00-front.md`. The report warns if it didn't change.
6. **Build and publish:** `npm run build`, then copy `dist/` to the web host.

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
