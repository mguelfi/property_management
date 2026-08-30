from __future__ import annotations

from sqlalchemy.orm import Session

from tests.factories import make_user

ADMIN = ("auth.manage_users", "auth.manage_roles")


def _token(client, username: str, password: str = "password123") -> dict[str, str]:
    resp = client.post("/api/auth/login", data={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _admin_headers(client, db: Session):
    make_user(db, username="boss", permissions=ADMIN)
    return _token(client, "boss")


def test_users_list_paginated_and_search(client, db):
    h = _admin_headers(client, db)
    make_user(db, username="alice")
    make_user(db, username="bob")

    resp = client.get("/api/auth/users", headers=h, params={"limit": 2, "offset": 0})
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"items", "total", "limit", "offset"}
    assert body["total"] >= 3
    assert len(body["items"]) == 2

    resp = client.get("/api/auth/users", headers=h, params={"q": "alice"})
    names = [u["username"] for u in resp.json()["items"]]
    assert names == ["alice"]


def test_roles_list_paginated(client, db):
    h = _admin_headers(client, db)
    resp = client.get("/api/auth/roles", headers=h, params={"limit": 100})
    assert resp.status_code == 200
    assert "items" in resp.json()


def test_patch_user_is_superuser(client, db):
    h = _admin_headers(client, db)
    target = make_user(db, username="target")

    make_user(db, username="keepersu", is_superuser=True)  # so target isn't the last

    resp = client.patch(
        f"/api/auth/users/{target.id}", headers=h, json={"is_superuser": True}
    )
    assert resp.status_code == 200
    assert resp.json()["is_superuser"] is True

    resp = client.patch(
        f"/api/auth/users/{target.id}", headers=h, json={"is_superuser": False}
    )
    assert resp.status_code == 200
    assert resp.json()["is_superuser"] is False


def test_cannot_demote_last_superuser(client, db):
    h = _admin_headers(client, db)
    su = make_user(db, username="onlysu", is_superuser=True)
    # there is exactly one active superuser
    resp = client.patch(
        f"/api/auth/users/{su.id}", headers=h, json={"is_superuser": False}
    )
    assert resp.status_code == 409


def test_cannot_demote_self(client, db):
    make_user(db, username="selfsu", is_superuser=True, permissions=ADMIN)
    make_user(db, username="othersu", is_superuser=True)
    h = _token(client, "selfsu")
    me = client.get("/api/auth/me", headers=h).json()
    resp = client.patch(
        f"/api/auth/users/{me['id']}", headers=h, json={"is_superuser": False}
    )
    assert resp.status_code == 409


def test_patch_user_username_uniqueness(client, db):
    h = _admin_headers(client, db)
    make_user(db, username="taken")
    target = make_user(db, username="rename-me")
    resp = client.patch(
        f"/api/auth/users/{target.id}", headers=h, json={"username": "taken"}
    )
    assert resp.status_code == 422


def test_reset_password_explicit(client, db):
    h = _admin_headers(client, db)
    target = make_user(db, username="pwuser", password="oldpassword1")
    resp = client.post(
        f"/api/auth/users/{target.id}/reset-password",
        headers=h,
        json={"password": "brandnewpw9"},
    )
    assert resp.status_code == 200
    assert resp.json()["password"] is None
    assert client.post(
        "/api/auth/login", data={"username": "pwuser", "password": "oldpassword1"}
    ).status_code == 401
    assert client.post(
        "/api/auth/login", data={"username": "pwuser", "password": "brandnewpw9"}
    ).status_code == 200


def test_reset_password_generated(client, db):
    h = _admin_headers(client, db)
    target = make_user(db, username="genpw", password="oldpassword1")
    resp = client.post(
        f"/api/auth/users/{target.id}/reset-password", headers=h, json={}
    )
    assert resp.status_code == 200
    generated = resp.json()["password"]
    assert generated
    assert client.post(
        "/api/auth/login", data={"username": "genpw", "password": generated}
    ).status_code == 200


def test_delete_user_soft_deactivates(client, db):
    h = _admin_headers(client, db)
    target = make_user(db, username="goner")
    resp = client.delete(f"/api/auth/users/{target.id}", headers=h)
    assert resp.status_code == 204
    db.expire_all()
    assert client.get(f"/api/auth/users/{target.id}", headers=h).json()["is_active"] is False
    assert client.post(
        "/api/auth/login", data={"username": "goner", "password": "password123"}
    ).status_code == 401


def test_delete_role_unused_and_in_use(client, db):
    h = _admin_headers(client, db)
    from tests.factories import make_role

    free = make_role(db, code="free_role")
    resp = client.delete(f"/api/auth/roles/{free.id}", headers=h)
    assert resp.status_code == 204

    used = make_role(db, code="used_role")
    u = make_user(db, username="hasrole")
    u.roles = [used]
    db.flush()
    resp = client.delete(f"/api/auth/roles/{used.id}", headers=h)
    assert resp.status_code == 409


def test_admin_endpoints_require_permission(client, db):
    make_user(db, username="nobody")
    h = _token(client, "nobody")
    assert client.get("/api/auth/users", headers=h).status_code == 403
    assert client.get("/api/auth/roles", headers=h).status_code == 403
    assert client.post("/api/auth/users/1/reset-password", headers=h, json={}).status_code == 403
    assert client.delete("/api/auth/users/1", headers=h).status_code == 403
