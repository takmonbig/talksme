"""Admin landing pages: create own page (two template types, default message + auto-send
flags), delete own page, and cross-org delete must 404 (not another org's Admin can delete it)."""
import uuid

import httpx

from tests.conftest import api_url

PW = "Demo@123"
SUFFIX = uuid.uuid4().hex[:8]


def login(email: str) -> dict:
    r = httpx.post(api_url("/auth/login"), json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Cookie": f"omni_session={r.cookies['omni_session']}"}


def make_lp(h: dict, template: str) -> dict:
    body = {
        "title": f"tscheck-lp-{SUFFIX}-{template}",
        "slug": f"tscheck-lp-{SUFFIX}-{template}".lower(),
        "template": template,
        "default_message": "Hi, I'd like to know more",
        "auto_send_default": template == "B",
        "cta_text": "Chat Now",
    }
    r = httpx.post(api_url("/admin/landing-pages"), headers=h, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_create_both_template_types_with_default_message():
    h = login("admin@talksme.in")
    lp_a = make_lp(h, "A")
    lp_b = make_lp(h, "B")
    try:
        assert lp_a["template"] == "A"
        assert lp_a["default_message"] == "Hi, I'd like to know more"
        assert lp_b["template"] == "B"
        assert lp_b["auto_send_default"] is True
    finally:
        httpx.delete(api_url(f"/admin/landing-pages/{lp_a['id']}"), headers=h)
        httpx.delete(api_url(f"/admin/landing-pages/{lp_b['id']}"), headers=h)


def test_admin_cannot_delete_other_org_landing_page():
    h_talksme = login("admin@talksme.in")
    lp = make_lp(h_talksme, "A")
    try:
        h_other = login("admin@aurora.demo")
        r = httpx.delete(api_url(f"/admin/landing-pages/{lp['id']}"), headers=h_other)
        assert r.status_code == 404, r.text

        # owner can delete their own page
        r2 = httpx.delete(api_url(f"/admin/landing-pages/{lp['id']}"), headers=h_talksme)
        assert r2.status_code == 200, r2.text
    finally:
        httpx.delete(api_url(f"/admin/landing-pages/{lp['id']}"), headers=h_talksme)
