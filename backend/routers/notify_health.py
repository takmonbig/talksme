"""Admin Notification Health: who in this org has push notifications on, plus a one-tap reminder (chat system message + live popup)."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import current_user, require
from lib.db import db
from lib.realtime import hub, publish
from lib.util import audit, iso, new_id, now, now_iso
from models.schemas import NotifyHealthRow, NotifyRemindIn, NotifyRemindOut, Ok, PendingNotifyReminder

router = APIRouter()
admin = require("admin")
COOLDOWN = timedelta(minutes=5)


async def _device_stats(uids: list[str]) -> dict[str, dict]:
    pipe = [{"$match": {"user_id": {"$in": uids}}},
            {"$group": {"_id": "$user_id", "devices": {"$sum": 1}, "last": {"$max": "$updated_at"}}}]
    return {d["_id"]: d async for d in db.push_subscriptions.aggregate(pipe)}


@router.get("/admin/notification-health", response_model=list[NotifyHealthRow])
async def health(kind: str = Query("employee", pattern="^(employee|customer)$"), user: dict = Depends(admin)):
    org = user["org_id"]
    if kind == "employee":
        people = [{"user_id": u["id"], "name": u["name"], "contact": u.get("email", ""), "avatar": u.get("avatar", "")}
                  async for u in db.users.find({"org_id": org, "role": "employee", "deleted": {"$ne": True}}, {"_id": 0})]
    else:
        people = [{"user_id": p["user_id"], "profile_id": p["id"], "name": p["name"], "contact": p.get("phone") or "guest", "avatar": ""}
                  async for p in db.customer_profiles.find({"org_id": org, "user_id": {"$ne": None}}, {"_id": 0})]
    uids = [p["user_id"] for p in people]
    stats = await _device_stats(uids)
    muted = {u["id"] async for u in db.users.find({"id": {"$in": uids}, "notify_push": False}, {"_id": 0, "id": 1})}
    reminded = {r["user_id"]: r["at"] async for r in db.notify_reminders.find({"org_id": org, "user_id": {"$in": uids}}, {"_id": 0})}
    rows = []
    for p in people:
        s = stats.get(p["user_id"], {})
        devices = s.get("devices", 0)
        status = "muted" if p["user_id"] in muted else ("on" if devices else "off")
        rows.append(NotifyHealthRow(**p, kind=kind, status=status, devices=devices, last_subscribed_at=s.get("last") or "",
                                    last_reminded_at=reminded.get(p["user_id"], "")))
    return rows


@router.post("/admin/notification-health/remind", response_model=NotifyRemindOut)
async def remind(body: NotifyRemindIn, user: dict = Depends(admin)):
    org_id = user["org_id"]
    target = await db.users.find_one({"id": body.user_id}, {"_id": 0})
    prof = await db.customer_profiles.find_one({"user_id": body.user_id, "org_id": org_id}, {"_id": 0}) if target and target["role"] == "customer" else None
    if not target or (target["role"] == "employee" and target.get("org_id") != org_id) or (target["role"] == "customer" and not prof) \
            or target["role"] not in ("employee", "customer"):
        raise HTTPException(404, "Person not found in your organization")
    prev = await db.notify_reminders.find_one({"org_id": org_id, "user_id": body.user_id}, {"_id": 0})
    if prev and prev.get("at", "") > iso(now() - COOLDOWN):
        raise HTTPException(429, "Already reminded in the last 5 minutes")
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1}) or {}
    at = now_iso()
    text = f"🔔 {org.get('name', 'The team')} asks you to turn on notifications so you never miss a reply or call."
    in_chat = False
    if prof:
        c = await db.conversations.find_one({"customer_id": prof["id"], "org_id": org_id}, {"_id": 0}, sort=[("last_message_at", -1)])
        if c:
            await db.messages.insert_one({"id": new_id(), "conversation_id": c["id"], "org_id": org_id, "sender_role": "system", "kind": "notify_request",
                                          "sender_id": None, "sender_name": "System", "text": text, "attachment": None, "reply_to": None,
                                          "reply_preview": "", "status": "sent", "created_at": at, "idempotency_key": new_id(), "hidden_for": []})
            await publish(c, {"type": "message"})
            in_chat = True
    pending = {"org_id": org_id, "org_name": org.get("name", ""), "from_name": user["name"], "text": text, "at": at}
    await db.users.update_one({"id": body.user_id}, {"$set": {"notify_reminder_pending": pending}})
    await db.notify_reminders.update_one({"org_id": org_id, "user_id": body.user_id}, {"$set": {"org_id": org_id, "user_id": body.user_id, "at": at}}, upsert=True)
    live = hub.online(body.user_id) or await hub.visible_now(body.user_id)
    await hub.send({body.user_id}, {"type": "notify_reminder", "conversation_id": ""})
    await audit(user, "notification.reminder_sent", f"user:{target['name']}", org_id)
    msg = "Reminder popup shown now" if live else "They'll see the reminder next time they open the app"
    return NotifyRemindOut(live=live, in_chat=in_chat, last_reminded_at=at, message=msg + (" · also posted in their chat" if in_chat else ""))


@router.get("/me/notify-reminder", response_model=PendingNotifyReminder | None)
async def my_reminder(user: dict = Depends(current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "notify_reminder_pending": 1}) or {}
    p = u.get("notify_reminder_pending")
    return PendingNotifyReminder(**p) if p else None


@router.post("/me/notify-reminder/ack", response_model=Ok)
async def ack_reminder(user: dict = Depends(current_user)):
    await db.users.update_one({"id": user["id"]}, {"$unset": {"notify_reminder_pending": ""}})
    return Ok(message="ok")
