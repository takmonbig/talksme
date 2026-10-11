"""Push subscribe: a valid https endpoint succeeds and flips the user's notify_push flag to true."""
import time

import httpx

from tests.conftest import api_url

PW = "Demo@123"


def login(email: str) -> dict:
    r = httpx.post(api_url("/auth/login"), json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Cookie": f"omni_session={r.cookies['omni_session']}"}


def test_push_subscribe_https_endpoint_sets_notify_push_true():
    h = login("agent@talksme.in")
    endpoint = f"https://fcm.googleapis.com/fcm/send/tscheck-{int(time.time())}"
    r = httpx.post(
        api_url("/push/subscribe"),
        headers=h,
        json={"endpoint": endpoint, "keys": {"p256dh": "abcdefghijklmnop", "auth": "abcdefghij"}},
    )
    assert r.status_code == 200, r.text

    me = httpx.get(api_url("/auth/me"), headers=h)
    assert me.status_code == 200, me.text
    assert me.json()["notify_push"] is True
