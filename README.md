# Property Management System

A modular hotel PMS. A small core (module registry, event bus, auth, data layer)
plus self-contained feature modules. Later additions — POS, restaurant,
housekeeping, channel connectors — slot in as new modules without touching the
existing ones.

**This build is the core PMS foundation:** take a booking from availability
search through check-out with a settled folio — plus a **staff web UI** for the
operational core.

- Stack: FastAPI · SQLAlchemy 2.0 (sync) · PostgreSQL · Alembic · Pydantic v2
- UI: React + Vite + TypeScript SPA (`frontend/`), served by FastAPI in production
- Scope: single property, self-hosted
- Auth: JWT bearer tokens + role/permission RBAC
- JSON API + OpenAPI at `/docs`; the SPA (dashboard, reservations, booking,
  front desk, folio, guests) at `/`

See `docs/architecture.md` for how the module system works and
`docs/ADDING_A_MODULE.md` to add one.

## Modules in this build

| Module | Responsibility |
| --- | --- |
| `auth` | Users, roles, permissions, login, `current_user` |
| `inventory` | Property, room types, rooms, out-of-order blocks |
| `rates` | Rate plans (incl. derived), rate calendar, stay restrictions |
| `availability` | Availability search + quote, the inventory ledger (oversell guard) |
| `guests` | Guest & company/travel-agent profiles |
| `reservations` | Reservations, room lines + nightly rate snapshots, lifecycle |
| `frontdesk` | Room assignment, check-in/out, walk-ins, arrivals/departures |
| `billing` | Folios, charges, taxes, payments, invoices; `PaymentGateway` iface |
| `webui` | Serves the built React SPA (`frontend/`) with client-route fallback |
| `audit` | Append-only audit log (subscribes to every domain event) |

Deferred but designed for: `housekeeping`, `channels` (channel-manager
connector), a public booking site, and `pos`/`restaurant`/`room-service`.
In the interim, ad-hoc room-service billing is a manual folio charge with the
`room_service` category.

## Setup

Requires Python 3.12+, [uv](https://docs.astral.sh/uv/), and PostgreSQL 16.

```bash
uv sync --extra dev

# Dev database. Uses podman or docker; creates DBs `pms` and `pms_test`.
scripts/pg-dev.sh start
# (or run your own Postgres and set PMS_DATABASE_URL)

cp .env.example .env          # adjust PMS_SECRET_KEY at least

uv run alembic upgrade head
uv run python -m app.jobs.seed_demo     # prints an admin password

# Build the staff UI (served by the backend). Requires Node 20.19+/22.12+.
(cd frontend && npm install && npm run build)

uv run python -m app                    # serves on PMS_HOST:PMS_PORT (default 0.0.0.0:8010)
# or, with autoreload:
uv run uvicorn app.main:app --reload --port 8010
```

- Staff UI: http://localhost:8010/  (log in with the seeded `admin`)
- API docs: http://localhost:8010/docs

For UI development with hot reload, run the Vite dev server alongside the
backend — see `frontend/README.md`. Skip the `npm run build` step and the
backend simply serves the API (the SPA route 404s until a build exists).

### Configuration

All settings are environment variables with the `PMS_` prefix (see
`.env.example` / `app/core/config.py`). `PMS_ENABLED_MODULES` is a
comma-separated list; the registry resolves load order from declared
dependencies.

## End-to-end walkthrough (curl)

```bash
BASE=http://localhost:8010
TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -d 'username=admin&password=PASTE_SEED_PASSWORD' | jq -r .access_token)
auth=(-H "Authorization: Bearer $TOKEN")

# 1. availability + quote
curl -s "${auth[@]}" "$BASE/api/availability?arrival=2026-09-01&departure=2026-09-03&adults=2" | jq
curl -s "${auth[@]}" "$BASE/api/availability/quote?room_type_id=2&rate_plan_id=1&arrival=2026-09-01&departure=2026-09-03" | jq

# 2. guest + reservation
GID=$(curl -s "${auth[@]}" -H 'Content-Type: application/json' -X POST $BASE/api/guests \
  -d '{"first_name":"Grace","last_name":"Hopper","email":"grace@example.com"}' | jq .id)
RES=$(curl -s "${auth[@]}" -H 'Content-Type: application/json' -X POST $BASE/api/reservations -d '{
  "primary_guest_id": '"$GID"', "status": "confirmed",
  "rooms": [{"room_type_id":2,"rate_plan_id":1,"arrival":"2026-09-01","departure":"2026-09-03","adults":2}]
}')
RID=$(echo "$RES" | jq .id); LID=$(echo "$RES" | jq '.rooms[0].id')

# 3. assign a room + check in
RM=$(curl -s "${auth[@]}" "$BASE/api/inventory/rooms?room_type_id=2" | jq '.[0].id')
curl -s "${auth[@]}" -H 'Content-Type: application/json' -X POST \
  $BASE/api/frontdesk/reservations/$RID/rooms/$LID/assign -d '{"room_id":'"$RM"'}'
curl -s "${auth[@]}" -X POST $BASE/api/frontdesk/reservations/$RID/checkin

# 4. folio: room-service charge, then nightly room charges
FID=$(curl -s "${auth[@]}" $BASE/api/billing/reservations/$RID/folio | jq .id)
curl -s "${auth[@]}" -H 'Content-Type: application/json' -X POST \
  $BASE/api/billing/folios/$FID/charges \
  -d '{"category":"room_service","description":"Breakfast","amount_minor":3200}'
uv run python -m app.jobs.post_room_charges --date 2026-09-01
uv run python -m app.jobs.post_room_charges --date 2026-09-02

# 5. settle + check out
BAL=$(curl -s "${auth[@]}" $BASE/api/billing/folios/$FID | jq .balance_minor)
curl -s "${auth[@]}" -H 'Content-Type: application/json' -X POST \
  $BASE/api/billing/folios/$FID/payments -d '{"method":"card_terminal","amount_minor":'"$BAL"'}'
curl -s "${auth[@]}" -H 'Content-Type: application/json' -X POST \
  $BASE/api/frontdesk/reservations/$RID/checkout -d '{}'

# 6. audit trail
curl -s "${auth[@]}" "$BASE/api/audit/events?entity_type=reservation&entity_id=$RID" | jq '.items[].event_type'
```

## Jobs

```bash
uv run python -m app.jobs.sync_permissions      # upsert module permissions
uv run python -m app.jobs.seed_demo [--force]   # demo data
uv run python -m app.jobs.post_room_charges [--date YYYY-MM-DD]   # night audit
uv run python -m app.jobs.release_no_shows [--date YYYY-MM-DD]
```

## Quality gates

```bash
# backend
uv run pytest                 # unit + module + e2e (needs pms_test DB)
uv run ruff check .
uv run mypy app
uv run lint-imports           # module boundary contracts (.importlinter)

# frontend
(cd frontend && npm run typecheck && npm run lint && npm run test)
```

`tests/e2e/test_stay_lifecycle.py` covers the walkthrough above;
`tests/modules/test_overbooking_concurrency.py` proves two racing bookings for
the last unit resolve to exactly one winner.

## Project layout

```
app/
  core/       config, db, module contract, registry, event bus,
              service registry, security/RBAC, money, daterange, errors
  modules/<name>/   __init__.py (Module), models, schemas, router,
                    service, events, permissions
  modules/webui/    mounts the built SPA (dist/ is git-ignored)
  jobs/       CLI entrypoints (python -m app.jobs.<name>)
frontend/     React + Vite + TS SPA -> builds to app/modules/webui/dist/
migrations/   single Alembic history
tests/        core / modules / e2e
docs/         architecture.md, ADDING_A_MODULE.md
```

## Notes

- Money is stored as integer minor units (`amount_minor`) + ISO currency.
- Stays are half-open date intervals `[arrival, departure)`.
- Enum columns are stored as checked strings, not native PG enums, so adding a
  value later (new status, payment method, channel) needs no `ALTER TYPE`.
- One SQLAlchemy session per request (`DBSessionMiddleware`), committed before
  the response is sent so a client's immediate read-after-write is consistent.
- `scripts/pg-dev.sh stop` / `destroy` to stop or remove the dev database.
