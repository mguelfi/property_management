from datetime import date, timedelta

import pytest

from app.core.errors import NoAvailability, RateClosed, ValidationProblem
from app.modules.availability.service import service_impl
from app.modules.rates import service as rates_service
from tests.factories import make_property, make_rate_plan, make_room_type


@pytest.fixture
def setup(db):
    make_property(db)
    rt = make_room_type(db, rooms=2)
    plan = make_rate_plan(db, [rt], nightly_minor=20000)
    return rt, plan


def test_search_returns_units_and_price(db, setup):
    rt, plan = setup
    a = date.today() + timedelta(days=3)
    offers = service_impl.search(db, arrival=a, departure=a + timedelta(days=2), adults=2)
    offer = next(o for o in offers if o.room_type_id == rt.id)
    assert offer.units_available == 2
    assert offer.cheapest is not None
    assert offer.cheapest.total_minor == 40000


def test_search_excludes_room_types_too_small_for_the_party(db, setup):
    rt, _ = setup  # max_occupancy=2 (factory default)
    a = date.today() + timedelta(days=3)
    offers = service_impl.search(db, arrival=a, departure=a + timedelta(days=2), adults=5)
    assert not any(o.room_type_id == rt.id for o in offers)


def test_multi_room_search_ignores_party_size_for_a_single_room(db, setup):
    rt, _ = setup  # max_occupancy=2 (factory default)
    a = date.today() + timedelta(days=3)
    offers = service_impl.search(
        db, arrival=a, departure=a + timedelta(days=2), adults=5, multi_room=True
    )
    assert any(o.room_type_id == rt.id for o in offers)


def test_multi_room_query_param_reaches_the_service(client, auth_headers, db, setup):
    rt, _ = setup  # max_occupancy=2 (factory default)
    a = date.today() + timedelta(days=3)
    params = {
        "arrival": a.isoformat(),
        "departure": (a + timedelta(days=2)).isoformat(),
        "adults": 5,
    }
    without = client.get("/api/availability", params=params, headers=auth_headers).json()
    assert not any(o["room_type_id"] == rt.id for o in without)

    with_multi = client.get(
        "/api/availability", params={**params, "multi_room": True}, headers=auth_headers
    ).json()
    assert any(o["room_type_id"] == rt.id for o in with_multi)


def test_quote_breakdown(db, setup):
    rt, plan = setup
    a = date.today() + timedelta(days=3)
    q = service_impl.quote(
        db, room_type_id=rt.id, rate_plan_id=plan.id, arrival=a, departure=a + timedelta(days=3)
    )
    assert [n.amount_minor for n in q.nights] == [20000, 20000, 20000]
    assert q.total_minor == 60000


def test_closed_rate_blocks_quote(db, setup):
    rt, plan = setup
    a = date.today() + timedelta(days=3)
    rates_service.set_restrictions(
        db, rate_plan_id=plan.id, room_type_id=rt.id,
        start_date=a, end_date=a + timedelta(days=1), closed=True,
    )
    with pytest.raises(RateClosed):
        service_impl.quote(
            db, room_type_id=rt.id, rate_plan_id=plan.id,
            arrival=a, departure=a + timedelta(days=2),
        )


def test_min_stay_flagged(db, setup):
    rt, plan = setup
    a = date.today() + timedelta(days=3)
    rates_service.set_restrictions(
        db, rate_plan_id=plan.id, room_type_id=rt.id,
        start_date=a, end_date=a + timedelta(days=1), min_stay=3,
    )
    with pytest.raises(ValidationProblem):
        service_impl.quote(
            db, room_type_id=rt.id, rate_plan_id=plan.id,
            arrival=a, departure=a + timedelta(days=2),
        )


def test_reserve_consumes_inventory_then_blocks(db, setup):
    rt, _ = setup
    a = date.today() + timedelta(days=3)
    d = a + timedelta(days=1)
    service_impl.reserve(db, room_type_id=rt.id, arrival=a, departure=d)
    service_impl.reserve(db, room_type_id=rt.id, arrival=a, departure=d)
    with pytest.raises(NoAvailability):
        service_impl.reserve(db, room_type_id=rt.id, arrival=a, departure=d)
    service_impl.release(db, room_type_id=rt.id, arrival=a, departure=d)
    service_impl.reserve(db, room_type_id=rt.id, arrival=a, departure=d)  # room freed


def test_overbooking_allowance(db):
    make_property(db)
    rt = make_room_type(db, code="OB", rooms=1, overbooking_allowance=1)
    make_rate_plan(db, [rt])
    a = date.today() + timedelta(days=3)
    d = a + timedelta(days=1)
    service_impl.reserve(db, room_type_id=rt.id, arrival=a, departure=d)
    service_impl.reserve(db, room_type_id=rt.id, arrival=a, departure=d)  # allowed by +1
    with pytest.raises(NoAvailability):
        service_impl.reserve(db, room_type_id=rt.id, arrival=a, departure=d)
