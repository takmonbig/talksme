"""Optional WhatsApp backup number for no-login guests: save, conflict, skip."""
import random

import httpx

from tests.conftest import api_url


def new_guest() -> httpx.Client:
    """Starts a fresh guest chat on the talksme/support landing page and returns a client carrying its
    session cookie as a header (the cookie is Secure, so a plain-http httpx jar won't resend it)."""
    c = httpx.Client(timeout=30.0)
    r = c.post(api_url("/public/landing/talksme/support/start"), json={})
    assert r.status_code == 200, r.text
    token = r.cookies.get("omni_session")
    assert token, "no omni_session cookie set by /start"
    c.headers["Cookie"] = f"omni_session={token}"
    return c


def test_backup_phone_fresh_number_saved():
    c = new_guest()
    fresh = "7" + str(random.randint(100000000, 999999999))
    r = c.post(api_url("/me/backup-phone"), json={"country_code": "+91", "phone": fresh})
    assert r.status_code == 200, r.text
    assert "saved" in r.json()["message"].lower()

    me = c.get(api_url("/auth/me"))
    assert me.status_code == 200
    assert me.json()["phone"] == f"+91{fresh}"
    c.close()


def test_backup_phone_owned_number_conflict_409():
    c = new_guest()
    r = c.post(api_url("/me/backup-phone"), json={"country_code": "+91", "phone": "9800000001"})
    assert r.status_code == 409, r.text
    assert "restore" in r.text.lower()
    c.close()


def test_backup_phone_skip():
    c = new_guest()
    r = c.post(api_url("/me/backup-phone/skip"))
    assert r.status_code == 200, r.text
    c.close()
