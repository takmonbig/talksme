"""FIX VERIFICATION: QuickPayment (employee inbox) no longer sends a fixed reference of
"-". The backend (routers/crm.py) now auto-generates a unique "MANUAL-XXXXXXXX" reference
whenever the incoming reference is empty or "-", so repeated Quick Payments from the same
org no longer collide on deposit-reference uniqueness. An explicit, non-empty duplicate
reference supplied by the caller must still be rejected with 409 (uniqueness is still
enforced for real references)."""
import uuid

import httpx

from tests.conftest import api_url

PW = "Demo@123"
SUFFIX = uuid.uuid4().hex[:8]


def login(email: str) -> dict:
    r = httpx.post(api_url("/auth/login"), json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Cookie": f"omni_session={r.cookies['omni_session']}"}


def get_rahul(h: dict) -> dict:
    custs = httpx.get(api_url("/customers"), headers=h).json()
    return next(c for c in custs if c["name"] == "Rahul Verma")


def test_two_consecutive_quick_payments_with_dash_reference_both_succeed():
    """Reproduces the exact QuickPayment payload (reference='-') twice in a row - both must
    now succeed (200) because the backend auto-generates a unique MANUAL-XXXXXXXX reference
    instead of reusing the literal '-' value."""
    h = login("agent@talksme.in")
    rahul = get_rahul(h)

    r1 = httpx.post(api_url("/deposits"), headers=h, json={
        "customer_id": rahul["id"], "amount": 1500, "currency": "INR", "method": "UPI",
        "payment_date": "2026-10-12", "notes": "tscheck quick payment fix verification 1",
        "product": "Payment", "reference": "-",
    })
    assert r1.status_code == 200, f"expected fix to allow reference='-' (200), got {r1.status_code}: {r1.text}"
    ref1 = r1.json().get("reference", "")
    assert ref1.startswith("MANUAL-"), f"expected auto-generated MANUAL-XXXXXXXX reference, got {ref1!r}"

    r2 = httpx.post(api_url("/deposits"), headers=h, json={
        "customer_id": rahul["id"], "amount": 700, "currency": "INR", "method": "UPI",
        "payment_date": "2026-10-12", "notes": "tscheck quick payment fix verification 2",
        "product": "Payment", "reference": "-",
    })
    assert r2.status_code == 200, f"second consecutive quick payment should also succeed, got {r2.status_code}: {r2.text}"
    ref2 = r2.json().get("reference", "")
    assert ref2.startswith("MANUAL-")
    assert ref2 != ref1, "two consecutive auto-generated references must be unique"

    # both deposits must actually be visible in the ledger
    deposits = httpx.get(api_url("/deposits"), headers=h).json()
    ids = {d["id"] for d in deposits}
    assert r1.json()["id"] in ids
    assert r2.json()["id"] in ids


def test_empty_reference_also_auto_generated_and_explicit_duplicate_still_rejected():
    """Empty-string reference behaves the same as '-' (auto-generated). An explicit,
    non-empty, duplicate reference supplied by the caller must still 409 - uniqueness
    enforcement for real references is untouched by the fix."""
    h = login("agent@talksme.in")
    rahul = get_rahul(h)

    r = httpx.post(api_url("/deposits"), headers=h, json={
        "customer_id": rahul["id"], "amount": 100, "currency": "INR", "method": "UPI",
        "payment_date": "2026-10-12", "notes": "tscheck empty reference", "product": "Payment",
        "reference": "",
    })
    assert r.status_code == 200, r.text
    assert r.json().get("reference", "").startswith("MANUAL-")

    ref = f"tscheck-ref-{SUFFIX}"
    ok = httpx.post(api_url("/deposits"), headers=h, json={
        "customer_id": rahul["id"], "amount": 100, "currency": "INR", "method": "UPI",
        "payment_date": "2026-10-12", "notes": "tscheck", "product": "Payment", "reference": ref,
    })
    assert ok.status_code == 200, ok.text
    dup = httpx.post(api_url("/deposits"), headers=h, json={
        "customer_id": rahul["id"], "amount": 100, "currency": "INR", "method": "UPI",
        "payment_date": "2026-10-12", "notes": "tscheck", "product": "Payment", "reference": ref,
    })
    assert dup.status_code == 409, f"explicit duplicate non-empty reference should still 409, got {dup.status_code}: {dup.text}"
    assert "reference" in dup.json().get("detail", "").lower()
