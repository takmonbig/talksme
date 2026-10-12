"""Super Admin control center (search, bulk actions, reset links, org panel reset), all landing pages,
TalksMe platform support inbox, Admin direct customer notifications, employee default-message editing."""
import asyncio
import hashlib
import re
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.auth import hash_pw, optional_user, require, verify_pw
from lib.conv import PLATFORM_ORG, open_conversation
from lib.db import db
from lib.push import push_to
from lib.realtime import publish
from lib.util import audit, iso, new_id, now, now_iso
from models.schemas import (
    DefaultMessageIn, JobOut, LandingPage, NotificationRecord, NotifyIn, Ok, OrgBulkIn, OrgBulkOut, OrgResetIn, OrgResetPreview,
    PasswordResetIn, ResetLinkOut, SACustomerPick, SALandingPatch, SALandingRow, StartChatIn, StartChatOut, SupportIdentity, SupportStartIn,
)

router = APIRouter()
sa = require("superadmin")
admin = require("admin")
emp = require("employee")


# ---------- organization search + bulk ----------
@router.get("/superadmin/org-search", response_model=list[str])
async def org_search(q: str, user: dict = Depends(sa)):
    """Matches organization name/slug/domain/ID or any Admin's name/email/phone. Returns org IDs."""
    rx = {"$regex": re.escape(q.strip()), "$options": "i"}
    ids = set(await db.organizations.distinct("id", {"$or": [{"name": rx}, {"slug": rx}, {"domain": rx}, {"id": rx}]}))
    ids |= set(await db.users.distinct("org_id", {"role": "admin", "$or": [{"name": rx}, {"email": rx}, {"phone": rx}]}))
    ids.discard(None)
    ids.discard(PLATFORM_ORG)
    return sorted(ids)


@router.post("/superadmin/organizations/bulk", response_model=OrgBulkOut)
async def org_bulk(body: OrgBulkIn, user: dict = Depends(sa)):
    ids = [i for i in body.ids if i != PLATFORM_ORG]
    set_: dict = {}
    a = body.action
    if a in ("activate", "restore"):
        set_ = {"status": "active", "deleted_at": None}
    elif a == "suspend":
        set_ = {"status": "suspended"}
    elif a == "archive":
        set_ = {"status": "archived"}
    elif a == "delete":  # soft delete: hidden + locked, data retained for 30 days (restore possible)
        set_ = {"status": "deleted", "deleted_at": now_iso(), "purge_after": iso(now() + timedelta(days=30))}
    elif a == "plan":
        if not body.plan_id or not await db.plans.find_one({"id": body.plan_id}):
            raise HTTPException(422, "Choose a valid plan")
        set_ = {"plan_id": body.plan_id}
    elif a == "seats":
        if not body.seats:
            raise HTTPException(422, "Enter a seat limit")
        set_ = {"seats": body.seats}
    r = await db.organizations.update_many({"id": {"$in": ids}}, {"$set": set_})
    if a in ("suspend", "archive", "delete"):
        await db.landing_pages.update_many({"org_id": {"$in": ids}}, {"$set": {"published": False}})
    for oid in ids:
        await audit(user, f"organization.bulk_{a}", f"org:{oid} {set_} reason:{body.reason}", oid)
    return OrgBulkOut(updated=r.modified_count, skipped=[i for i in body.ids if i not in ids])


# ---------- secure password reset links ----------
@router.post("/superadmin/users/{uid}/reset-link", response_model=ResetLinkOut)
async def reset_link(uid: str, request: Request, user: dict = Depends(sa)):
    target = await db.users.find_one({"id": uid, "role": {"$in": ["admin", "employee"]}}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    token = secrets.token_urlsafe(32)
    exp = iso(now() + timedelta(hours=24))
    await db.password_resets.insert_one({"hash": hashlib.sha256(token.encode()).hexdigest(), "user_id": uid, "expires": exp, "used": False, "created_by": user["id"]})
    await db.users.update_one({"id": uid}, {"$set": {"must_change_password": True}})
    await audit(user, "user.reset_link_created", f"user:{target['email']}", target.get("org_id"))
    origin = request.headers.get("origin") or f"https://{request.headers.get('host', '')}"
    return ResetLinkOut(url=f"{origin}/reset-password?token={token}", expires_at=exp)


@router.post("/auth/reset-password", response_model=Ok)
async def do_reset(body: PasswordResetIn):
    h = hashlib.sha256(body.token.encode()).hexdigest()
    rec = await db.password_resets.find_one({"hash": h, "used": False}, {"_id": 0})
    if not rec or rec["expires"] < now_iso():
        raise HTTPException(400, "This reset link is invalid or has expired. Ask your Super Admin for a new one.")
    await db.password_resets.update_one({"hash": h}, {"$set": {"used": True, "used_at": now_iso()}})
    u = await db.users.find_one({"id": rec["user_id"]}, {"_id": 0})
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"password_hash": hash_pw(body.password), "must_change_password": False}})
    await audit(u or {"id": rec["user_id"], "name": "user", "role": "user"}, "user.password_reset_completed", f"user:{rec['user_id']}", (u or {}).get("org_id"))
    return Ok(message="Password updated. You can sign in now.")


# ---------- organization panel reset (danger zone) ----------
RESET = {"conversations": "org_id", "messages": "org_id", "customer_profiles": "org_id", "deposits": "org_id", "deposit_events": "org_id",
         "calls": "org_id", "transfers": "org_id", "broadcasts": "org_id", "notifications": "org_id", "quick_replies": "org_id"}
PRESERVED = ["Organization, branding & settings", "Admin and employee accounts", "Landing pages", "Subscription, invoices & billing history", "Audit logs"]


async def _counts(oid: str) -> dict[str, int]:
    return {k: await db[k].count_documents({f: oid}) for k, f in RESET.items()}


@router.get("/superadmin/organizations/{oid}/reset-preview", response_model=OrgResetPreview)
async def reset_preview(oid: str, user: dict = Depends(sa)):
    org = await db.organizations.find_one({"id": oid}, {"_id": 0})
    if not org or oid == PLATFORM_ORG:
        raise HTTPException(404, "Organization not found")
    return OrgResetPreview(org_id=oid, org_name=org["name"], will_reset=await _counts(oid), preserved=PRESERVED)


async def _run_reset(job_id: str, oid: str) -> None:
    result: dict = {}
    try:
        for coll, field in RESET.items():
            docs = await db[coll].find({field: oid}, {"_id": 0}).to_list(None)
            for i in range(0, len(docs), 500):  # backup snapshot first (restorable by support)
                await db.org_reset_backups.insert_one({"job_id": job_id, "org_id": oid, "collection": coll, "docs": docs[i:i + 500], "at": now_iso()})
            result[coll] = (await db[coll].delete_many({field: oid})).deleted_count
        await db.landing_pages.update_many({"org_id": oid}, {"$set": {"views": 0, "leads": 0, "rr_index": 0}})
        await db.jobs.update_one({"id": job_id}, {"$set": {"status": "done", "result": result, "finished_at": now_iso()}})
    except Exception as e:  # noqa: BLE001
        await db.jobs.update_one({"id": job_id}, {"$set": {"status": "failed", "result": {"error": str(e)[:300], **result}, "finished_at": now_iso()}})


_jobs: set = set()


@router.post("/superadmin/organizations/{oid}/reset", response_model=JobOut)
async def reset_org(oid: str, body: OrgResetIn, user: dict = Depends(sa)):
    org = await db.organizations.find_one({"id": oid}, {"_id": 0})
    if not org or oid == PLATFORM_ORG:
        raise HTTPException(404, "Organization not found")
    me = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 1})
    if not verify_pw(body.password, (me or {}).get("password_hash")):  # step-up re-authentication
        await audit(user, "organization.reset_denied", f"org:{oid} bad password", oid)
        raise HTTPException(403, "Password is incorrect")
    if body.confirm_name.strip() != org["name"]:
        raise HTTPException(422, "Type the organization name exactly to confirm")
    job = {"id": new_id(), "kind": "org_reset", "status": "running", "org_id": oid, "result": {}, "created_at": now_iso(), "finished_at": "", "by": user["id"]}
    await db.jobs.insert_one(dict(job))
    await audit(user, "organization.panel_reset", f"org:{org['name']} reason:{body.reason} counts:{await _counts(oid)}", oid)
    t = asyncio.get_running_loop().create_task(_run_reset(job["id"], oid))
    _jobs.add(t)
    t.add_done_callback(_jobs.discard)
    return JobOut(**job)


@router.get("/superadmin/jobs/{jid}", response_model=JobOut)
async def get_job(jid: str, user: dict = Depends(sa)):
    j = await db.jobs.find_one({"id": jid}, {"_id": 0})
    if not j:
        raise HTTPException(404, "Job not found")
    return JobOut(**j)


# ---------- all landing pages ----------
@router.get("/superadmin/landing-pages", response_model=list[SALandingRow])
async def all_landing_pages(user: dict = Depends(sa)):
    orgs = {o["id"]: o async for o in db.organizations.find({}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "domain": 1})}
    names = {u["id"]: u["name"] async for u in db.users.find({"role": "employee"}, {"_id": 0, "id": 1, "name": 1})}
    rows = []
    async for lp in db.landing_pages.find({"org_id": {"$ne": PLATFORM_ORG}}, {"_id": 0}).sort("title", 1):
        o = orgs.get(lp["org_id"], {})
        cust = await db.conversations.distinct("customer_id", {"landing_page_id": lp["id"]})
        conv = await db.customer_profiles.count_documents({"id": {"$in": cust}, "stage": {"$in": ["Converted", "VIP", "Frequent Customer"]}})
        emp_ids = set(lp.get("assigned_employee_ids", [])) | {i.get("employee_id") for i in lp.get("images", []) if i.get("employee_id")}
        rows.append(SALandingRow(**{**lp, "org_name": o.get("name", ""), "org_slug": o.get("slug", ""), "domain": o.get("domain", ""),
                                    "employee_names": sorted(names[e] for e in emp_ids if e in names), "conversions": conv}))
    return rows


@router.patch("/superadmin/landing-pages/{lid}", response_model=LandingPage)
async def sa_patch_lp(lid: str, body: SALandingPatch, user: dict = Depends(sa)):
    lp = await db.landing_pages.find_one({"id": lid}, {"_id": 0})
    if not lp:
        raise HTTPException(404, "Landing page not found")
    upd = body.model_dump(exclude_none=True)
    if upd.get("archived"):
        upd["published"] = False
    await db.landing_pages.update_one({"id": lid}, {"$set": upd})
    await audit(user, "sa.landing_page_updated", f"landing:{lp['slug']} {upd}", lp["org_id"])
    return LandingPage(**{**lp, **upd})


async def _soft_delete_lp(lid: str, org_filter: dict, user: dict) -> Ok:
    lp = await db.landing_pages.find_one({"id": lid, **org_filter}, {"_id": 0})
    if not lp:
        raise HTTPException(404, "Landing page not found")
    await db.landing_pages.update_one({"id": lid}, {"$set": {"deleted": True, "archived": True, "published": False, "deleted_at": now_iso(),
                                                              "slug": f"{lp['slug']}-deleted-{lid[:6]}"}})  # frees the URL; conversations are kept
    await audit(user, "landing_page.deleted", f"landing:{lp['slug']}", lp["org_id"])
    return Ok(message="Landing page deleted")


@router.delete("/superadmin/landing-pages/{lid}", response_model=Ok)
async def sa_delete_lp(lid: str, user: dict = Depends(sa)):
    return await _soft_delete_lp(lid, {}, user)


@router.delete("/admin/landing-pages/{lid}", response_model=Ok)
async def admin_delete_lp(lid: str, user: dict = Depends(admin)):
    return await _soft_delete_lp(lid, {"org_id": user["org_id"]}, user)  # only the Admin's own organization


# ---------- TalksMe platform support ----------
async def ensure_platform_org() -> None:
    if not await db.organizations.find_one({"id": PLATFORM_ORG}):
        plan = await db.plans.find_one({}, {"_id": 0, "id": 1}) or {"id": ""}
        await db.organizations.insert_one({"id": PLATFORM_ORG, "name": "TalksMe Support", "slug": "talksme-support", "domain": "", "domain_status": "unconfigured",
                                           "plan_id": plan["id"], "billing_cycle": "monthly", "seats": 1, "status": "active", "primary_color": "#0284C7",
                                           "accent_color": "#8B5CF6", "font": "Inter", "logo_url": "/apple-touch-icon.png", "banner_url": "", "retention_days": 365,
                                           "features": {"audio_calls": True}, "created_at": now_iso()})
    if not await db.landing_pages.find_one({"org_id": PLATFORM_ORG, "slug": "support"}):
        await db.landing_pages.insert_one({"id": new_id(), "org_id": PLATFORM_ORG, "title": "TalksMe Support", "slug": "support", "template": "B",
                                           "description": "Talk to the TalksMe team", "cta_text": "Connect with Support Agent", "primary_color": "#0284C7",
                                           "font": "Inter", "logo_url": "", "banner_url": "", "trust_items": [], "routing": "manual", "assigned_employee_ids": [],
                                           "images": [], "calls_enabled": True, "pixel_id": "", "published": True, "available_24_7": False, "views": 0,
                                           "leads": 0, "rr_index": 0, "created_at": now_iso()})


@router.post("/public/support/start", response_model=StartChatOut)
async def support_start(response: Response, viewer: dict | None = Depends(optional_user)):
    """Main-site 'Connect with Support Agent': same guest/session flow as any landing page, routed to the Super Admin support inbox."""
    from routers.public import start_chat  # local import avoids an import cycle
    return await start_chat("talksme-support", "support", StartChatIn(), response, viewer)


@router.get("/superadmin/support/identity", response_model=SupportIdentity)
async def get_identity(user: dict = Depends(sa)):
    return SupportIdentity(**(await db.platform_settings.find_one({"id": "support_identity"}, {"_id": 0}) or {}))


@router.put("/superadmin/support/identity", response_model=SupportIdentity)
async def put_identity(body: SupportIdentity, user: dict = Depends(sa)):
    name = body.display_name.strip()
    if "talksme" not in name.lower():  # must always be identifiable as the platform, never a business/employee
        raise HTTPException(422, "The display name must include 'TalksMe' (e.g. 'TalksMe Support')")
    await db.platform_settings.update_one({"id": "support_identity"}, {"$set": {"display_name": name, "avatar": body.avatar}}, upsert=True)
    await audit(user, "sa.support_identity_updated", f"name:{name}")
    return SupportIdentity(display_name=name, avatar=body.avatar)


@router.get("/superadmin/support/customers", response_model=list[SACustomerPick])
async def support_customers(q: str = "", user: dict = Depends(sa)):
    rx = {"$regex": re.escape(q), "$options": "i"}
    flt: dict = {"role": "customer"}
    if q:
        flt["$or"] = [{"name": rx}, {"phone": rx}, {"email": rx}]
    out = []
    async for u in db.users.find(flt, {"_id": 0, "id": 1, "name": 1, "phone": 1}).limit(30):
        profs = await db.customer_profiles.find({"user_id": u["id"], "org_id": {"$ne": PLATFORM_ORG}}, {"_id": 0, "org_id": 1, "opted_in": 1}).to_list(50)
        orgs = {o["id"]: o["name"] async for o in db.organizations.find({"id": {"$in": [p["org_id"] for p in profs]}}, {"_id": 0, "id": 1, "name": 1})}
        out.append(SACustomerPick(user_id=u["id"], name=u["name"], phone=u.get("phone") or "", orgs=sorted(orgs.values()),
                                  opted_in=any(p.get("opted_in") for p in profs)))
    return out


@router.post("/superadmin/support/conversations", response_model=StartChatOut)
async def support_create(body: SupportStartIn, user: dict = Depends(sa)):
    cust = await db.users.find_one({"id": body.customer_user_id, "role": "customer"}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    if body.kind == "announcement":  # promotional: only to customers who opted in and didn't unsubscribe
        if not await db.customer_profiles.find_one({"user_id": cust["id"], "opted_in": True, "blocked": {"$ne": True}}):
            raise HTTPException(403, "This customer hasn't opted in to announcements")
    lp = await db.landing_pages.find_one({"org_id": PLATFORM_ORG, "slug": "support"}, {"_id": 0})
    cid = await open_conversation(cust, lp, None)
    from routers.chat import sender_display
    t = now_iso()
    text = body.text.strip() + ("\n\nReply STOP to stop TalksMe announcements." if body.kind == "announcement" else "")
    await db.messages.insert_one({"id": new_id(), "conversation_id": cid, "org_id": PLATFORM_ORG, "sender_role": "employee", "sender_id": user["id"],
                                  "sender_name": await sender_display(user), "text": text, "attachment": None, "reply_to": None, "reply_preview": "",
                                  "status": "sent", "created_at": t, "idempotency_key": new_id(), "hidden_for": []})
    await db.conversations.update_one({"id": cid}, {"$set": {"last_message": text[:120], "last_message_at": t}, "$inc": {"unread_customer": 1}})
    c = await db.conversations.find_one({"id": cid}, {"_id": 0})
    await publish(c, {"type": "message", "sender_id": user["id"]})
    await push_to({cust["id"]}, {"title": "TalksMe Support", "body": text[:120], "url": f"/chat/{cid}", "tag": f"msg-{cid}"})
    await audit(user, f"sa.support_{body.kind}_sent", f"customer:{cust['name']} conversation:{cid}")
    return StartChatOut(status="ok", conversation_id=cid)


# ---------- Admin -> customer notifications ----------
@router.post("/admin/notifications", response_model=NotificationRecord)
async def admin_notify(body: NotifyIn, user: dict = Depends(admin)):
    prof = await db.customer_profiles.find_one({"id": body.customer_id, "org_id": user["org_id"]}, {"_id": 0})
    if not prof:
        raise HTTPException(404, "Customer not found in your organization")
    if body.url and not re.match(r"^(https://|/)", body.url):
        raise HTTPException(422, "Link must start with https:// or /")
    cu = await db.users.find_one({"id": prof["user_id"]}, {"_id": 0, "notify_push": 1})
    devices = await db.push_subscriptions.count_documents({"user_id": prof["user_id"]})
    delivered = 0
    if prof.get("blocked") or (cu or {}).get("notify_push") is False:
        status = "blocked_by_preferences"
    elif not devices:
        status = "no_device"
    else:
        org = await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0, "name": 1}) or {}
        delivered = await push_to({prof["user_id"]}, {"title": f"{body.title} · {org.get('name', '')}", "body": body.body,
                                                      "url": body.url or "/chat", "tag": f"admin-{new_id()[:8]}"}, only_if_not_visible=False)
        status = "sent" if delivered else "failed"
    rec = {"id": new_id(), "org_id": user["org_id"], "customer_id": prof["id"], "customer_name": prof["name"], "title": body.title, "body": body.body,
           "url": body.url, "status": status, "devices": devices, "delivered": delivered or 0, "sent_by": user["name"], "created_at": now_iso()}
    await db.notifications.insert_one(dict(rec))
    await audit(user, "notification.sent", f"customer:{prof['name']} status:{status}", user["org_id"])
    return NotificationRecord(**rec)


@router.get("/admin/notifications", response_model=list[NotificationRecord])
async def admin_notify_history(user: dict = Depends(admin)):
    return await db.notifications.find({"org_id": user["org_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


# ---------- employee: default message on assigned pages (when Admin allows) ----------
@router.get("/employee/landing-pages", response_model=list[LandingPage])
async def emp_pages(user: dict = Depends(emp)):
    q = {"org_id": user["org_id"], "deleted": {"$ne": True}, "$or": [{"assigned_employee_ids": user["id"]}, {"images.employee_id": user["id"]}]}
    return await db.landing_pages.find(q, {"_id": 0}).to_list(100)


@router.patch("/employee/landing-pages/{lid}/default-message", response_model=LandingPage)
async def emp_default_msg(lid: str, body: DefaultMessageIn, user: dict = Depends(emp)):
    lp = await db.landing_pages.find_one({"id": lid, "org_id": user["org_id"], "$or": [{"assigned_employee_ids": user["id"]}, {"images.employee_id": user["id"]}]}, {"_id": 0})
    if not lp:
        raise HTTPException(404, "Landing page not found")
    if not lp.get("employee_can_edit_message"):
        raise HTTPException(403, "Your Admin hasn't allowed employees to edit this page's default message")
    await db.landing_pages.update_one({"id": lid}, {"$set": {"default_message": body.default_message.strip()}})
    await audit(user, "landing_page.default_message_updated", f"landing:{lp['slug']}", user["org_id"])
    return LandingPage(**{**lp, "default_message": body.default_message.strip()})
