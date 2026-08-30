"""GST-inclusive tax: charge prices already contain the tax; the tax portion is
recorded on the charge line (amount / 11 for 10%) and does not change the balance."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from tests.factories import make_guest, make_property, make_rate_plan, make_room_type


@pytest.fixture
def world(db):
    make_property(db)
    rt = make_room_type(db, code="STD", rooms=2)
    plan = make_rate_plan(db, [rt], nightly_minor=20000)
    guest = make_guest(db, last_name="Curie")
    return {"rt": rt, "plan": plan, "guest": guest}


def _folio_id(client, auth_headers, world) -> int:
    arrival = date.today()
    res = client.post(
        "/api/reservations",
        headers=auth_headers,
        json={
            "primary_guest_id": world["guest"].id,
            "status": "confirmed",
            "rooms": [
                {
                    "room_type_id": world["rt"].id,
                    "rate_plan_id": world["plan"].id,
                    "arrival": arrival.isoformat(),
                    "departure": (arrival + timedelta(days=1)).isoformat(),
                    "adults": 1,
                }
            ],
        },
    ).json()
    return client.get(
        f"/api/billing/reservations/{res['id']}/folio", headers=auth_headers
    ).json()["id"]


def _gst_rule(client, auth_headers, *, inclusive: bool, categories=("misc",)):
    return client.post(
        "/api/billing/tax-rules",
        headers=auth_headers,
        json={
            "name": "GST",
            "percent": "10",
            "tax_inclusive": inclusive,
            "applies_to_categories": list(categories),
        },
    )


def test_inclusive_gst_does_not_change_balance(client, auth_headers, world):
    fid = _folio_id(client, auth_headers, world)
    _gst_rule(client, auth_headers, inclusive=True)

    folio = client.post(
        f"/api/billing/folios/{fid}/charges",
        headers=auth_headers,
        json={"category": "misc", "description": "Late checkout", "amount_minor": 11000},
    ).json()

    assert folio["balance_minor"] == 11000  # unchanged by GST
    assert folio["gst_minor"] == 1000  # 11000 / 11
    charge_lines = [ln for ln in folio["lines"] if ln["kind"] == "charge"]
    tax_lines = [ln for ln in folio["lines"] if ln["kind"] == "tax"]
    assert tax_lines == []  # no separate line
    assert charge_lines[0]["tax_component_minor"] == 1000


def test_inclusive_gst_rounds_half_up(client, auth_headers, world):
    fid = _folio_id(client, auth_headers, world)
    _gst_rule(client, auth_headers, inclusive=True)

    # 2505 / 11 = 227.72... -> 228
    folio = client.post(
        f"/api/billing/folios/{fid}/charges",
        headers=auth_headers,
        json={"category": "misc", "description": "Minibar", "amount_minor": 2505},
    ).json()
    assert folio["balance_minor"] == 2505
    assert folio["gst_minor"] == 228


def test_exclusive_rule_still_adds_a_line(client, auth_headers, world):
    fid = _folio_id(client, auth_headers, world)
    _gst_rule(client, auth_headers, inclusive=False)

    folio = client.post(
        f"/api/billing/folios/{fid}/charges",
        headers=auth_headers,
        json={"category": "misc", "description": "Service fee", "amount_minor": 10000},
    ).json()
    assert folio["balance_minor"] == 11000  # 10000 + 1000 added
    assert folio["gst_minor"] == 1000
    assert any(ln["kind"] == "tax" for ln in folio["lines"])


def test_void_charge_drops_its_gst(client, auth_headers, world):
    fid = _folio_id(client, auth_headers, world)
    _gst_rule(client, auth_headers, inclusive=True)
    folio = client.post(
        f"/api/billing/folios/{fid}/charges",
        headers=auth_headers,
        json={"category": "misc", "description": "x", "amount_minor": 11000},
    ).json()
    line_id = next(ln["id"] for ln in folio["lines"] if ln["kind"] == "charge")
    voided = client.post(
        f"/api/billing/lines/{line_id}/void",
        headers=auth_headers,
        json={"reason": "mistake"},
    ).json()
    assert voided["balance_minor"] == 0
    assert voided["gst_minor"] == 0


def test_empty_categories_applies_to_all(client, auth_headers, world):
    fid = _folio_id(client, auth_headers, world)
    _gst_rule(client, auth_headers, inclusive=True, categories=[])
    folio = client.post(
        f"/api/billing/folios/{fid}/charges",
        headers=auth_headers,
        json={"category": "food_beverage", "description": "Dinner", "amount_minor": 5500},
    ).json()
    assert folio["gst_minor"] == 500


def test_invoice_reports_gst(client, auth_headers, world):
    fid = _folio_id(client, auth_headers, world)
    _gst_rule(client, auth_headers, inclusive=True)
    client.post(
        f"/api/billing/folios/{fid}/charges",
        headers=auth_headers,
        json={"category": "misc", "description": "x", "amount_minor": 11000},
    )
    client.post(
        f"/api/billing/folios/{fid}/payments",
        headers=auth_headers,
        json={"method": "cash", "amount_minor": 11000},
    )
    inv = client.post(
        f"/api/billing/folios/{fid}/invoice", headers=auth_headers, json={}
    ).json()
    summary = next(row for row in inv["lines_json"] if row.get("kind") == "summary")
    assert summary["gst_minor"] == 1000
    assert summary["charged_minor"] == 11000
