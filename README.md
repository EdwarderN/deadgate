# The Dead Gate: crew builder

A web app for building and keeping crews for **The Dead Gate**, a campaign skirmish game: a step-by-step crew builder, a battle companion, the after-battle steps, and printable fighter cards and roster. It runs from any static host, works offline once loaded, and keeps crews in the browser, with JSON export and import and share links.

```
npm install
npm run dev       # try it locally
npm test          # every rule the app enforces, against the real data
npm run build     # static site in dist/, for any static host
npm run update-rules -- path/to/rulebook   # a new rulebook: re-read it, report what changed, run the tests
```

- `src/`: the app (TypeScript, React, Vite). `tests/`: Vitest tests.
- `data/generated/`: the rules as data, read from the rulebook by `tools/extract_rules.py`. Never edit by hand.
- `data/manual/`: the rules the app enforces that are not tables in the book (`crew-rules.json`) and what each table row does (`outcomes.json`).

**Published at** https://edwardern.github.io/deadgate/ : every push to the repository runs the tests, builds and publishes it (`.github/workflows/pages.yml`).

**Privacy and safety.** The app has no server and sends nothing anywhere: crews stay in the browser's storage on each device. A share link carries the crew after the `#`, which browsers never send to a server. The published page carries a content security policy that lets it load only its own files and contact no other site, and it sends no referrer. Crews opened from share links or files are checked for shape and size before use, and only plain colour names or hex codes are used as tape colours.

The rulebook and other design material are not kept here. `MAINTAINING.md` explains how to update the app when the rules change; `CLAUDE.md` is the guide for working on the code.
