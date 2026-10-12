"""Old global demo reset endpoint must be gone: POST /api/demo/reset -> 404/405 for any user."""
import httpx

from tests.conftest import api_url

PW = "Demo@123"


def login(email: str) -> dict:
    r = httpx.post(api_url("/auth/login"), json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Cookie": f"omni_session={r.cookies['omni_session']}"}


def test_demo_reset_gone_unauthenticated():
    r = httpx.post(api_url("/demo/reset"))
    assert r.status_code in (404, 405), r.text


def test_demo_reset_gone_superadmin():
    h = login("superadmin@talksme.in")
    r = httpx.post(api_url("/demo/reset"), headers=h)
    assert r.status_code in (404, 405), r.text
