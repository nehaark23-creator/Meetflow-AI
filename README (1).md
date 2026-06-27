# Execution — Meeting to Action Operator

A **Single Page Application** that turns raw meeting notes or transcripts into
a live execution board with owners, deadlines, status, and risk prediction.

**One HTML file, one CSS file, one JS file — six sections, zero page reloads.**

https://execution-board.apps.lemma.work

---

## Features

- **Home** — KPI dashboard, recent meetings, and a primary `+ New Meeting` CTA.
- **Upload Meeting** — paste raw notes / a transcript; extraction lays out
  owners and deadlines in an editable preview before save.
- **Meeting Summary** — pick a meeting, review the source, edit task status
  inline.
- **Execution Board** — kanban that auto-classifies tasks by **risk**
  (At risk · Overdue vs. on track), not just raw status.
- **Task Tracking** — sortable / filterable table with inline status edits.
- **Dashboard** — KPIs, owner & status distributions, watchlist, risk
  heatmap (owner × days-left).

Everything stays in one file. Clicking any menu item just toggles which
`<section>` is visible and rewrites the URL hash — there are no separate
`upload.html`, `dashboard.html`, etc.

## Live demo

The deployed version lives at:

```
https://execution-board.apps.lemma.work
```

Open it from any browser. **No account is required** — everything persists
locally via `localStorage`, so anyone holding the link can use it.

### Screenshots

| | |
| --- | --- |
| ![Home](docs/home.png) | ![Upload Meeting](docs/upload.png) |
| ![Execution Board](docs/board.png) | ![Dashboard](docs/dashboard.png) |



## Tech

- Plain **HTML / CSS / vanilla JavaScript**. No build step, no framework,
  no NPM dependency (the optional Google Fonts request is one `<link>`).
- One `<style>` tag in `index.html` (via external `style.css`) — design tokens,
  layouts, components.
- One `<script>` (via external `script.js`) — store, extraction, risk model,
  renderer, router.

## Project structure

```
execution-board/
├── README.md         ← you are here
├── index.html        ← HTML skeleton, references style.css and script.js
├── style.css         ← design tokens + all component rules
└── script.js         ← store / extraction / risk / router / renderers
```

## Quick start

### Just open it

```bash
# from the repo root
python3 -m http.server 8080
# then visit http://localhost:8080
```

Or open `index.html` directly in any modern browser — every feature works
from a `file://` load, no server required.

### Use it

1. Open the URL — the app seeds two example meetings on first load so every
   section has live data.
2. Click **+ New Meeting** → paste a transcript → **Extract actions** →
   edit the preview → **Save meeting**.
3. Switch to **Execution Board** to see your tasks auto-classified by
   risk; click any card to edit.
4. Open **Dashboard** to see KPI / owner / heatmap views update live.

## How it stays a SPA

- All six sections are `<section>` elements inside a single `<main>`.
- Any element with `data-nav="..."` (sidebar links, topbar buttons, in-page
  CTAs) is intercepted by one delegated click handler and calls
  `showSection(id)`.
- `showSection(id)` toggles `hidden` on the right section and updates the
  active class on the matching nav item, then mirrors the id into the URL
  hash via `history.replaceState`.
- `hashchange` re-shows the right section — so **bookmarks, refresh, and
  shared deep-links (`…/#board`)** all work without re-downloading the app.

## Extraction logic

`extractActions(text, attendees)` is a rule-based pass over your text. It
recognises:

| Pattern | Example |
| --- | --- |
| Markdown checkbox | `- [ ] Alice: send proposal to legal by Friday` |
| Explicit label | `ACTION: Bob will draft the rollout plan` |
| `@mention` line | `@carol needs to review the design by next Tuesday` |
| Transcript speaker | `Alice: ship status page by Friday.` |
| Sentence pattern | `Otis will write the migration guide before next Wednesday` |

Owners are taken from explicit name hints, leading `@mention`s, or
sentence openings. The first capitalized name that appears in the meeting's
attendee list is treated as a soft hint.

Deadlines are normalized to ISO dates from phrases like `by Friday`,
`next Wednesday`, `Sep 30`, `Oct 5`, `in 2 days`, `EOD`.

## Risk prediction

`predictRisk(task, allTasks)` returns `{ score, level, label, reason }`:

- `completed` → `completed` (score 0)
- `blocked`   → `blocked`   (score 0.7)
- deadline < 0               → **overdue**  (score 0.95)
- deadline ≤ 2 days, open    → **at-risk**  (score 0.85)
- deadline ≤ 5 days, open    → watchlist    (score 0.55)
- otherwise                  → on-track     (score 0.20)

A light **owner-load factor** nudges the score up when the same owner
already holds several non-completed items.

## Routes (hash router)

| URL hash | Section shown |
| --- | --- |
| `#home` | Home |
| `#upload` | Upload Meeting |
| `#summary` | Meeting Summary |
| `#board` | Execution Board |
| `#tracking` | Task Tracking |
| `#dashboard` | Dashboard |
| (missing / unknown) | Home (default) |

## Deploying

### Static hosts (GitHub Pages, Netlify, Vercel)

Push this repo. The three files are exactly what browsers need.

```bash
# GitHub Pages example
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:<you>/execution-board.git
git push -u origin main

# Pages will serve index.html at https://<you>.github.io/execution-board/
```

### Lemma pods (private + public deploy in one)

This app was originally deployed to a Lemma pod as a single-file HTML app:

```bash
# bundle back to one file for the no-build HTML-app deploy
python3 -c "
html = open('index.html').read()
css = open('style.css').read()
js  = open('script.js').read()
out = html.replace(
    '<link rel=\"stylesheet\" href=\"style.css\" />',
    '<style>' + css + '</style>'
).replace(
    '<script src=\"script.js\" defer></script>',
    '<script>' + js + '</script>'
)
open('bundle.html','w').write(out)
"
lemma apps deploy execution-board ./bundle.html --yes
lemma apps update execution-board --data '{"visibility":"PUBLIC"}'
```

## Customizing the design

All design tokens live at the top of `style.css`:

```css
:root {
  --paper:        #f7f5ef;
  --card:         #ffffff;
  --accent:       #4338ca;
  --good:         #15803d;
  --warn:         #c2410c;
  --bad:          #b91c1c;
  /* ... */
  --serif:        "Fraunces", ui-serif, Georgia, serif;
  --sans:         -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
[data-theme="dark"] {
  /* ... */
}
```

Tweak the palette, swap the serif/sans stack, or change the accent. The
rest of the file uses the tokens via `var(--…)`, so colors flow through
every section automatically.

## Compatibility

- Works in any current Chromium / Firefox / Safari.
- Tested with Node 25 + jsdom for headless smoke tests.
- Storage: each browser's `localStorage` (one key, `execution-operator.v1`).
- No external JavaScript dependencies (Google Fonts is optional and
  gracefully degrades to system serif).

## No warranty

This software is provided as-is. Use it, fork it, deploy it. The author
takes no responsibility for missed deadlines — only the app can help you
spot them.

## License

MIT — do whatever you want with it.
