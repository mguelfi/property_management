# Staff Web UI

React + Vite + TypeScript SPA for front-desk staff. Covers the operational core:
dashboard, reservations, new booking, front desk (assign / check-in / check-out
/ walk-in), folio (charges / payments / invoice), and guests. Admin screens
(rooms, rates, tax, users, property) stay on the API docs at `/docs` for now.

Talks to the backend JSON API only — no server rendering. Auth is a JWT bearer
token kept in `localStorage`.

## Develop

```bash
cd frontend
npm install

# in another terminal: uv run uvicorn app.main:app --reload --port 8010
npm run dev            # http://localhost:5173  (proxies /api and /health to :8010)
```

Override the API target with `PMS_API=http://host:port npm run dev`.

## Checks

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run test          # vitest
```

## Build (served by FastAPI)

```bash
npm run build         # -> ../app/modules/webui/dist/
```

Then run the backend normally; the SPA is served at `http://localhost:8010/`
with client-side-route deep links working (`app/modules/webui/spa.py`). The
`dist/` folder is git-ignored — build it as part of deployment.

## Layout

```
src/
  api/       client.ts (fetch + auth + error normalising), types.ts (hand-written
             mirror of the backend schemas), hooks.ts (TanStack Query hooks)
  auth/      AuthContext — token, current user, permission checks (can(...))
  components/ Layout, RequireAuth, GuestName, FolioPanel, Toaster, ui.tsx primitives
  lib/       money.ts (minor-unit <-> display, mirrors app/core/money.py), dates.ts
  pages/     Login, Dashboard, Reservations, ReservationDetail, NewBooking,
             FrontDesk, Folio, Guests, GuestDetail
  styles.css  one stylesheet, CSS variables, light/dark aware
```

When the backend API changes, update `src/api/types.ts` by hand against
`GET /openapi.json`.
