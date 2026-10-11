"""Employee can disable/enable voice calls for a specific customer (PATCH /api/customers/{id})."""
import httpx

from tests.conftest import api_url

PW = "Demo@123"
CID = "57242d0d-e60a-4eba-a3b9-ba836c762a57"  # Rahul Verma <-> Priya Sharma (seed conversation)
CUSTOMER_ID = "b106167d-79a7-4cba-979c-c958316d4495"  # Rahul Verma's customer profile (seed)


def login(email: str) -> dict:
    r = httpx.post(api_url("/auth/login"), json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Cookie": f"omni_session={r.cookies['omni_session']}"}


def test_toggle_calls_allowed_persists_and_restores():
    h = login("agent@talksme.in")

    # Turn OFF
    r = httpx.patch(api_url(f"/customers/{CUSTOMER_ID}"), headers=h, json={"calls_allowed": False})
    assert r.status_code == 200, r.text
    assert r.json()["calls_allowed"] is False

    conv = httpx.get(api_url(f"/conversations/{CID}"), headers=h)
    assert conv.status_code == 200, conv.text
    # Employee's own view always keeps calls_enabled true (employee can always call);
    # customer_calls_allowed reflects the per-customer restriction.
    assert conv.json()["calls_enabled"] is True
    assert conv.json()["customer_calls_allowed"] is False

    # Customer's own view of the conversation now has calls disabled.
    hc = login("customer@talksme.in")
    conv_cust = httpx.get(api_url(f"/conversations/{CID}"), headers=hc)
    assert conv_cust.status_code == 200, conv_cust.text
    assert conv_cust.json()["calls_enabled"] is False

    # Restore seed state (ON) so other checks/tests are unaffected
    r2 = httpx.patch(api_url(f"/customers/{CUSTOMER_ID}"), headers=h, json={"calls_allowed": True})
    assert r2.status_code == 200, r2.text
    assert r2.json()["calls_allowed"] is True

    conv2 = httpx.get(api_url(f"/conversations/{CID}"), headers=h)
    assert conv2.json()["calls_enabled"] is True


def test_customer_role_cannot_patch_customers():
    h = login("customer@talksme.in")
    r = httpx.patch(api_url(f"/customers/{CUSTOMER_ID}"), headers=h, json={"calls_allowed": False})
    assert r.status_code in (401, 403), r.text
