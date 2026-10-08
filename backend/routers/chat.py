"""Conversations + messages for customers, employees and admins (scoped per role in lib.conv)."""
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import require
from lib.conv import get_conv, shape
from lib.db import db
from lib.util import audit, new_id, now_iso
from models.schemas import (AssignIn, Call, CallIn, Conversation, ConversationPatch, Message, MessageIn, Ok, ReportIn,
                            Transfer, TransferIn)

router = APIRouter()
chat_user = require("customer", "employee", "admin")
_rate: dict[str, list[float]] = {}


@router.get("/conversations", response_model=list[Conversation])
async def list_conversations(filter: str = "all", q: str = "", user: dict = Depends(chat_user)):
    r = user["role"]
    if r == "customer":
        query: dict = {"customer_user_id": user["id"]}
    elif r == "employee":
        query = {"org_id": user["org_id"], "employee_id": None if filter == "queue" else user["id"]}
    else:
        query = {"org_id": user["org_id"]}
        if filter == "queue":
            query["employee_id"] = None
    if q:
        query["$or"] = [{"customer_name": {"$regex": q, "$options": "i"}}, {"customer_phone": {"$regex": q.replace("+", r"\+")}},
                        {"last_message": {"$regex": q, "$options": "i"}}, {"employee_name": {"$regex": q, "$options": "i"}}]
    if filter == "followup":
        query["follow_up"] = True
    if filter == "unread":
        query["unread_customer" if r == "customer" else "unread_employee"] = {"$gt": 0}
    convs = await db.conversations.find(query, {"_id": 0}).sort("last_message_at", -1).to_list(1000)
    # delivery receipts: the other side's "sent" messages are now delivered to this device
    other = "employee" if r == "customer" else "customer"
    ids = [c["id"] for c in convs]
    await db.messages.update_many({"conversation_id": {"$in": ids}, "sender_role": other, "status": "sent"},
                                  {"$set": {"status": "delivered"}})
    out = await shape(user, convs)
    if filter == "archived":
        return [c for c in out if c["archived"]]
    out = [c for c in out if not c["archived"]]
    if filter == "vip":
        out = [c for c in out if c["vip"]]
    return out


@router.get("/conversations/{cid}", response_model=Conversation)
async def get_conversation(cid: str, user: dict = Depends(chat_user)):
    return (await shape(user, [await get_conv(user, cid)]))[0]


@router.get("/conversations/{cid}/messages", response_model=list[Message])
async def list_messages(cid: str, before: Optional[str] = None, limit: int = 100, user: dict = Depends(chat_user)):
    c = await get_conv(user, cid)
    q: dict = {"conversation_id": cid, "hidden_for": {"$ne": user["id"]}}
    if before:
        q["created_at"] = {"$lt": before}
    msgs = await db.messages.find(q, {"_id": 0}).sort("created_at", -1).limit(min(limit, 200)).to_list(200)
    side = "customer" if user["role"] == "customer" else "employee"
    other = "employee" if side == "customer" else "customer"
    await db.messages.update_many({"conversation_id": cid, "sender_role": other, "status": {"$ne": "read"}}, {"$set": {"status": "read"}})
    if c.get(f"unread_{side}", 0):
        await db.conversations.update_one({"id": cid}, {"$set": {f"unread_{side}": 0}})
    return list(reversed(msgs))


@router.post("/conversations/{cid}/messages", response_model=Message)
async def send_message(cid: str, body: MessageIn, user: dict = Depends(chat_user)):
    c = await get_conv(user, cid)
    if not body.text.strip() and not body.attachment:
        raise HTTPException(422, "Message is empty")
    dup = await db.messages.find_one({"conversation_id": cid, "idempotency_key": body.idempotency_key}, {"_id": 0})
    if dup:
        return Message(**dup)  # network retry / double click: return the original
    prof = await db.customer_profiles.find_one({"id": c["customer_id"]}, {"_id": 0})
    if prof and prof.get("blocked"):
        raise HTTPException(403, "This conversation is blocked")
    if c.get("blocked_by_customer") and user["role"] != "customer":
        raise HTTPException(403, "The customer has blocked this business")
    # rate limit: 20 messages per 10 seconds per user
    t = now_iso()
    tnow = time.time()
    recent = [x for x in _rate.get(user["id"], []) if tnow - x < 10]
    if len(recent) >= 20:
        raise HTTPException(429, "You're sending messages too quickly")
    _rate[user["id"]] = recent + [tnow]
    if body.attachment and body.attachment.size > 25 * 1024 * 1024:
        raise HTTPException(413, "Attachments must be under 25 MB")
    side = "customer" if user["role"] == "customer" else "employee"
    preview = ""
    if body.reply_to:
        orig = await db.messages.find_one({"id": body.reply_to, "conversation_id": cid}, {"_id": 0, "text": 1})
        preview = (orig or {}).get("text", "")[:80]
    msg = {"id": new_id(), "conversation_id": cid, "org_id": c["org_id"], "sender_role": side, "sender_id": user["id"],
           "sender_name": user["name"], "text": body.text.strip(), "attachment": body.attachment.model_dump() if body.attachment else None,
           "reply_to": body.reply_to, "reply_preview": preview, "status": "sent", "created_at": t,
           "idempotency_key": body.idempotency_key, "hidden_for": []}
    await db.messages.insert_one(dict(msg))
    other = "employee" if side == "customer" else "customer"
    label = body.text.strip() or {"image": "📷 Photo", "video": "🎬 Video", "audio": "🎤 Voice note", "file": "📎 File"}[body.attachment.kind]
    upd: dict = {"$set": {"last_message": label[:120], "last_message_at": t, f"typing.{side}": ""}, "$inc": {f"unread_{other}": 1}}
    if side == "employee" and not c.get("employee_id"):
        upd["$set"].update({"employee_id": user["id"], "employee_name": user["name"]})  # claim from queue
        await db.customer_profiles.update_one({"id": c["customer_id"], "assigned_employee_id": None},
                                              {"$set": {"assigned_employee_id": user["id"], "assigned_employee_name": user["name"]}})
    await db.conversations.update_one({"id": cid}, upd)
    if side == "customer":
        await db.customer_profiles.update_one({"id": c["customer_id"]}, {"$set": {"last_active": t}})
    return Message(**msg)


@router.post("/conversations/{cid}/messages/{mid}/hide", response_model=Ok)
async def hide_message(cid: str, mid: str, user: dict = Depends(chat_user)):
    await get_conv(user, cid)
    res = await db.messages.update_one({"id": mid, "conversation_id": cid}, {"$addToSet": {"hidden_for": user["id"]}})
    if not res.matched_count:
        raise HTTPException(404, "Message not found")
    return Ok(message="Deleted for you")


@router.post("/conversations/{cid}/typing", response_model=Ok)
async def typing(cid: str, user: dict = Depends(chat_user)):
    await get_conv(user, cid)
    side = "customer" if user["role"] == "customer" else "employee"
    await db.conversations.update_one({"id": cid}, {"$set": {f"typing.{side}": now_iso()}})
    return Ok()


@router.patch("/conversations/{cid}", response_model=Conversation)
async def patch_conversation(cid: str, body: ConversationPatch, user: dict = Depends(chat_user)):
    await get_conv(user, cid)
    ops: dict = {}
    for field, arr in (("archived", "archived_by"), ("muted", "muted_by")):
        v = getattr(body, field)
        if v is not None:
            ops.setdefault("$addToSet" if v else "$pull", {})[arr] = user["id"]
    if body.follow_up is not None:
        if user["role"] == "customer":
            raise HTTPException(403, "Not allowed")
        ops["$set"] = {"follow_up": body.follow_up}
    for op, val in ops.items():
        await db.conversations.update_one({"id": cid}, {op: val})
    return (await shape(user, [await get_conv(user, cid)]))[0]


@router.post("/conversations/{cid}/report", response_model=Ok)
async def report(cid: str, body: ReportIn, user: dict = Depends(require("customer"))):
    c = await get_conv(user, cid)
    await db.conversations.update_one({"id": cid}, {"$set": {"blocked_by_customer": body.block}})
    await audit(user, "customer.block_report" if body.block else "customer.unblock_business", f"conversation:{cid}", c["org_id"], body.reason)
    return Ok(message="Business blocked and reported" if body.block else "Business unblocked")


@router.get("/conversations/{cid}/calls", response_model=list[Call])
async def list_calls(cid: str, user: dict = Depends(chat_user)):
    await get_conv(user, cid)
    return await db.calls.find({"conversation_id": cid}, {"_id": 0}).sort("at", -1).to_list(100)


@router.post("/conversations/{cid}/calls", response_model=Call)
async def log_call(cid: str, body: CallIn, user: dict = Depends(chat_user)):
    """MOCKED WebRTC: the client simulates call state and logs the outcome here."""
    c = (await shape(user, [await get_conv(user, cid)]))[0]
    if not c["calls_enabled"] or c["blocked"]:
        raise HTTPException(403, "Audio calls are disabled for this conversation")
    call = {"id": new_id(), "conversation_id": cid, "org_id": c["org_id"], "initiated_by": user["role"],
            "status": body.status, "duration": body.duration, "at": now_iso()}
    await db.calls.insert_one(dict(call))
    label = f"📞 Audio call · {body.status}" + (f" · {body.duration // 60}:{body.duration % 60:02d}" if body.duration else "")
    await db.messages.insert_one({"id": new_id(), "conversation_id": cid, "org_id": c["org_id"], "sender_role": "system",
                                  "sender_id": None, "sender_name": "System", "text": label, "attachment": None,
                                  "reply_to": None, "reply_preview": "", "status": "read", "created_at": call["at"],
                                  "idempotency_key": new_id(), "hidden_for": []})
    await db.conversations.update_one({"id": cid}, {"$set": {"last_message": label, "last_message_at": call["at"]}})
    return Call(**call)


@router.post("/conversations/{cid}/transfer", response_model=Transfer)
async def request_transfer(cid: str, body: TransferIn, user: dict = Depends(require("employee"))):
    c = await get_conv(user, cid)
    if c.get("employee_id") != user["id"]:
        raise HTTPException(403, "Only the assigned employee can request a transfer")
    target = await db.users.find_one({"id": body.to_employee_id, "org_id": user["org_id"], "role": "employee", "active": True}, {"_id": 0})
    if not target or target["id"] == user["id"]:
        raise HTTPException(400, "Choose another active employee in your organization")
    if await db.transfers.find_one({"conversation_id": cid, "status": "pending"}):
        raise HTTPException(409, "A transfer request is already pending for this conversation")
    tr = {"id": new_id(), "org_id": user["org_id"], "conversation_id": cid, "customer_name": c["customer_name"],
          "from_employee_id": user["id"], "from_employee_name": user["name"], "to_employee_id": target["id"],
          "to_employee_name": target["name"], "reason": body.reason, "status": "pending", "created_at": now_iso(), "decided_by_name": ""}
    await db.transfers.insert_one(dict(tr))
    await audit(user, "transfer.requested", f"conversation:{cid}", user["org_id"], body.reason)
    return Transfer(**tr)


async def reassign(actor: dict, c: dict, emp: dict, reason: str) -> None:
    await db.conversations.update_one({"id": c["id"]}, {"$set": {"employee_id": emp["id"], "employee_name": emp["name"]}})
    await db.customer_profiles.update_one({"id": c["customer_id"]}, {"$set": {"assigned_employee_id": emp["id"], "assigned_employee_name": emp["name"]}})
    await db.messages.insert_one({"id": new_id(), "conversation_id": c["id"], "org_id": c["org_id"], "sender_role": "system",
                                  "sender_id": None, "sender_name": "System", "text": f"Conversation transferred to {emp['name']}",
                                  "attachment": None, "reply_to": None, "reply_preview": "", "status": "read",
                                  "created_at": now_iso(), "idempotency_key": new_id(), "hidden_for": []})
    await audit(actor, "conversation.reassigned", f"conversation:{c['id']} -> {emp['name']}", c["org_id"], reason)


@router.post("/conversations/{cid}/assign", response_model=Conversation)
async def assign(cid: str, body: AssignIn, user: dict = Depends(require("admin"))):
    c = await get_conv(user, cid)
    emp = await db.users.find_one({"id": body.employee_id, "org_id": user["org_id"], "role": "employee"}, {"_id": 0})
    if not emp:
        raise HTTPException(400, "Employee not found in your organization")
    await reassign(user, c, emp, body.reason)
    return (await shape(user, [await get_conv(user, cid)]))[0]
