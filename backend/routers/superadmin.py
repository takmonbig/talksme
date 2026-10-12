"""Super Admin: platform overview, organizations, admins, plans, audit, settings, audited support access."""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from lib.analytics import compute
from lib.auth import PUBLIC_USER, hash_pw, require, verify_pw
from lib.db import db
from lib.util import audit, iso, new_id, now, now_iso
from models.schemas import (AccessIn, AdminIn, Analytics, AuditLog, DecideIn, Invoice, Ok, OrgCreateIn, OrgPatch, OrgRow, Plan, PlanIn, ResetPwIn,
                            PlatformSettings, User)

router = APIRouter(prefix="/superadmin")
sa = require("superadmin")


async def org_rows() -> list[dict]:
    plans = {p["id"]: p async for p in db.plans.find({}, {"_id": 0})}
    rows = []
    async for o in db.organizations.find({"id": {"$ne": "org-platform"}}, {"_id": 0}).sort("created_at", 1):
        p = plans.get(o["plan_id"], {})
        mrr = 0 if o["status"] != "active" else (p.get("price_monthly", 0) if o.get("billing_cycle") == "monthly" else p.get("price_yearly", 0) / 12)
        rows.append({**o, "plan_name": p.get("name", "—"),
                     "employees": await db.users.count_documents({"org_id": o["id"], "role": "employee"}),
                     "customers": await db.customer_profiles.count_documents({"org_id": o["id"]}),
                     "conversations": await db.conversations.count_documents({"org_id": o["id"]}),
                     "deposits_total": sum([d["amount"] async for d in db.deposits.find({"org_id": o["id"], "status": {"$ne": "Reversed"}}, {"amount": 1})]),
                     "mrr": round(mrr, 2)})
    return rows


@router.get("/overview", response_model=dict[str, Any])
async def overview(user: dict = Depends(sa)):
    rows = await org_rows()
    mrr = sum(r["mrr"] for r in rows)
    storage_mb = await db.messages.count_documents({"attachment": {"$ne": None}}) * 1.8
    return {
        "kpis": {
            "organizations": len(rows), "active_organizations": sum(1 for r in rows if r["status"] == "active"),
            "trial_organizations": sum(1 for r in rows if r["status"] == "trial"),
            "suspended_organizations": sum(1 for r in rows if r["status"] == "suspended"),
            "admins": await db.users.count_documents({"role": "admin"}),
            "employees": await db.users.count_documents({"role": "employee"}),
            "customers": await db.users.count_documents({"role": "customer"}),
            "conversations": await db.conversations.count_documents({}),
            "active_conversations": await db.conversations.count_documents({"last_message_at": {"$gte": iso(now().replace(hour=0, minute=0))}}),
            "messages": await db.messages.count_documents({}),
            "deposits": sum(r["deposits_total"] for r in rows), "mrr": round(mrr, 2), "arr": round(mrr * 12, 2),
            "renewals_due": sum(1 for r in rows if r["status"] in ("active", "trial")),
            "storage_mb": round(storage_mb, 1),
        },
        "orgs": rows,
        "health": [{"name": "API", "status": "operational"}, {"name": "Database", "status": "operational"},
                   {"name": "Realtime (polling, mocked)", "status": "degraded-preview"}, {"name": "Payments webhook (mocked)", "status": "mocked"},
                   {"name": "WebRTC TURN (mocked)", "status": "mocked"}],
    }


@router.get("/analytics", response_model=Analytics)
async def platform_analytics(range: str = "30d", frm: str | None = None, to: str | None = None, user: dict = Depends(sa)):
    return await compute(None, None, range, frm, to)


@router.get("/organizations", response_model=list[OrgRow])
async def list_orgs(user: dict = Depends(sa)):
    return await org_rows()


@router.post("/organizations", response_model=OrgRow)
async def create_org(body: OrgCreateIn, user: dict = Depends(sa)):
    if await db.organizations.find_one({"slug": body.slug}):
        raise HTTPException(409, "Slug already in use")
    if await db.users.find_one({"email": body.admin_email.lower()}):
        raise HTTPException(409, "Admin email already in use")
    if not await db.plans.find_one({"id": body.plan_id}):
        raise HTTPException(404, "Plan not found")
    t = now_iso()
    org = {"id": new_id(), "name": body.name, "slug": body.slug, "domain": "", "domain_status": "unconfigured", "plan_id": body.plan_id,
           "billing_cycle": "monthly", "seats": body.seats, "status": "trial" if body.trial else "active", "primary_color": "#0284C7",
           "accent_color": "#8B5CF6", "font": "Inter", "logo_url": "", "banner_url": "", "retention_days": 90, "created_at": t, "trial_ends": None, "features": {k: True for k in ("broadcasts", "audio_calls", "landing_builder", "advanced_analytics", "deposits", "quick_replies")}}
    await db.organizations.insert_one(dict(org))
    await db.users.insert_one({"id": new_id(), "email": body.admin_email.lower(), "name": body.admin_name, "role": "admin", "org_id": org["id"],
                               "password_hash": hash_pw(body.admin_password), "avatar": "", "title": "Org Admin", "phone": "", "status": "offline",
                               "verified": True, "active": True, "calls_enabled": True, "guest": False, "target": 0,
                               "notify_sound": True, "notify_push": False, "created_at": t})
    await audit(user, "org.created", f"org:{org['slug']}", org["id"])
    return next(r for r in await org_rows() if r["id"] == org["id"])


@router.patch("/organizations/{oid}", response_model=OrgRow)
async def patch_org(oid: str, body: OrgPatch, user: dict = Depends(sa)):
    org = await db.organizations.find_one({"id": oid}, {"_id": 0})
    if not org:
        raise HTTPException(404, "Organization not found")
    upd = body.model_dump(exclude_none=True, exclude={"reason"})
    if upd.get("status") == "suspended" and len(body.reason) < 5:
        raise HTTPException(422, "A reason is required to suspend an organization")
    if "domain" in upd:
        if upd["domain"] and await db.organizations.find_one({"domain": upd["domain"], "id": {"$ne": oid}}):
            raise HTTPException(409, "Domain already assigned")
        upd["domain_status"] = "pending" if upd["domain"] else "unconfigured"
    if "plan_id" in upd and not await db.plans.find_one({"id": upd["plan_id"]}):
        raise HTTPException(404, "Plan not found")
    await db.organizations.update_one({"id": oid}, {"$set": upd})
    await audit(user, "org.updated", f"org:{org['slug']} {upd}", oid, body.reason)
    return next(r for r in await org_rows() if r["id"] == oid)


@router.post("/organizations/{oid}/access", response_model=dict[str, Any])
async def support_access(oid: str, body: AccessIn, user: dict = Depends(sa)):
    """Privileged, step-up authenticated, fully audited cross-tenant read access."""
    full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if not verify_pw(body.password, full.get("password_hash")):
        await audit(user, "support_access.denied", f"org:{oid}", oid, body.reason)
        raise HTTPException(401, "Step-up authentication failed")
    org = await db.organizations.find_one({"id": oid}, {"_id": 0})
    if not org:
        raise HTTPException(404, "Organization not found")
    convs = await db.conversations.find({"org_id": oid}, {"_id": 0, "id": 1, "customer_name": 1, "employee_name": 1, "last_message": 1,
                                                          "last_message_at": 1}).sort("last_message_at", -1).to_list(15)
    staff = await db.users.find({"org_id": oid}, {"_id": 0, "name": 1, "email": 1, "role": 1, "active": 1}).to_list(100)
    await audit(user, "support_access.granted", f"org:{org['slug']} conversations,staff (read-only)", oid, body.reason)
    return {"org": org, "conversations": convs, "staff": staff, "expires_in_minutes": 15}


@router.get("/organizations/{oid}/details", response_model=dict[str, Any])
async def org_details(oid: str, user: dict = Depends(sa)):
    row = next((r for r in await org_rows() if r["id"] == oid), None)
    if not row:
        raise HTTPException(404, "Organization not found")
    staff = []
    async for u in db.users.find({"org_id": oid, "deleted": {"$ne": True}}, PUBLIC_USER).sort("role", 1):
        u["open_conversations"] = await db.conversations.count_documents({"employee_id": u["id"], "status": "open"})
        u["deposits_total"] = sum([d["amount"] async for d in db.deposits.find({"employee_id": u["id"], "status": {"$ne": "Reversed"}}, {"amount": 1})])
        staff.append(u)
    lps = await db.landing_pages.find({"org_id": oid}, {"_id": 0, "id": 1, "title": 1, "slug": 1, "published": 1, "views": 1, "leads": 1}).to_list(100)
    inv = await db.invoices.find({"org_id": oid}, {"_id": 0}).sort("date", -1).to_list(50)
    await audit(user, "org.details_viewed", f"org:{row['slug']}", oid)
    return {"org": row, "staff": staff, "landing_pages": lps, "invoices": inv}


@router.post("/users/{uid}/reset-password", response_model=Ok)
async def reset_user_password(uid: str, body: ResetPwIn, user: dict = Depends(sa)):
    u = await db.users.find_one({"id": uid, "role": {"$in": ["admin", "employee"]}}, {"_id": 0})
    if not u:
        raise HTTPException(404, "User not found")
    await db.users.update_one({"id": uid}, {"$set": {"password_hash": hash_pw(body.password)}})
    await audit(user, "user.password_reset", f"user:{u['email']}", u.get("org_id"))
    return Ok(message=f"Password reset for {u['name']}")


@router.patch("/users/{uid}", response_model=Ok)
async def toggle_user(uid: str, active: bool, user: dict = Depends(sa)):
    u = await db.users.find_one({"id": uid, "role": {"$in": ["admin", "employee"]}}, {"_id": 0})
    if not u:
        raise HTTPException(404, "User not found")
    await db.users.update_one({"id": uid}, {"$set": {"active": active}})
    await audit(user, "user.activated" if active else "user.deactivated", f"user:{u['email']}", u.get("org_id"))
    return Ok()


@router.post("/organizations/{oid}/domain/verify", response_model=OrgRow)
async def verify_domain(oid: str, user: dict = Depends(sa)):
    org = await db.organizations.find_one({"id": oid}, {"_id": 0})
    if not org or not org.get("domain"):
        raise HTTPException(400, "Assign a domain first")
    await db.organizations.update_one({"id": oid}, {"$set": {"domain_status": "verified"}})
    await audit(user, "domain.verified", org["domain"], oid)
    return next(r for r in await org_rows() if r["id"] == oid)


@router.post("/invoices/{iid}/decide", response_model=Invoice)
async def decide_invoice(iid: str, body: DecideIn, user: dict = Depends(sa)):
    inv = await db.invoices.find_one({"id": iid}, {"_id": 0})
    if not inv or inv["status"] != "awaiting_approval":
        raise HTTPException(400, "Invoice is not awaiting approval")
    status = "paid" if body.approve else "rejected"
    await db.invoices.update_one({"id": iid}, {"$set": {"status": status}})
    if body.approve and inv.get("plan_id"):
        await db.organizations.update_one({"id": inv["org_id"]}, {"$set": {"plan_id": inv["plan_id"], "billing_cycle": inv["cycle"], "seats": inv["seats"], "status": "active"}})
    await audit(user, f"billing.payment_{status}", f"invoice:{iid}", inv["org_id"])
    return Invoice(**{**inv, "status": status})


@router.get("/admins", response_model=list[User])
async def list_admins(user: dict = Depends(sa)):
    return await db.users.find({"role": "admin"}, PUBLIC_USER).to_list(500)


@router.post("/admins", response_model=User)
async def create_admin(body: AdminIn, user: dict = Depends(sa)):
    if not await db.organizations.find_one({"id": body.org_id}):
        raise HTTPException(404, "Organization not found")
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(409, "Email already in use")
    u = {"id": new_id(), "email": body.email.lower(), "name": body.name, "role": "admin", "org_id": body.org_id,
         "password_hash": hash_pw(body.password), "avatar": "", "title": "Org Admin", "phone": "", "status": "offline",
         "verified": True, "active": True, "calls_enabled": True, "guest": False, "target": 0, "notify_sound": True,
         "notify_push": False, "created_at": now_iso()}
    await db.users.insert_one(dict(u))
    await audit(user, "admin.created", f"user:{u['email']}", body.org_id)
    return User(**u)


@router.patch("/admins/{uid}", response_model=User)
async def toggle_admin(uid: str, active: bool, user: dict = Depends(sa)):
    u = await db.users.find_one({"id": uid, "role": "admin"}, PUBLIC_USER)
    if not u:
        raise HTTPException(404, "Admin not found")
    await db.users.update_one({"id": uid}, {"$set": {"active": active}})
    await audit(user, "admin.activated" if active else "admin.deactivated", f"user:{u['email']}", u["org_id"])
    return User(**{**u, "active": active})


@router.get("/plans", response_model=list[Plan])
async def list_plans(user: dict = Depends(sa)):
    return await db.plans.find({}, {"_id": 0}).to_list(50)


@router.post("/plans", response_model=Plan)
async def create_plan(body: PlanIn, user: dict = Depends(sa)):
    p = {"id": new_id(), **body.model_dump()}
    await db.plans.insert_one(dict(p))
    await audit(user, "plan.created", f"plan:{p['name']}")
    return Plan(**p)


@router.put("/plans/{pid}", response_model=Plan)
async def update_plan(pid: str, body: PlanIn, user: dict = Depends(sa)):
    if not await db.plans.find_one({"id": pid}):
        raise HTTPException(404, "Plan not found")
    await db.plans.update_one({"id": pid}, {"$set": body.model_dump()})
    await audit(user, "plan.updated", f"plan:{body.name}")
    return Plan(id=pid, **body.model_dump())


@router.get("/invoices", response_model=list[Invoice])
async def all_invoices(user: dict = Depends(sa)):
    return await db.invoices.find({}, {"_id": 0}).sort("date", -1).to_list(500)


@router.get("/audit-logs", response_model=list[AuditLog])
async def audit_logs(q: str = "", user: dict = Depends(sa)):
    query = {"$or": [{"action": {"$regex": q, "$options": "i"}}, {"actor_name": {"$regex": q, "$options": "i"}},
                     {"resource": {"$regex": q, "$options": "i"}}]} if q else {}
    return await db.audit_logs.find(query, {"_id": 0}).sort("at", -1).to_list(500)


@router.get("/settings", response_model=PlatformSettings)
async def get_settings(user: dict = Depends(sa)):
    return await db.platform_settings.find_one({"id": "platform"}, {"_id": 0})


@router.put("/settings", response_model=PlatformSettings)
async def put_settings(body: PlatformSettings, user: dict = Depends(sa)):
    await db.platform_settings.update_one({"id": "platform"}, {"$set": body.model_dump()}, upsert=True)
    await audit(user, "platform.settings_updated", "platform")
    return body
