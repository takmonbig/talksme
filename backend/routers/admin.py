"""Admin (single organization): employees, landing pages, broadcasts, branding, domain, billing."""
import time

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import PUBLIC_USER, hash_pw, require
from lib.db import db
from lib.util import audit, new_id, now_iso
from routers.crm import need_feature
from models.schemas import (AuditLog, Billing, BillingChangeIn, Broadcast, BroadcastIn, EmployeeIn, EmployeePatch, ProofIn, ResetPwIn,
                            Invoice, LandingPage, LandingPageIn, Ok, Organization, OrgBrandingUpdate, User)

router = APIRouter(prefix="/admin")
admin = require("admin")
_bc_rate: dict[str, list[float]] = {}


async def org_of(user: dict) -> dict:
    return await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0})


# ---------- employees ----------
@router.post("/employees", response_model=User)
async def create_employee(body: EmployeeIn, user: dict = Depends(admin)):
    org = await org_of(user)
    used = await db.users.count_documents({"org_id": org["id"], "role": "employee", "active": True, "deleted": {"$ne": True}})
    if used >= org["seats"]:
        raise HTTPException(402, f"All {org['seats']} seats are in use. Add seats in Billing.")
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(409, "Email already in use")
    emp = {"id": new_id(), "email": body.email.lower(), "name": body.name, "role": "employee", "org_id": org["id"],
           "password_hash": hash_pw(body.password), "avatar": "", "title": body.title, "phone": "", "status": "offline",
           "verified": False, "active": True, "calls_enabled": True, "guest": False, "target": body.target,
           "notify_sound": True, "notify_push": False, "created_at": now_iso()}
    await db.users.insert_one(dict(emp))
    await audit(user, "employee.created", f"user:{emp['id']}", org["id"])
    return User(**emp)


@router.patch("/employees/{eid}", response_model=User)
async def patch_employee(eid: str, body: EmployeePatch, user: dict = Depends(admin)):
    emp = await db.users.find_one({"id": eid, "org_id": user["org_id"], "role": "employee"}, PUBLIC_USER)
    if not emp:
        raise HTTPException(404, "Employee not found")
    upd = body.model_dump(exclude_none=True)
    if upd.get("active") and not emp["active"]:
        org = await org_of(user)
        if await db.users.count_documents({"org_id": org["id"], "role": "employee", "active": True}) >= org["seats"]:
            raise HTTPException(402, "No free seats. Add seats in Billing.")
    if upd.get("active") is False:
        upd["status"] = "offline"  # data is retained; only access is revoked
    await db.users.update_one({"id": eid}, {"$set": upd})
    await audit(user, "employee.updated", f"user:{eid} {sorted(upd)}", user["org_id"])
    return User(**{**emp, **upd})


async def _emp(user: dict, eid: str) -> dict:
    emp = await db.users.find_one({"id": eid, "org_id": user["org_id"], "role": "employee", "deleted": {"$ne": True}}, PUBLIC_USER)
    if not emp:
        raise HTTPException(404, "Employee not found")
    return emp


@router.get("/employees/{eid}/details", response_model=dict)
async def employee_details(eid: str, user: dict = Depends(admin)):
    emp = await _emp(user, eid)
    convs = await db.conversations.find({"employee_id": eid}, {"_id": 0, "id": 1, "customer_name": 1, "customer_phone": 1, "last_message": 1,
                                                              "last_message_at": 1, "landing_title": 1}).sort("last_message_at", -1).to_list(500)
    deps = await db.deposits.find({"employee_id": eid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    custs = await db.customer_profiles.count_documents({"assigned_employee_id": eid})
    calls = await db.calls.count_documents({"conversation_id": {"$in": [c["id"] for c in convs]}})
    logs = await db.audit_logs.find({"actor_id": eid}, {"_id": 0}).sort("at", -1).to_list(30)
    return {"employee": emp, "conversations": convs, "deposits": deps, "customers": custs, "calls": calls, "activity": logs}


@router.post("/employees/{eid}/reset-password", response_model=Ok)
async def reset_employee_password(eid: str, body: ResetPwIn, user: dict = Depends(admin)):
    emp = await _emp(user, eid)
    await db.users.update_one({"id": eid}, {"$set": {"password_hash": hash_pw(body.password)}})
    await audit(user, "employee.password_reset", f"user:{emp['email']}", user["org_id"])
    return Ok(message=f"Password reset for {emp['name']}")


@router.delete("/employees/{eid}", response_model=Ok)
async def delete_employee(eid: str, user: dict = Depends(admin)):
    """Removes the login and frees the seat. Conversations, customers and deposits are retained for the organization."""
    emp = await _emp(user, eid)
    await db.users.update_one({"id": eid}, {"$set": {"deleted": True, "active": False, "status": "offline", "email": f"deleted+{eid}@removed.local"}})
    await audit(user, "employee.deleted", f"user:{emp['email']}", user["org_id"])
    return Ok(message=f"{emp['name']} removed. Their records are kept.")


# ---------- landing pages ----------
@router.get("/landing-pages", response_model=list[LandingPage])
async def list_lps(user: dict = Depends(admin)):
    return await db.landing_pages.find({"org_id": user["org_id"]}, {"_id": 0}).sort("created_at", 1).to_list(200)


async def _validate_lp(user: dict, body: LandingPageIn, lp_id: str | None) -> None:
    await need_feature(user, "landing_builder")
    dup = await db.landing_pages.find_one({"org_id": user["org_id"], "slug": body.slug, "id": {"$ne": lp_id}})
    if dup:
        raise HTTPException(409, "Another page already uses this path")
    ids = set(body.assigned_employee_ids) | {i.employee_id for i in body.images if i.employee_id}
    if ids and await db.users.count_documents({"id": {"$in": list(ids)}, "org_id": user["org_id"]}) != len(ids):
        raise HTTPException(400, "Assigned employees must belong to your organization")


@router.post("/landing-pages", response_model=LandingPage)
async def create_lp(body: LandingPageIn, user: dict = Depends(admin)):
    await _validate_lp(user, body, None)
    lp = {"id": new_id(), "org_id": user["org_id"], **body.model_dump(), "views": 0, "leads": 0, "rr_index": 0, "created_at": now_iso()}
    if not lp["assigned_employee_ids"] and lp["routing"] != "manual":
        lp["assigned_employee_ids"] = [e["id"] async for e in db.users.find({"org_id": user["org_id"], "role": "employee", "active": True}, {"id": 1})]
    for img in lp["images"]:
        img["id"] = img["id"] or new_id()
    await db.landing_pages.insert_one(dict(lp))
    await audit(user, "landing_page.created", f"landing:{lp['slug']}", user["org_id"])
    return LandingPage(**lp)


@router.put("/landing-pages/{lid}", response_model=LandingPage)
async def update_lp(lid: str, body: LandingPageIn, user: dict = Depends(admin)):
    lp = await db.landing_pages.find_one({"id": lid, "org_id": user["org_id"]}, {"_id": 0})
    if not lp:
        raise HTTPException(404, "Landing page not found")
    await _validate_lp(user, body, lid)
    upd = body.model_dump()
    await db.landing_pages.update_one({"id": lid}, {"$set": upd})
    await audit(user, "landing_page.updated", f"landing:{body.slug}", user["org_id"])
    return LandingPage(**{**lp, **upd})


@router.post("/landing-pages/{lid}/duplicate", response_model=LandingPage)
async def duplicate_lp(lid: str, user: dict = Depends(admin)):
    lp = await db.landing_pages.find_one({"id": lid, "org_id": user["org_id"]}, {"_id": 0})
    if not lp:
        raise HTTPException(404, "Landing page not found")
    slug = f"{lp['slug']}-copy"
    n = 2
    while await db.landing_pages.find_one({"org_id": user["org_id"], "slug": slug}):
        slug, n = f"{lp['slug']}-copy-{n}", n + 1
    new = {**lp, "id": new_id(), "slug": slug, "title": f"{lp['title']} (copy)", "published": False, "views": 0, "leads": 0,
           "rr_index": 0, "created_at": now_iso(), "images": [{**i, "id": new_id()} for i in lp["images"]]}
    await db.landing_pages.insert_one(dict(new))
    return LandingPage(**new)


# ---------- broadcasts (opt-in only) ----------
async def _audience(org_id: str, segment: str) -> list[dict]:
    q: dict = {"org_id": org_id, "opted_in": True, "blocked": False}
    if segment != "all":
        q["labels"] = segment
    return await db.customer_profiles.find(q, {"_id": 0, "id": 1}).to_list(10000)


@router.get("/broadcasts", response_model=list[Broadcast])
async def list_broadcasts(user: dict = Depends(admin)):
    return await db.broadcasts.find({"org_id": user["org_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.get("/broadcasts/audience", response_model=dict[str, int])
async def audience(segment: str = "all", user: dict = Depends(admin)):
    total = await db.customer_profiles.count_documents({"org_id": user["org_id"]})
    return {"eligible": len(await _audience(user["org_id"], segment)), "total": total}


@router.post("/broadcasts", response_model=Broadcast)
async def create_broadcast(body: BroadcastIn, user: dict = Depends(admin)):
    await need_feature(user, "broadcasts")
    t = time.time()
    recent = [x for x in _bc_rate.get(user["org_id"], []) if t - x < 3600]
    if len(recent) >= 5:
        raise HTTPException(429, "Broadcast limit reached (5 per hour)")
    _bc_rate[user["org_id"]] = recent + [t]
    rec = await _audience(user["org_id"], body.segment)
    if not rec:
        raise HTTPException(400, "No opted-in customers in this segment")
    scheduled = bool(body.scheduled_at)
    bc = {"id": new_id(), "org_id": user["org_id"], "title": body.title, "message": body.message, "segment": body.segment,
          "scheduled_at": body.scheduled_at, "status": "scheduled" if scheduled else "queued (mocked)", "recipients": len(rec),
          "delivered": 0, "read": 0, "opted_out": 0, "created_at": now_iso()}
    await db.broadcasts.insert_one(dict(bc))
    await audit(user, "broadcast.created", f"broadcast:{bc['id']} to {len(rec)}", user["org_id"])
    return Broadcast(**bc)


# ---------- organization settings + domain ----------
@router.get("/org", response_model=Organization)
async def get_org(user: dict = Depends(admin)):
    return await org_of(user)


@router.patch("/org", response_model=Organization)
async def update_org(body: OrgBrandingUpdate, user: dict = Depends(admin)):
    upd = body.model_dump(exclude_none=True)
    if upd:
        await db.organizations.update_one({"id": user["org_id"]}, {"$set": upd})
        await audit(user, "org.branding_updated", f"org:{user['org_id']} {sorted(upd)}", user["org_id"])
    return await org_of(user)


@router.get("/audit-logs", response_model=list[AuditLog])
async def org_audit(user: dict = Depends(admin)):
    return await db.audit_logs.find({"org_id": user["org_id"]}, {"_id": 0}).sort("at", -1).to_list(200)


# ---------- billing (MOCKED payment provider) ----------
@router.get("/billing", response_model=Billing)
async def billing(user: dict = Depends(admin)):
    org = await org_of(user)
    plans = await db.plans.find({"active": True}, {"_id": 0}).to_list(50)
    plan = await db.plans.find_one({"id": org["plan_id"]}, {"_id": 0})
    inv = await db.invoices.find({"org_id": org["id"]}, {"_id": 0}).sort("date", -1).to_list(100)
    used = await db.users.count_documents({"org_id": org["id"], "role": "employee", "active": True})
    ps = await db.platform_settings.find_one({"id": "platform"}, {"_id": 0}) or {}
    return Billing(org=org, plan=plan, plans=plans, invoices=inv, seats_used=used, payment_qr_url=ps.get("payment_qr_url", ""), upi_id=ps.get("upi_id", ""))


@router.post("/billing/change", response_model=Invoice)
async def change_plan(body: BillingChangeIn, user: dict = Depends(admin)):
    org = await org_of(user)
    plan = await db.plans.find_one({"id": body.plan_id, "active": True}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan not found")
    used = await db.users.count_documents({"org_id": org["id"], "role": "employee", "active": True})
    if body.seats < used:
        raise HTTPException(400, f"You have {used} active employees; deactivate some before reducing seats")
    unit = plan["price_monthly"] if body.cycle == "monthly" else plan["price_yearly"]
    extra = max(0, body.seats - plan["seats"])
    amount = round(unit + extra * (unit / plan["seats"]), 2)
    inv = {"id": new_id(), "org_id": org["id"], "org_name": org["name"], "plan_name": plan["name"], "cycle": body.cycle,
           "seats": body.seats, "amount": amount, "status": "pending", "date": now_iso(), "plan_id": plan["id"]}
    await db.invoices.insert_one(dict(inv))
    await audit(user, "billing.checkout_created", f"invoice:{inv['id']}", org["id"])
    return Invoice(**inv)


@router.post("/billing/invoices/{iid}/proof", response_model=Invoice)
async def upload_proof(iid: str, body: ProofIn, user: dict = Depends(admin)):
    """Admin paid via the platform QR and uploads the screenshot; Super Admin approves to activate."""
    inv = await db.invoices.find_one({"id": iid, "org_id": user["org_id"]}, {"_id": 0})
    if not inv or inv["status"] not in ("pending", "rejected"):
        raise HTTPException(400, "Invoice is not awaiting payment")
    upd = {"status": "awaiting_approval", "screenshot_url": body.screenshot_url, "reference": body.reference}
    await db.invoices.update_one({"id": iid}, {"$set": upd})
    await audit(user, "billing.payment_proof_uploaded", f"invoice:{iid}", user["org_id"])
    return Invoice(**{**inv, **upd})


@router.post("/billing/cancel", response_model=Ok)
async def cancel(user: dict = Depends(admin)):
    await db.organizations.update_one({"id": user["org_id"]}, {"$set": {"cancel_at_period_end": True}})
    await audit(user, "billing.cancel_requested", f"org:{user['org_id']}", user["org_id"])
    return Ok(message="Cancellation scheduled at period end (mocked)")
