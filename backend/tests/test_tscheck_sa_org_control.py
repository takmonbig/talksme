"""Super Admin org control: search, bulk actions (seats) on a fresh org, secure reset-link
generation, and the danger-zone reset-preview + wrong-password rejection.

Uses a brand new org created via POST /superadmin/organizations for anything destructive
(bulk seats, reset-preview). org-talksme (seed data) is only ever read, never mutated.
"""
import uuid

import httpx

from tests.conftest import api_url

PW = "Demo@123"


def login(email: str) -> dict:
    r = httpx.post(api_url("/auth/login"), json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Cookie": f"omni_session={r.cookies['omni_session']}"}


def sa_headers() -> dict:
    return login("superadmin@talksme.in")


def create_org(h: dict) -> dict:
    plans = httpx.get(api_url("/superadmin/plans"), headers=h)
    assert plans.status_code == 200, plans.text
    plan_id = plans.json()[0]["id"]
    suffix = uuid.uuid4().hex[:10]
    body = {
        "name": f"tscheck-org-{suffix}",
        "slug": f"tscheck-org-{suffix}",
        "plan_id": plan_id,
        "seats": 3,
        "admin_name": "TsCheck Admin",
        "admin_email": f"tscheck-admin-{suffix}@example.com",
        "admin_password": "Demo@123456",
        "trial": True,
    }
    r = httpx.post(api_url("/superadmin/organizations"), headers=h, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_org_search_finds_org_by_admin_email():
    h = sa_headers()
    r = httpx.get(api_url("/superadmin/org-search"), headers=h, params={"q": "admin@talksme.in"})
    assert r.status_code == 200, r.text
    assert "org-talksme" in r.json(), r.text


def test_bulk_seats_on_fresh_org():
    h = sa_headers()
    org = create_org(h)
    oid = org["id"]
    try:
        r = httpx.post(api_url("/superadmin/organizations/bulk"), headers=h, json={"ids": [oid], "action": "seats", "seats": 25, "reason": "tscheck bulk seats"})
        assert r.status_code == 200, r.text
        assert r.json()["updated"] == 1
        rows = httpx.get(api_url("/superadmin/organizations"), headers=h).json()
        row = next(x for x in rows if x["id"] == oid)
        assert row["seats"] == 25

        # destructive bulk action without a reason must be rejected by validation upstream (frontend);
        # backend itself is permissive on reason content but requires the field to exist and action to be valid.
        r2 = httpx.post(api_url("/superadmin/organizations/bulk"), headers=h, json={"ids": [oid], "action": "bogus-action", "reason": "x"})
        assert r2.status_code in (404, 422), r2.text
    finally:
        httpx.post(api_url("/superadmin/organizations/bulk"), headers=h, json={"ids": [oid], "action": "delete", "reason": "tscheck cleanup"})


def test_reset_link_generated_and_single_use():
    h = sa_headers()
    org = create_org(h)
    oid = org["id"]
    try:
        details = httpx.get(api_url(f"/superadmin/organizations/{oid}/details"), headers=h)
        assert details.status_code == 200, details.text
        admin_user = next(u for u in details.json()["staff"] if u["role"] == "admin")
        r = httpx.post(api_url(f"/superadmin/users/{admin_user['id']}/reset-link"), headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "/reset-password?token=" in data["url"], data
        token = data["url"].split("token=")[1]

        use1 = httpx.post(api_url("/auth/reset-password"), json={"token": token, "password": "NewPass12345"})
        assert use1.status_code == 200, use1.text

        use2 = httpx.post(api_url("/auth/reset-password"), json={"token": token, "password": "AnotherPass123"})
        assert use2.status_code == 400, use2.text
    finally:
        httpx.post(api_url("/superadmin/organizations/bulk"), headers=h, json={"ids": [oid], "action": "delete", "reason": "tscheck cleanup"})


def test_danger_zone_reset_preview_and_wrong_password():
    h = sa_headers()
    org = create_org(h)
    oid = org["id"]
    try:
        preview = httpx.get(api_url(f"/superadmin/organizations/{oid}/reset-preview"), headers=h)
        assert preview.status_code == 200, preview.text
        assert preview.json()["org_name"] == org["name"]
        assert "conversations" in preview.json()["will_reset"]

        bad = httpx.post(api_url(f"/superadmin/organizations/{oid}/reset"), headers=h,
                          json={"password": "wrong-password", "confirm_name": org["name"], "reason": "tscheck wrong pw"})
        assert bad.status_code == 403, bad.text

        bad_name = httpx.post(api_url(f"/superadmin/organizations/{oid}/reset"), headers=h,
                               json={"password": PW, "confirm_name": "not the org name", "reason": "tscheck wrong name"})
        assert bad_name.status_code == 422, bad_name.text

        # org-talksme is never targeted here; only the fresh org created by this test is used.
    finally:
        httpx.post(api_url("/superadmin/organizations/bulk"), headers=h, json={"ids": [oid], "action": "delete", "reason": "tscheck cleanup"})
