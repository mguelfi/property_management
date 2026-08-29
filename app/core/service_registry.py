"""Cross-module service wiring.

A module that owns a capability (e.g. ``availability`` owns
``AvailabilityService``) registers its implementation here during ``on_startup``.
Consumers look it up by the Protocol/ABC type defined in ``app.core.services``,
so no module needs to import another module's package.
"""

from __future__ import annotations

from typing import TypeVar

T = TypeVar("T")

_services: dict[type, object] = {}


def register_service[T](interface: type[T], impl: T) -> None:
    _services[interface] = impl


def get_service[T](interface: type[T]) -> T:
    try:
        return _services[interface]  # type: ignore[return-value]
    except KeyError:
        raise LookupError(
            f"No implementation registered for {interface.__name__}. "
            "Is the providing module enabled?"
        ) from None


def clear_services() -> None:
    _services.clear()
