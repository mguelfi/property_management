# Adding a module

Worked example: a `housekeeping` module that marks rooms dirty on check-out.

## 1. Scaffold

```
app/modules/housekeeping/
  __init__.py      # the Module object
  models.py        # RoomHousekeepingState, HousekeepingTask
  schemas.py       # Pydantic in/out
  router.py        # APIRouter (no prefix; registry mounts /api/housekeeping)
  service.py       # business logic, functions take a Session
  events.py        # events this module publishes (if any)
  permissions.py   # PERMISSIONS = (("housekeeping.view", "..."), ...)
```

## 2. Declare the module

```python
# app/modules/housekeeping/__init__.py
from app.core.module import Module
from app.modules.frontdesk.events import GuestCheckedOut
from .permissions import PERMISSIONS
from .router import router
from .service import on_guest_checked_out

module = Module(
    name="housekeeping",
    router=router,
    tags=("housekeeping",),
    dependencies=("auth", "inventory"),          # what you may import
    permissions=PERMISSIONS,
    event_handlers=((GuestCheckedOut, on_guest_checked_out),),
)
```

Subscribing to `frontdesk`'s event does **not** require depending on
`frontdesk`'s package if you only import the event class — but the cleanest
rule is: if you import anything from a module, list it in `dependencies`.
Events you consume are fine to import; add the module to `dependencies`.

## 3. Models

Inherit `Base` from `app.core.db`. Prefix table names (`hk_...`). Use
`str_enum()` for enum columns. FKs to other modules' tables are fine (string
table names).

## 4. Wire it up

- Add `housekeeping` to `PMS_ENABLED_MODULES` (order doesn't matter).
- Add an import-linter contract in `.importlinter` (copy an existing
  `*-boundaries` block) listing the modules `housekeeping` must **not** import.
- Generate a migration:

  ```bash
  uv run alembic revision --autogenerate -m "add housekeeping"
  uv run alembic upgrade head
  ```

- `uv run python -m app.jobs.sync_permissions` to register the new permission
  codes.

## 5. Cross-module calls

- **Notify** other modules → publish an event (`events.py` + `bus.publish`).
- **Query/command** another module synchronously → define a `Protocol` in
  `app/core/services.py`, implement it here, `register_service(...)` in
  `on_startup`, and let consumers `get_service(...)`.
- Never `import app.modules.other` unless `other` is in your `dependencies`.

## 6. Tests

Add `tests/modules/test_housekeeping.py`. Use the `db` / `client` /
`auth_headers` fixtures from `tests/conftest.py` and the builders in
`tests/factories.py`.

## Checklist

- [ ] `module = Module(...)` exported from `__init__.py`, `name` matches package
- [ ] `dependencies` lists every module you import from
- [ ] table names prefixed; enum columns use `str_enum`
- [ ] `.importlinter` contract added
- [ ] Alembic migration generated + `alembic check` clean
- [ ] permissions declared and `sync_permissions` run
- [ ] added to `PMS_ENABLED_MODULES` (and `DEFAULT_MODULES` if always-on)
- [ ] tests
