"""Landing-page default message: prefilled once for a fresh visitor; when auto_send_default is
on, it's posted exactly once as the customer (idempotent across retries / re-fetching start)."""
import uuid

import httpx

from tests.conftest import api_url

PW = "Demo@123"
SUFFIX = uuid.uuid4().hex[:8]


def login(email: str) -> dict:
    r = httpx.post(api_url("/auth/login"), json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Cookie": f"omni_session={r.cookies['omni_session']}"}


def make_lp(h: dict, auto_send: bool) -> dict:
    body = {
        "title": f"tscheck-dm-api-{SUFFIX}-{auto_send}",
        "slug": f"tscheck-dm-api-{SUFFIX}-{auto_send}".lower(),
        "template": "B",
        "default_message": "tscheck default message api test",
        "auto_send_default": auto_send,
        "cta_text": "Chat Now",
        "published": True,
    }
    r = httpx.post(api_url("/admin/landing-pages"), headers=h, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_prefill_without_autosend_returns_text_not_sent():
    h = login("admin@talksme.in")
    lp = make_lp(h, auto_send=False)
    try:
        r = httpx.post(api_url("/public/landing/talksme/" + lp["slug"] + "/start"), json={})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["prefill"] == "tscheck default message api test"
        # no customer message was created
        cid = body["conversation_id"]
        guest_h = {"Cookie": f"omni_session={r.cookies['omni_session']}"}
        msgs = httpx.get(api_url(f"/conversations/{cid}/messages"), headers=guest_h).json()
        assert not any(m["sender_role"] == "customer" for m in msgs)
    finally:
        httpx.delete(api_url(f"/admin/landing-pages/{lp['id']}"), headers=h)


def test_autosend_posts_exactly_once_even_on_repeat_start():
    h = login("admin@talksme.in")
    lp = make_lp(h, auto_send=True)
    try:
        r1 = httpx.post(api_url("/public/landing/talksme/" + lp["slug"] + "/start"), json={})
        assert r1.status_code == 200, r1.text
        body1 = r1.json()
        assert body1["prefill"] == ""  # auto-sent, nothing left to prefill
        cid = body1["conversation_id"]
        guest_h = {"Cookie": f"omni_session={r1.cookies['omni_session']}"}

        # hitting /start again on the same session must not duplicate the message
        r2 = httpx.post(api_url("/public/landing/talksme/" + lp["slug"] + "/start"), json={}, headers=guest_h)
        assert r2.status_code == 200, r2.text
        assert r2.json()["conversation_id"] == cid

        msgs = httpx.get(api_url(f"/conversations/{cid}/messages"), headers=guest_h).json()
        matching = [m for m in msgs if m["sender_role"] == "customer" and "tscheck default message api test" in m["text"]]
        assert len(matching) == 1, f"expected exactly 1 auto-sent customer message, got {len(matching)}"
    finally:
        httpx.delete(api_url(f"/admin/landing-pages/{lp['id']}"), headers=h)
