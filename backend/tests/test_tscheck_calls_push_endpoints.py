"""Backend endpoints criterion: ICE servers, push subscribe validation, push key, auth gating."""
import httpx

from tests.conftest import api_url

PW = "Demo@123"


def login(email: str) -> dict:
    r = httpx.post(api_url("/auth/login"), json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Cookie": f"omni_session={r.cookies['omni_session']}"}


def test_ice_servers_authed_returns_array():
    h = login("agent@talksme.in")
    r = httpx.get(api_url("/calls/ice-servers"), headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "ice_servers" in body and isinstance(body["ice_servers"], list)


def test_ice_servers_unauthenticated_401():
    r = httpx.get(api_url("/calls/ice-servers"))
    assert r.status_code == 401, r.text


def test_push_subscribe_non_https_endpoint_422():
    h = login("agent@talksme.in")
    r = httpx.post(
        api_url("/push/subscribe"),
        headers=h,
        json={"endpoint": "http://not-https.example.com/push", "keys": {"p256dh": "abc", "auth": "def"}},
    )
    assert r.status_code == 422, r.text


def test_push_key_returns_public_key():
    r = httpx.get(api_url("/push/key"))
    assert r.status_code == 200, r.text
    assert "public_key" in r.json()
