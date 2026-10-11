"""Persistent login: login cookie has a 400-day Max-Age; GET /api/auth/me re-issues it."""
import httpx

from tests.conftest import api_url

PW = "Demo@123"
EXPECTED_MAX_AGE = 400 * 24 * 3600  # 34,560,000 seconds


def _max_age(set_cookie: str) -> int:
    for part in set_cookie.split(";"):
        part = part.strip()
        if part.lower().startswith("max-age="):
            return int(part.split("=", 1)[1])
    raise AssertionError(f"no Max-Age in Set-Cookie: {set_cookie}")


def test_login_sets_400_day_cookie():
    r = httpx.post(api_url("/auth/login"), json={"email": "agent@talksme.in", "password": PW})
    assert r.status_code == 200, r.text
    set_cookie = r.headers.get("set-cookie", "")
    assert "omni_session=" in set_cookie
    assert _max_age(set_cookie) == EXPECTED_MAX_AGE


def test_auth_me_reissues_cookie():
    login = httpx.post(api_url("/auth/login"), json={"email": "agent@talksme.in", "password": PW})
    assert login.status_code == 200, login.text
    token = login.cookies["omni_session"]

    r = httpx.get(api_url("/auth/me"), headers={"Cookie": f"omni_session={token}"})
    assert r.status_code == 200, r.text
    set_cookie = r.headers.get("set-cookie", "")
    assert "omni_session=" in set_cookie
    assert _max_age(set_cookie) == EXPECTED_MAX_AGE
