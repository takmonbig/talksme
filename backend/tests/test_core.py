"""Core business rules + authorization. Runs against the live backend (seeded demo data)."""
import uuid

import httpx
import pytest

from tests.conftest import api_url, login_header

PW = "Demo@123"


def login(email: str) -> dict:
    return login_header(email)


def get(path, h):
    return httpx.get(api_url(path), headers=h)


def post(path, h, body=None):
    return httpx.post(api_url(path), headers=h, json=body)


def test_requires_auth():
    assert httpx.get(api_url("/conversations")).status_code == 401
    assert httpx.post(api_url("/auth/login"), json={"email": "agent@talksme.in", "password": "nope"}).status_code == 401


def test_role_enforced_server_side():
    emp = login("agent@talksme.in")
    assert get("/superadmin/overview", emp).status_code == 403
    assert get("/admin/billing", emp).status_code == 403
    cust = login("customer@talksme.in")
    assert get("/customers", cust).status_code == 403


def test_cross_tenant_isolation():
    aurora_admin = login("admin@aurora.demo")
    talksme_emp = login("agent@talksme.in")
    conv = get("/conversations", talksme_emp).json()[0]
    assert get(f"/conversations/{conv['id']}", aurora_admin).status_code == 403
    assert all(c["org_id"] == "org-aurora" for c in get("/conversations", aurora_admin).json())


def test_customer_universal_inbox_spans_orgs():
    cust = login("customer@talksme.in")
    orgs = {c["org_id"] for c in get("/conversations", cust).json()}
    assert orgs == {"org-talksme", "org-aurora", "org-nimbus"}


def test_message_idempotency():
    emp = login("agent@talksme.in")
    conv = next(c for c in get("/conversations", emp).json() if not c["blocked"])
    key = uuid.uuid4().hex
    a = post(f"/conversations/{conv['id']}/messages", emp, {"text": "idem test", "idempotency_key": key}).json()
    b = post(f"/conversations/{conv['id']}/messages", emp, {"text": "idem test", "idempotency_key": key}).json()
    assert a["id"] == b["id"]


def test_existing_phone_requires_verification():
    r = httpx.post(api_url("/public/landing/talksme/support/start"),
                   json={"name": "Imposter", "country_code": "+91", "phone": "9800000001"})
    # 200 when BlackSMS delivers the WhatsApp OTP, 400 when the provider fails — never a session, never a code in the body
    assert r.status_code in (200, 400)
    if r.status_code == 200:
        assert r.json()["status"] == "verification_required" and not r.json().get("mock_code")
    assert "omni_session" not in r.cookies


def test_new_visitor_gets_single_conversation_on_retry():
    phone = str(7000000000 + uuid.uuid4().int % 999999999)
    body = {"name": "New Visitor", "country_code": "+91", "phone": phone}
    r1 = httpx.post(api_url("/public/landing/talksme/support/start"), json=body)
    h = {"Cookie": f"omni_customer={r1.cookies['omni_customer']}"}
    r2 = httpx.post(api_url("/public/landing/talksme/support/start"), json=body, headers=h)
    assert r1.json()["conversation_id"] == r2.json()["conversation_id"]


def test_deposit_dispute_needs_reason_and_is_audited():
    admin = login("admin@talksme.in")
    d = next(x for x in get("/deposits", admin).json() if x["status"] == "Recorded")
    assert post(f"/deposits/{d['id']}/status", admin, {"status": "Disputed", "reason": ""}).status_code == 422
    assert post(f"/deposits/{d['id']}/status", admin, {"status": "Disputed", "reason": "Reference not found"}).status_code == 200
    events = get(f"/deposits/{d['id']}/events", admin).json()
    assert [e["to_status"] for e in events][-1] == "Disputed" and len(events) >= 2


def test_employee_cannot_change_deposit_status():
    emp = login("agent@talksme.in")
    d = get("/deposits", emp).json()[0]
    assert post(f"/deposits/{d['id']}/status", emp, {"status": "Reviewed", "reason": ""}).status_code == 403


@pytest.mark.parametrize("password,code", [("wrong", 401)])
def test_support_access_requires_step_up(password, code):
    sa = login("superadmin@talksme.in")
    r = post("/superadmin/organizations/org-aurora/access", sa, {"reason": "Investigating ticket 1234", "password": password})
    assert r.status_code == code


def test_admin_reset_and_delete_employee_keeps_data():
    admin = login("admin@talksme.in")
    emps = get("/employees", admin).json()
    neha = next(e for e in emps if e["email"] == "neha@talksme.in")
    assert post(f"/admin/employees/{neha['id']}/reset-password", admin, {"password": "NewPass@123"}).status_code == 200
    assert httpx.post(api_url("/auth/login"), json={"email": "neha@talksme.in", "password": "NewPass@123"}).status_code == 200
    convs_before = len(get(f"/admin/employees/{neha['id']}/details", admin).json()["conversations"])
    assert httpx.delete(api_url(f"/admin/employees/{neha['id']}"), headers=admin).status_code == 200
    assert all(e["id"] != neha["id"] for e in get("/employees", admin).json())
    assert len([c for c in get("/conversations", admin).json() if c["employee_id"] == neha["id"]]) == convs_before


def test_feature_gate_and_qr_payment_approval():
    sa = login("superadmin@talksme.in")
    httpx.patch(api_url("/superadmin/organizations/org-nimbus"), headers=sa, json={"features": {"broadcasts": False}, "reason": "test"})
    nimbus = login("admin@nimbus.demo")
    assert post("/admin/broadcasts", nimbus, {"title": "Hello", "message": "Promo text"}).status_code == 403
    httpx.patch(api_url("/superadmin/organizations/org-nimbus"), headers=sa, json={"features": {"broadcasts": True}, "reason": "test"})
    inv = post("/admin/billing/change", nimbus, {"plan_id": "plan-enterprise", "cycle": "monthly", "seats": 30}).json()
    assert inv["status"] == "pending"
    assert post(f"/admin/billing/invoices/{inv['id']}/proof", nimbus, {"screenshot_url": "https://res.cloudinary.com/x/proof.png"}).json()["status"] == "awaiting_approval"
    assert post(f"/superadmin/invoices/{inv['id']}/decide", sa, {"approve": True}).json()["status"] == "paid"
    assert get("/admin/billing", nimbus).json()["org"]["plan_id"] == "plan-enterprise"


def test_admin_cannot_manage_domain_anymore():
    admin = login("admin@talksme.in")
    assert httpx.put(api_url("/admin/org/domain"), headers=admin, json={"domain": "x.example.com"}).status_code in (404, 405)
