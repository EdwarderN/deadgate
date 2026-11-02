# The Dead Gate: crew builder package

Hand this whole folder to Claude Code and say, for example:

> Read BRIEF.md and CLAUDE.md, then build the crew builder. Start with phase 1.

- `BRIEF.md`: what the app should do and for whom.
- `CLAUDE.md`: how to build it so that rule changes are data changes.
- `rulebook/`: the rulebook source (the rules of record).
- `tools/extract_rules.py`: turns the rulebook into `data/generated/*.json`.
- `data/manual/crew-rules.json`: limits and faction rules the builder enforces, each with its rulebook section.
- `OPEN-QUESTIONS.md`: known rules gaps to settle; Claude Code adds to it.
- `reference/design-philosophy.md`: the game's tone and aims.

When the rules change, copy the new rulebook files into `rulebook/` and ask Claude Code to "update the rules data".
