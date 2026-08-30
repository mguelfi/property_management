from __future__ import annotations

from tests.factories import make_user


def _rule(client, headers):
    return client.post(
        "/api/billing/tax-rules",
        headers=headers,
        json={
            "name": "GST",
            "percent": "10",
            "applies_to_categories": ["room"],
            "sort_order": 10,
        },
    ).json()


def test_patch_tax_rule(client, auth_headers):
    rule = _rule(client, auth_headers)
    resp = client.patch(
        f"/api/billing/tax-rules/{rule['id']}",
        headers=auth_headers,
        json={"is_active": False, "applies_to_categories": ["room", "food_beverage"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_active"] is False
    assert set(body["applies_to_categories"]) == {"room", "food_beverage"}


def test_delete_tax_rule(client, auth_headers):
    rule = _rule(client, auth_headers)
    assert client.delete(
        f"/api/billing/tax-rules/{rule['id']}", headers=auth_headers
    ).status_code == 204
    assert client.get(
        f"/api/billing/tax-rules/{rule['id']}", headers=auth_headers
    ).status_code == 404


def test_tax_rule_write_requires_manage_tax(client, db, auth_headers):
    rule = _rule(client, auth_headers)
    make_user(db, username="viewer", permissions=("billing.view",))
    tok = client.post(
        "/api/auth/login", data={"username": "viewer", "password": "password123"}
    ).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    assert client.get("/api/billing/tax-rules", headers=h).status_code == 200
    assert client.patch(
        f"/api/billing/tax-rules/{rule['id']}", headers=h, json={"name": "x"}
    ).status_code == 403
    assert client.delete(
        f"/api/billing/tax-rules/{rule['id']}", headers=h
    ).status_code == 403
