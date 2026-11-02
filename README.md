# The Dead Gate: crew builder

A web app for building and keeping crews for **The Dead Gate**, a campaign skirmish game: a step-by-step crew builder, a battle companion, the after-battle steps, and printable fighter cards and roster. It runs from any static host, works offline once loaded, and keeps crews in the browser, with JSON export and import and share links.

```
npm install
npm run dev       # try it locally
npm test          # every rule the app enforces, against the real data
npm run build     # static site in dist/, for any static host
npm run rules -- path/to/rulebook   # re-read the rulebook into data/generated/
```

- `src/`: the app (TypeScript, React, Vite). `tests/`: Vitest tests.
- `data/generated/`: the rules as data, read from the rulebook by `tools/extract_rules.py`. Never edit by hand.
- `data/manual/`: the rules the app enforces that are not tables in the book (`crew-rules.json`) and what each table row does (`outcomes.json`).

The rulebook and other design material are not kept here. `MAINTAINING.md` explains how to update the app when the rules change; `CLAUDE.md` is the guide for working on the code.
