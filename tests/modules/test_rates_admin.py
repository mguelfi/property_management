from __future__ import annotations

from datetime import date, timedelta

from tests.factories import make_property, make_room_type


def _plan(client, db, headers):
    make_property(db)
    rt = make_room_type(db, code="STD", rooms=1)
    plan = client.post(
        "/api/rates/plans",
        headers=headers,
        json={"code": "BAR", "name": "BAR", "currency": "AUD", "room_type_ids": [rt.id]},
    ).json()
    return plan["id"], rt.id


def test_get_restrictions_reads_back_what_put_set(client, db, auth_headers):
    plan_id, rt_id = _plan(client, db, auth_headers)
    start = date.today()
    end = start + timedelta(days=5)

    put = client.put(
        "/api/rates/restrictions",
        headers=auth_headers,
        json={
            "rate_plan_id": plan_id,
            "room_type_id": rt_id,
            "start_date": str(start),
            "end_date": str(end),
            "min_stay": 2,
            "closed_to_arrival": True,
        },
    )
    assert put.status_code == 200

    got = client.get(
        "/api/rates/restrictions",
        headers=auth_headers,
        params={
            "rate_plan_id": plan_id,
            "start_date": str(start),
            "end_date": str(end),
        },
    )
    assert got.status_code == 200
    rows = got.json()
    assert len(rows) == 5  # half-open [start, end)
    assert all(r["min_stay"] == 2 and r["closed_to_arrival"] for r in rows)
    assert {r["date"] for r in rows} == {
        str(start + timedelta(days=i)) for i in range(5)
    }

    # room_type filter
    filtered = client.get(
        "/api/rates/restrictions",
        headers=auth_headers,
        params={
            "rate_plan_id": plan_id,
            "room_type_id": 999999,
            "start_date": str(start),
            "end_date": str(end),
        },
    )
    assert filtered.json() == []


def test_restrictions_requires_view_permission(client, db):
    from tests.factories import make_user

    make_user(db, username="norates")
    tok = client.post(
        "/api/auth/login", data={"username": "norates", "password": "password123"}
    ).json()["access_token"]
    resp = client.get(
        "/api/rates/restrictions",
        headers={"Authorization": f"Bearer {tok}"},
        params={
            "rate_plan_id": 1,
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=1)),
        },
    )
    assert resp.status_code == 403
