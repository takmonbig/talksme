"""Employee auto-messages settings: customer role must be rejected from the employee-only endpoint."""
import httpx

from tests.conftest import api_url, login_header


def login(email: str) -> dict:
    return login_header(email)


def test_customer_cannot_get_employee_auto_messages():
    cust = login("customer@talksme.in")
    r = httpx.get(api_url("/employee/auto-messages"), headers=cust)
    assert r.status_code in (401, 403), r.text


def test_employee_gets_auto_messages():
    emp = login("agent@talksme.in")
    r = httpx.get(api_url("/employee/auto-messages"), headers=emp)
    assert r.status_code == 200, r.text
