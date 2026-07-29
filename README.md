# Renshuu Dashboard

A personal Japanese-learning dashboard built on the
[Renshuu](https://app.renshuu.org) API.

**[View the dashboard →](https://vinzentortmann.github.io/renshuu-dashboard/)**

[![Renshuu progress](https://vinzentortmann.github.io/renshuu-dashboard/badge-light.svg)](https://vinzentortmann.github.io/renshuu-dashboard/)

## Why this exists, and not just Renshuu's stats page

Renshuu already shows level and XP, a study heatmap, and accuracy graphs. This
project deliberately doesn't re-implement any of that. It does three things
Renshuu can't:

### 1. A permanent archive

Renshuu's API exposes today's study counts and lifetime totals — but nothing
historical. There is no endpoint that answers "what did I do on 3 March". Ask it
tomorrow and today's numbers are simply gone.

So a GitHub Action snapshots the API every night and commits the result to
[`public/data/history.json`](public/data/history.json). That file is the archive,
and it only exists because something writes it down daily. Every chart here is
derived from data that Renshuu itself no longer has.

### 2. Cross-metric analysis

Renshuu tells you that you're 21% through N3 vocabulary. It doesn't tell you how
fast that number is moving, or when it lands on 100 — because working that out
needs the daily series it doesn't keep.

[`src/lib/projections.ts`](src/lib/projections.ts) fits a least-squares line over
a trailing 30-day window and projects each JLPT level to completion, with a date
range derived from the fit's own uncertainty. The same pace maths drives a
side-by-side comparison of kanji vs. vocabulary vs. grammar vs. sentences, which
Renshuu presents only as separate, unrelated screens.

### 3. A public, embeddable badge

Renshuu's stats live behind a login. The badge above is a static SVG, regenerated
nightly, that renders anywhere — a GitHub profile, a personal site, a README.

## What it does not claim

The dashboard is careful about the difference between *no data* and *zero*:

- A day the archive never captured is drawn as an **outline** in the heatmap; a
  day with genuinely no study is the lowest step of the colour ramp. Since the
  archive starts the day it was first run, most of the grid is honestly unknown.
- A projection is **refused** rather than guessed when there are fewer than five
  days of history, or when the trend is flat. A straight line through two points
  is exact by construction and means nothing.
- Per-schedule term counts sum higher than the lifetime total, because a term in
  two schedules is counted in both. The UI says so rather than quietly picking
  one number.
- Renshuu files hiragana and katakana under `booktype: vocab`, so kana inflate
  the vocabulary figures. Flagged in the UI rather than silently subtracted —
  removing them would make these numbers disagree with Renshuu's own.

## How it works

```
GitHub Action (daily cron, 21:50 UTC)
  └─ scripts/snapshot.ts   fetches /v1/profile and /v1/schedule
       ├─ upserts a dated entry into public/data/history.json
       └─ regenerates public/badge-{light,dark}.svg
            └─ commits both, then calls the deploy workflow
                 └─ the React app fetches that static JSON at runtime
```

No backend. The deployed site is static files; the only moving part is the
nightly Action.

### Notes on the pipeline

Two things about it are non-obvious and worth preserving:

- **Snapshots are date-stamped in a study timezone, not UTC.** Renshuu resets its
  `today_*` counters at local midnight while Actions runners are on UTC. A naive
  00:00 UTC cron would record ~0 terms studied every single day and never capture
  the day that just ended. The cron runs at 21:50 UTC, which is late evening in
  `Europe/Berlin` year-round.
- **The snapshot workflow calls the deploy workflow explicitly.** GitHub does not
  fire workflows for pushes made with the built-in `GITHUB_TOKEN`. Relying on
  `on: push` would mean the archive grew daily while the deployed site silently
  stayed frozen at day one.

## Tech stack

- React 19 + TypeScript, bundled with Vite
- Tailwind CSS v4, configured from CSS — there is no `tailwind.config.js`
- Recharts for the line and bar charts; the heatmap and badge are hand-written
- Node's built-in test runner — no test framework dependency

## Local development

```bash
npm install
npm run dev
```

| Script              | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Dev server with hot reload                      |
| `npm run build`     | Type-check, then produce a production `dist/`   |
| `npm run preview`   | Serve the built `dist/` locally                 |
| `npm test`          | Run the projection unit tests                   |
| `npm run lint`      | Lint with oxlint                                |
| `npm run snapshot`  | Fetch and archive today (`-- --dry-run` to peek) |
| `npm run check-api` | Verify the API types against your real account  |

### API access

The Renshuu API needs a key, from **Tools → Renshuu API** in Renshuu's menu.
Copy `.env.example` to `.env` and paste it in — `.env` is gitignored, and CI gets
the same value from the `RENSHUU_API_KEY` repository secret.

`npm run check-api` confirms the live API still matches
[`src/types/renshuu.ts`](src/types/renshuu.ts). Worth running before trusting a
field: the types were written from Renshuu's OpenAPI spec, which hasn't been
updated since mid-2024 and omits several fields the server actually sends —
including the lifetime totals and the per-schedule `booktype` this project
depends on.

## Using the badge

```markdown
[![Renshuu progress](https://vinzentortmann.github.io/renshuu-dashboard/badge-light.svg)](https://vinzentortmann.github.io/renshuu-dashboard/)
```

Theme-aware version, which GitHub honours:

```html
<a href="https://vinzentortmann.github.io/renshuu-dashboard/">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://vinzentortmann.github.io/renshuu-dashboard/badge-dark.svg">
    <img alt="Renshuu progress" src="https://vinzentortmann.github.io/renshuu-dashboard/badge-light.svg">
  </picture>
</a>
```

To put it on a GitHub profile, paste that into the README of a repository named
after your username.

The badge is a static image with the numbers baked in, because GitHub strips
scripts and iframes from READMEs — nothing that executes can run there. Note
that GitHub serves README images through a caching proxy, so the badge can trail
the archive by a few hours there; on your own site it updates as soon as the
deploy finishes.

## Deployment

Pushing to `main` builds and publishes to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). One-time repo
setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**, and
add `RENSHUU_API_KEY` under **Settings → Secrets and variables → Actions**.

`vite.config.ts` sets `base: '/renshuu-dashboard/'`, so the site expects to be
served from `https://<username>.github.io/renshuu-dashboard/`. Renaming the repo
means updating that value too.
