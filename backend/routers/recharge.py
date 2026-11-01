"""Service recharge (landing template C): customer picks a service + amount, pays by UPI, uploads a screenshot;
the assigned employee (or anyone on the org's shared queue) verifies it and delivers the platform ID + password,
or rejects it with a reason. Approved recharges are also written to the deposit ledger."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import require
from lib.db import db
from lib.push import push_bg
from lib.realtime import hub, publish
from lib.util import audit, iso, new_id, now, now_iso
from models.schemas import RechargeApproveIn, RechargeIn, RechargeRejectIn, RechargeRequest, RechargeSummary

router = APIRouter()
staff = require("employee", "admin")
customer = require("customer")


async def _chat_note(conv: dict | None, text: str, sender: str = "system") -> None:
    if not conv:
        return
    t = now_iso()
    await db.messages.insert_one({"id": new_id(), "conversation_id": conv["id"], "org_id": conv["org_id"], "sender_role": sender, "sender_id": None,
                                  "sender_name": "System", "text": text, "attachment": None, "reply_to": None, "reply_preview": "", "kind": "recharge",
                                  "status": "sent", "created_at": t, "idempotency_key": new_id(), "hidden_for": []})
    await db.conversations.update_one({"id": conv["id"]}, {"$set": {"last_message": text[:120], "last_message_at": t}, "$inc": {"unread_customer": 1, "unread_employee": 1}})
    await publish(conv, {"type": "message"})


@router.post("/recharge", response_model=RechargeRequest)
async def create(body: RechargeIn, user: dict = Depends(customer)):
    org = await db.organizations.find_one({"slug": body.org_slug}, {"_id": 0})
    lp = await db.landing_pages.find_one({"org_id": (org or {}).get("id"), "slug": body.slug, "template": "C", "published": True}, {"_id": 0}) if org else None
    svc = next((s for s in (lp or {}).get("services", []) if s["id"] == body.service_id and s.get("active", True)), None)
    if not lp or not svc:
        raise HTTPException(404, "Service not found")
    if not (svc["min_amount"] <= body.amount <= svc["max_amount"]):
        raise HTTPException(422, f"Amount must be between ₹{svc['min_amount']:g} and ₹{svc['max_amount']:g}")
    me = await db.users.find_one({"id": user["id"]}, {"_id": 0, "phone": 1})
    if not (me or {}).get("phone"):
        raise HTTPException(428, "Please share your WhatsApp number first. We need it for payment backup.")
    if await db.recharges.count_documents({"customer_user_id": user["id"], "org_id": org["id"], "status": "pending"}) >= 5:
        raise HTTPException(429, "You already have 5 payments waiting for verification. Please wait for the team.")
    dup = await db.recharges.find_one({"customer_user_id": user["id"], "screenshot_url": body.screenshot_url}, {"_id": 0})
    if dup:  # double tap / retry: same screenshot = same request
        return RechargeRequest(**dup)
    conv = await db.conversations.find_one({"customer_user_id": user["id"], "landing_page_id": lp["id"]}, {"_id": 0})
    emp = await db.users.find_one({"id": (conv or {}).get("employee_id")}, {"_id": 0, "id": 1, "name": 1}) if conv and conv.get("employee_id") else None
    bonus = round(body.amount * svc.get("bonus_pct", 0) / 100, 2)
    t = now_iso()
    doc = {"id": new_id(), "org_id": org["id"], "org_name": org["name"], "landing_page_id": lp["id"], "service_id": svc["id"], "service_name": svc["name"],
           "service_image": svc.get("image", ""), "customer_user_id": user["id"], "customer_name": user["name"], "customer_phone": me["phone"],
           "conversation_id": (conv or {}).get("id", ""), "employee_id": emp["id"] if emp else None, "employee_name": emp["name"] if emp else "",
           "amount": body.amount, "bonus_pct": svc.get("bonus_pct", 0), "bonus_amount": bonus, "total_credit": round(body.amount + bonus, 2),
           "screenshot_url": body.screenshot_url, "utr": body.utr.strip(), "status": "pending", "reject_reason": "", "handled_by_name": "",
           "credentials": None, "created_at": t, "updated_at": t}
    await db.recharges.insert_one(dict(doc))
    await _chat_note(conv, f"💳 Payment of ₹{body.amount:g} for {svc['name']} submitted (bonus ₹{bonus:g}). Waiting for verification…")
    # assigned employee + the org's shared queue (admins and online employees) get pinged right away
    uids = {emp["id"]} if emp else set()
    uids |= {u["id"] async for u in db.users.find({"org_id": org["id"], "active": {"$ne": False}, "$or": [{"role": "admin"}, {"role": "employee", "status": "online"}]}, {"_id": 0, "id": 1})}
    await hub.send(uids, {"type": "recharge", "conversation_id": doc["conversation_id"], "from_name": user["name"], "payload": {"amount": body.amount, "service": svc["name"]}})
    push_bg(uids, {"title": f"💳 New payment ₹{body.amount:g} · {user['name']}", "body": f"{svc['name']}: verify the screenshot and send the ID",
                   "url": "/employee/recharges", "tag": f"rch-{doc['id']}"}, only_if_not_visible=False)
    return RechargeRequest(**doc)


@router.get("/me/recharges", response_model=list[RechargeRequest])
async def mine(user: dict = Depends(customer)):
    return [RechargeRequest(**d) async for d in db.recharges.find({"customer_user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(100)]


@router.get("/recharge/requests", response_model=list[RechargeRequest])
async def queue(status: str = Query("pending", pattern="^(pending|approved|rejected|all)$"), user: dict = Depends(staff)):
    q: dict = {"org_id": user["org_id"]}
    if status != "all":
        q["status"] = status
    rows = [RechargeRequest(**d) async for d in db.recharges.find(q, {"_id": 0}).sort("created_at", -1).limit(300)]
    # mine first, then the shared queue
    return sorted(rows, key=lambda r: r.employee_id != user["id"]) if status == "pending" else rows


@router.get("/recharge/summary", response_model=RechargeSummary)
async def summary(user: dict = Depends(staff)):
    org = user["org_id"]
    ist = timedelta(hours=5, minutes=30)  # "today" = India calendar day
    start = iso((now() + ist).replace(hour=0, minute=0, second=0, microsecond=0) - ist)
    ok = [d async for d in db.recharges.find({"org_id": org, "status": "approved"}, {"_id": 0, "amount": 1, "updated_at": 1})]
    today = [d for d in ok if d.get("updated_at", "") >= start]
    return RechargeSummary(pending=await db.recharges.count_documents({"org_id": org, "status": "pending"}), approved_today=len(today),
                           approved_total_amount=sum(d["amount"] for d in ok), approved_today_amount=sum(d["amount"] for d in today))


async def _claim(rid: str, user: dict, update: dict) -> dict:
    """Atomic pending -> approved/rejected so two employees can't handle the same payment."""
    d = await db.recharges.find_one_and_update({"id": rid, "org_id": user["org_id"], "status": "pending"},
                                               {"$set": {**update, "handled_by": user["id"], "handled_by_name": user["name"], "updated_at": now_iso()}},
                                               projection={"_id": 0}, return_document=True)
    if not d:
        raise HTTPException(409, "This payment was already handled or doesn't exist")
    return d


@router.post("/recharge/requests/{rid}/approve", response_model=RechargeRequest)
async def approve(rid: str, body: RechargeApproveIn, user: dict = Depends(staff)):
    d = await _claim(rid, user, {"status": "approved", "credentials": body.model_dump()})
    conv = await db.conversations.find_one({"id": d["conversation_id"]}, {"_id": 0}) if d.get("conversation_id") else None
    if conv:  # count it in the deposit ledger / employee totals
        t = now_iso()
        dep = {"id": new_id(), "org_id": d["org_id"], "customer_id": conv["customer_id"], "customer_name": d["customer_name"],
               "employee_id": d.get("employee_id") or user["id"], "employee_name": d.get("employee_name") or user["name"], "amount": d["amount"],
               "currency": "INR", "product": d["service_name"][:120], "method": "UPI", "reference": f"RCH-{d['id'][:8].upper()}", "payment_date": t[:10],
               "notes": f"Recharge verified by {user['name']}" + (f" · UTR {d['utr']}" if d.get("utr") else ""), "proof_name": "screenshot",
               "status": "Reviewed", "created_at": t}
        await db.deposits.insert_one(dict(dep))
        await db.deposit_events.insert_one({"id": new_id(), "deposit_id": dep["id"], "org_id": dep["org_id"], "action": "recorded", "from_status": "",
                                            "to_status": "Reviewed", "old_amount": None, "new_amount": dep["amount"], "reason": "Recharge verified", "actor_name": user["name"], "at": t})
        await db.customer_profiles.update_one({"id": conv["customer_id"], "stage": {"$in": ["New Lead", "Interested", "Hot Lead"]}}, {"$set": {"stage": "Converted"}, "$addToSet": {"labels": "Converted"}})
    await _chat_note(conv, f"✅ Payment of ₹{d['amount']:g} verified! Your {d['service_name']} ID & password are ready in My Services. Enjoy! 🎉")
    await hub.send({d["customer_user_id"]}, {"type": "recharge_update", "conversation_id": d.get("conversation_id", "")})
    push_bg({d["customer_user_id"]}, {"title": f"✅ {d['service_name']} is ready!", "body": "Payment verified. Tap to see your ID & password.", "url": "/chat?tab=services", "tag": f"rch-{d['id']}"}, only_if_not_visible=False)
    await audit(user, "recharge.approved", f"recharge:{d['id']}", d["org_id"], f"₹{d['amount']:g} {d['service_name']}")
    return RechargeRequest(**d)


@router.post("/recharge/requests/{rid}/reject", response_model=RechargeRequest)
async def reject(rid: str, body: RechargeRejectIn, user: dict = Depends(staff)):
    d = await _claim(rid, user, {"status": "rejected", "reject_reason": body.reason.strip()})
    conv = await db.conversations.find_one({"id": d["conversation_id"]}, {"_id": 0}) if d.get("conversation_id") else None
    await _chat_note(conv, f"❌ Your payment request of ₹{d['amount']:g} was rejected: {d['reject_reason']}")
    await hub.send({d["customer_user_id"]}, {"type": "recharge_update", "conversation_id": d.get("conversation_id", "")})
    push_bg({d["customer_user_id"]}, {"title": "❌ Payment request rejected", "body": d["reject_reason"][:120], "url": "/chat?tab=services", "tag": f"rch-{d['id']}"}, only_if_not_visible=False)
    await audit(user, "recharge.rejected", f"recharge:{d['id']}", d["org_id"], d["reject_reason"])
    return RechargeRequest(**d)
