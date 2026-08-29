# Architecture

## Goal

A small core plus feature modules with **enforced boundaries**, so new
capabilities (POS, restaurant, housekeeping, channel connectors) are added
without editing existing modules. One deployment, one database, one migration
history.

## The module contract

Each feature lives in `app/modules/<name>/` and its `__init__.py` exposes a
module-level `module = Module(...)` (`app/core/module.py`):

```python
Module(
    name="reservations",
    router=router,                       # mounted at /api/<name>
    tags=("reservations",),
    dependencies=("auth", "inventory", "rates", "guests", "availability"),
    permissions=PERMISSIONS,              # (code, description) pairs
    event_handlers=((SomeEvent, handler),),
    on_startup=_startup,                  # register service impls here
)
```

Conventional files per module: `models.py`, `schemas.py`, `router.py`,
`service.py`, `events.py`, `permissions.py`.

### Boundary rule

A module may import from `app.core` and from modules named in its own
`dependencies` only. This is enforced in CI by **import-linter**
(`.importlinter`, one `forbidden` contract per module, `allow_indirect_imports`
so a dependency's own imports don't leak through).

Two escape hatches for talking across a boundary you don't depend on:

1. **Events** (fire-and-forget notifications) — publish on the bus; other
   modules subscribe.
2. **Core service interfaces** (synchronous calls) — a `Protocol` in
   `app/core/services.py`, implemented by the owning module and looked up by
   type.

## The registry

`app/core/registry.py`:

1. `load_modules()` imports each enabled module, reads its `Module`, and
   topologically sorts by `dependencies` (errors on cycle / missing dep).
2. `build_app()` creates the `FastAPI` app, mounts each router, subscribes
   event handlers, and calls each `on_startup` in dependency order.
3. `import_model_metadata()` imports every module's `models` submodule so
   `Base.metadata` is complete — used by Alembic (`migrations/env.py`) and by
   the test schema builder.

`app/main.py` is just `build_app(get_settings())`.

## Event bus

`app/core/events.py` — synchronous, in-process pub/sub. A handler runs inside
the publisher's transaction and receives the active `Session`, so a
subscriber's writes commit or roll back atomically with the triggering action.
A failing handler is logged and swallowed; it never aborts the business
operation.

Events are dataclasses subclassing `Event`, defined next to their owning module
(`reservations/events.py`, `frontdesk/events.py`). Publish with
`bus.publish(event, session)`.

Current events: `ReservationConfirmed`, `ReservationCancelled`,
`ReservationNoShow`, `ReservationModified`, `GuestCheckedIn`, `GuestCheckedOut`,
`RoomAssigned`. The `audit` module subscribes to the `Event` base class and
records every one.

## Cross-module services

`app/core/services.py` defines `Protocol`s plus their DTOs:

- `AvailabilityService` — `search`, `quote`, `reserve`, `release`.
  Implemented by `availability`; used by `reservations` (and, later, `channels`
  and the booking site).
- `FolioService` — `get_or_open_folio`, `post_charge`, `post_payment`,
  `balance_minor`, `close_folio`. Implemented by `billing`; used by `frontdesk`
  and the night-audit job.

The owning module calls `register_service(Interface, impl)` in its `on_startup`;
consumers call `get_service(Interface)` (or the FastAPI deps in
`app/core/deps.py`). No module imports another module's package to do this.

## Data conventions

- **One `Base`/`MetaData`** (`app/core/db.py`); one Alembic history.
- **Sync SQLAlchemy 2.0.** FastAPI runs sync endpoints in a threadpool. PMS
  concurrency is low; sync keeps locking easy to reason about.
- **Money**: integer `amount_minor` + `currency`; `app/core/money.Money` does
  `Decimal` arithmetic and rounds to the minor unit.
- **Dates**: half-open `[arrival, departure)`. Helpers in
  `app/core/daterange.py`.
- **Enums**: `str_enum()` in `app/core/db.py` — stored as VARCHAR + CHECK, not
  native PG `ENUM`, so new values don't need `ALTER TYPE` migrations.

## Oversell protection

`availability.InventoryLedger` has one row per `(room_type, night)` holding
`sold_units`. `AvailabilityService.reserve()` does, per night, inside the
caller's transaction:

1. `INSERT ... ON CONFLICT DO NOTHING` to ensure the row exists,
2. `SELECT ... FOR UPDATE` to lock it,
3. compare `sold_units + n` against capacity (active rooms − blocks +
   `overbooking_allowance`), raise `NoAvailability` or increment.

Two concurrent bookings for the last unit serialize on the row lock; exactly
one succeeds (`tests/modules/test_overbooking_concurrency.py`).

## Reservation lifecycle

```
inquiry ──confirm──▶ confirmed ──check-in──▶ in_house ──check-out──▶ checked_out
   │                    │  │
   └──cancel──▶ cancelled  └──no-show──▶ no_show
```

`confirmed` and `in_house` hold inventory (`ACTIVE_STATUSES`). Entering them
calls `AvailabilityService.reserve`; leaving them (`cancel`, `no_show`,
`modify_rooms`) calls `release`. Rate and cancellation-policy details are
snapshotted onto the reservation at creation so later rate changes don't
rewrite history.
