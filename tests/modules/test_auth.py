from app.core.security import hash_password
from app.modules.auth.models import Permission, Role, User


def test_login_and_me(client, superuser):
    resp = client.post("/api/auth/login", data={"username": "root", "password": "secret123"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "root"
    assert me.json()["is_superuser"] is True


def test_bad_login(client, superuser):
    resp = client.post("/api/auth/login", data={"username": "root", "password": "nope"})
    assert resp.status_code == 401


def test_permission_enforced(client, db):
    perm = Permission(code="inventory.manage", description="")
    db.add(perm)
    role = Role(code="clerk", name="Clerk", permissions=[perm])
    db.add(role)
    limited = User(
        username="clerk", hashed_password=hash_password("secret123"), roles=[role]
    )
    db.add(limited)
    db.flush()

    token = client.post(
        "/api/auth/login", data={"username": "clerk", "password": "secret123"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # has inventory.manage, lacks inventory.view -> can create, cannot list
    assert client.get("/api/inventory/room-types", headers=headers).status_code == 403
    created = client.post(
        "/api/inventory/room-types",
        headers=headers,
        json={"code": "AAA", "name": "A"},
    )
    assert created.status_code == 201


def test_unauthenticated_rejected(client):
    assert client.get("/api/inventory/room-types").status_code == 401
