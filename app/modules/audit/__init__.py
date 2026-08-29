from __future__ import annotations

from app.core.events import Event
from app.core.module import Module

from .router import router
from .service import record_event

module = Module(
    name="audit",
    router=router,
    tags=("audit",),
    dependencies=("auth",),
    permissions=(("audit.view", "View the audit trail"),),
    event_handlers=((Event, record_event),),
)
