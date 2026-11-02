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

## The app

A static web app (TypeScript, React, Vite). It reads only `data/`, works offline once loaded, and keeps crews in the browser, with JSON export/import and share links.

```
npm install
npm run dev       # try it locally
npm test          # every validator and price rule, against the real data
npm run build     # static site in dist/, for any static host
npm run rules     # re-read the rulebook into data/generated/
```

See `MAINTAINING.md` for updating the rules.
