"""Meta Pixel: LandingPageIn.pixel_id accepts the full pasted Meta Pixel snippet and stores only the numeric ID."""
import time

import httpx

from tests.conftest import api_url

PW = "Demo@123"
FULL_CODE = (
    "<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?"
    "n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;"
    "n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;"
    "s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',"
    "'https://connect.facebook.net/en_US/fbevents.js');fbq('init', '1234567890123456');"
    "fbq('track', 'PageView');</script>"
)


def login(email: str) -> dict:
    r = httpx.post(api_url("/auth/login"), json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Cookie": f"omni_session={r.cookies['omni_session']}"}


def test_create_landing_page_stores_only_pixel_id():
    h = login("admin@talksme.in")
    slug = f"tscheck-pixel-api-{int(time.time())}"
    body = {
        "title": "tscheck pixel api page",
        "slug": slug,
        "template": "B",
        "cta_text": "Chat Now",
        "primary_color": "#0284C7",
        "routing": "round_robin",
        "pixel_id": FULL_CODE,
        "published": False,
    }
    r = httpx.post(api_url("/admin/landing-pages"), headers=h, json=body)
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["pixel_id"] == "1234567890123456"

    r2 = httpx.get(api_url("/admin/landing-pages"), headers=h)
    assert r2.status_code == 200
    row = next(p for p in r2.json() if p["id"] == created["id"])
    assert row["pixel_id"] == "1234567890123456"


def test_create_landing_page_rejects_junk_pixel_text():
    h = login("admin@talksme.in")
    slug = f"tscheck-pixel-bad-{int(time.time())}"
    body = {
        "title": "tscheck bad pixel page",
        "slug": slug,
        "template": "B",
        "cta_text": "Chat Now",
        "primary_color": "#0284C7",
        "routing": "round_robin",
        "pixel_id": "not a pixel code at all",
        "published": False,
    }
    r = httpx.post(api_url("/admin/landing-pages"), headers=h, json=body)
    assert r.status_code == 422, r.text
