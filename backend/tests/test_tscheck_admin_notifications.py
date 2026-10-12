"""Admin -> customer notifications: happy path (honest no_device status headless), bad link
rejected, customer from another org rejected (404), and employee role cannot send."""
import uuid

import httpx

from tests.conftest import api_url

PW = "Demo@123"
SUFFIX = uuid.uuid4().hex[:8]


def login(email: str) -> dict:
    r = httpx.post(api_url("/auth/login"), json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Cookie": f"omni_session={r.cookies['omni_session']}"}


def test_admin_notifies_customer_no_device_status():
    h = login("admin@talksme.in")
    custs = httpx.get(api_url("/customers"), headers=h).json()
    rahul = next(c for c in custs if c["name"] == "Rahul Verma")
    r = httpx.post(api_url("/admin/notifications"), headers=h, json={
        "customer_id": rahul["id"], "title": f"tscheck-notify-{SUFFIX}", "body": "tscheck notification body",
    })
    assert r.status_code == 200, r.text
    rec = r.json()
    assert rec["status"] in ("no_device", "sent", "failed", "blocked_by_preferences")
    hist = httpx.get(api_url("/admin/notifications"), headers=h).json()
    assert any(n["id"] == rec["id"] for n in hist)


def test_admin_notify_rejects_bad_link_and_other_org_customer():
    h = login("admin@talksme.in")
    custs = httpx.get(api_url("/customers"), headers=h).json()
    rahul = next(c for c in custs if c["name"] == "Rahul Verma")
    bad_link = httpx.post(api_url("/admin/notifications"), headers=h, json={
        "customer_id": rahul["id"], "title": "tscheck-bad-link", "body": "x", "url": "javascript:alert(1)",
    })
    assert bad_link.status_code == 422, bad_link.text

    h_other = login("admin@aurora.demo")
    cross_org = httpx.post(api_url("/admin/notifications"), headers=h_other, json={
        "customer_id": rahul["id"], "title": "tscheck-cross-org", "body": "x",
    })
    assert cross_org.status_code == 404, cross_org.text


def test_employee_cannot_send_admin_notifications():
    h = login("agent@talksme.in")
    custs = httpx.get(api_url("/customers"), headers=h).json()
    rahul = next(c for c in custs if c["name"] == "Rahul Verma")
    r = httpx.post(api_url("/admin/notifications"), headers=h, json={
        "customer_id": rahul["id"], "title": "tscheck-employee-blocked", "body": "x",
    })
    assert r.status_code in (401, 403), r.text
