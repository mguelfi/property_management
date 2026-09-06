# Front desk mockups

Three standalone, static (no build step, no live data) design explorations of the check-in /
front-desk workflow, for visual/UX comparison only. These are not wired to the real app in any
way — plain HTML/CSS/JS with hard-coded sample data in `shared/mock-data.js`.

## Run it

```
python3 mockups/frontdesk/serve.py
```

or, with zero script at all:

```
python3 -m http.server 8020 --bind 0.0.0.0 --directory mockups/frontdesk
```

Then open `http://localhost:8020/` (or the host's address, since it's bound to `0.0.0.0`).

## What's here

- `index.html` — landing page linking to all three, plus a side-by-side iframe compare view.
- `a-dashboard/` — dense ops dashboard: dark command-center layout, nav rail, data-dense tables.
- `b-kanban/` — Trello-style board of guest cards with a slide-over drawer for data entry.
- `c-wizard/` — task-first, single-column guided stepper flow.
- `shared/mock-data.js` — the one sample dataset (arrivals, in-house guests, room types/rates)
  used by all three, so the comparison is apples-to-apples.

Each mockup covers the same three scenarios: arrivals with room assignment + check-in,
in-house/departures with balance + check-out, and walk-in registration with a room/rate picker.
