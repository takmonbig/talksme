"""Conversation access control, per-viewer shaping and the assignment engine."""
from datetime import timedelta
from typing import Optional

from fastapi import HTTPException

from lib.db import db
from lib.util import iso, new_id, now, now_iso


PLATFORM_ORG = "org-platform"  # TalksMe platform-support org; its inbox belongs to Super Admins


def can_access(user: dict, c: dict) -> bool:
    r = user["role"]
    if r == "superadmin":
        return c["org_id"] == PLATFORM_ORG
    if r == "customer":
        return c["customer_user_id"] == user["id"]
    if r == "employee":
        return c["org_id"] == user["org_id"] and c.get("employee_id") in (user["id"], None)
    if r == "admin":
        return c["org_id"] == user["org_id"]
    return False  # super admin uses audited support access, never the inbox


async def get_conv(user: dict, cid: str) -> dict:
    c = await db.conversations.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Conversation not found")
    if not can_access(user, c):
        raise HTTPException(403, "You do not have access to this conversation")
    return c


async def shape(user: dict, convs: list[dict]) -> list[dict]:
    """Attach per-viewer fields (unread, archived, muted, typing) and joined org/employee/profile data."""
    org_ids = {c["org_id"] for c in convs}
    emp_ids = {c["employee_id"] for c in convs if c.get("employee_id")}
    prof_ids = {c["customer_id"] for c in convs}
    orgs = {o["id"]: o async for o in db.organizations.find({"id": {"$in": list(org_ids)}}, {"_id": 0})}
    emps = {e["id"]: e async for e in db.users.find({"id": {"$in": list(emp_ids)}}, {"_id": 0, "password_hash": 0})}
    profs = {p["id"]: p async for p in db.customer_profiles.find({"id": {"$in": list(prof_ids)}}, {"_id": 0})}
    lps = {lp["id"]: lp async for lp in db.landing_pages.find({"org_id": {"$in": list(org_ids)}}, {"_id": 0, "id": 1, "calls_enabled": 1})}
    is_cust = user["role"] == "customer"
    cutoff = iso(now() - timedelta(seconds=5))
    out = []
    for c in convs:
        emp = emps.get(c.get("employee_id") or "", {})
        prof = profs.get(c["customer_id"], {})
        other = "employee" if is_cust else "customer"
        out.append({
            **c,
            "org_name": orgs.get(c["org_id"], {}).get("name", ""),
            "org_color": orgs.get(c["org_id"], {}).get("primary_color", "#0284C7"),
            "employee_name": emp.get("name", ""),
            "employee_avatar": emp.get("avatar", ""),
            "employee_status": emp.get("status", "offline"),
            "employee_title": emp.get("title", ""),
            "employee_bio": emp.get("bio", ""),
            "employee_link": emp.get("profile_link", ""),
            "employee_verified": bool(emp.get("verified")),
            "customer_name": prof.get("name", c["customer_name"]),
            "unread": c.get("unread_customer" if is_cust else "unread_employee", 0),
            "archived": user["id"] in c.get("archived_by", []),
            "muted": user["id"] in c.get("muted_by", []),
            "vip": "VIP" in prof.get("labels", []),
            "blocked": bool(prof.get("blocked")) or bool(c.get("blocked_by_customer")),
            "calls_enabled": lps.get(c.get("landing_page_id") or "", {}).get("calls_enabled", True) and emp.get("calls_enabled", True)
            and (not is_cust or prof.get("calls_allowed", True)),
            "customer_calls_allowed": prof.get("calls_allowed", True),
            "typing": (c.get("typing") or {}).get(other, "") > cutoff,
        })
    return out


async def pick_employee(lp: dict, preferred: Optional[str]) -> Optional[str]:
    """Assignment engine: fixed / round robin / least busy / manual (queue) / team queue."""
    ids = lp.get("assigned_employee_ids", [])
    emps = [e async for e in db.users.find({"id": {"$in": ids}, "active": True, "role": "employee"}, {"_id": 0})]
    if preferred and any(e["id"] == preferred for e in emps):
        return preferred
    if not emps:
        return None
    routing = lp.get("routing", "round_robin")
    online = [e for e in emps if e.get("status") == "online"]
    if routing == "manual":
        return None
    if routing == "fixed":
        return ids[0] if ids and any(e["id"] == ids[0] for e in emps) else emps[0]["id"]
    if routing == "round_robin":
        pool = online or emps  # offline employees are skipped when someone is online
        ordered = [e for i in ids for e in pool if e["id"] == i]
        idx = lp.get("rr_index", 0) % len(ordered)
        await db.landing_pages.update_one({"id": lp["id"]}, {"$inc": {"rr_index": 1}})
        return ordered[idx]["id"]
    # least_busy and team: least open conversations among online employees, else wait in queue
    if not online:
        return None
    counts = {e["id"]: await db.conversations.count_documents({"employee_id": e["id"], "status": "open"}) for e in online}
    return min(counts, key=lambda k: counts[k])


async def open_conversation(user: dict, lp: dict, preferred: Optional[str]) -> str:
    """Find or create the customer profile + conversation for (customer, landing page). Upserts prevent duplicates."""
    org_id = lp["org_id"]
    t = now_iso()
    prof = await db.customer_profiles.find_one({"org_id": org_id, "user_id": user["id"]}, {"_id": 0})
    if not prof:
        prof = {"id": new_id(), "org_id": org_id, "user_id": user["id"], "name": user["name"], "phone": user.get("phone") or "", "calls_allowed": True,
                "labels": ["New Lead"], "stage": "New Lead", "assigned_employee_id": None, "assigned_employee_name": "",
                "blocked": False, "opted_in": False, "notes": [], "follow_ups": [], "created_at": t, "last_active": t}
        await db.customer_profiles.update_one({"org_id": org_id, "user_id": user["id"]}, {"$setOnInsert": prof}, upsert=True)
        prof = await db.customer_profiles.find_one({"org_id": org_id, "user_id": user["id"]}, {"_id": 0})
    existing = await db.conversations.find_one({"customer_id": prof["id"], "landing_page_id": lp["id"]}, {"_id": 0})
    if existing:
        await db.conversations.update_one({"id": existing["id"]}, {"$pull": {"archived_by": user["id"]}})
        await send_auto_messages(existing, "return")
        return existing["id"]
    emp_id = await pick_employee(lp, preferred or prof.get("assigned_employee_id"))
    emp = await db.users.find_one({"id": emp_id}, {"_id": 0, "name": 1}) if emp_id else None
    conv = {"id": new_id(), "org_id": org_id, "customer_id": prof["id"], "customer_user_id": user["id"],
            "customer_name": prof["name"], "customer_phone": prof["phone"], "employee_id": emp_id,
            "employee_name": emp["name"] if emp else "", "landing_page_id": lp["id"], "landing_title": lp["title"],
            "last_message": "Conversation started", "last_message_at": t, "unread_employee": 0, "unread_customer": 0,
            "archived_by": [], "muted_by": [], "follow_up": False, "blocked_by_customer": False, "status": "open",
            "created_at": t, "typing": {}}
    res = await db.conversations.update_one({"customer_id": prof["id"], "landing_page_id": lp["id"]},
                                            {"$setOnInsert": conv}, upsert=True)
    if res.upserted_id is not None:
        await db.landing_pages.update_one({"id": lp["id"]}, {"$inc": {"leads": 1}})
        if emp_id and not prof.get("assigned_employee_id"):
            await db.customer_profiles.update_one({"id": prof["id"]}, {"$set": {"assigned_employee_id": emp_id,
                                                                                  "assigned_employee_name": emp["name"]}})
        await db.messages.insert_one({"id": new_id(), "conversation_id": conv["id"], "org_id": org_id, "sender_role": "system",
                                      "sender_id": None, "sender_name": "System",
                                      "text": f"Connected to {emp['name']}" if emp else "You're in the queue — the next available associate will reply shortly.",
                                      "attachment": None, "reply_to": None, "reply_preview": "", "status": "read",
                                      "created_at": t, "idempotency_key": new_id(), "hidden_for": []})
        await send_auto_messages(conv, "welcome")
        if not user.get("phone") and not user.get("backup_skipped"):
            await db.messages.insert_one({"id": new_id(), "conversation_id": conv["id"], "org_id": org_id, "sender_role": "system",
                                          "sender_id": None, "sender_name": "talksme.in", "kind": "phone_request",
                                          "text": "📱 Share your WhatsApp number for backup? It lets you restore this chat on a new phone or in the app. Totally optional.",
                                          "attachment": None, "reply_to": None, "reply_preview": "", "status": "read",
                                          "created_at": iso(now() + timedelta(milliseconds=400)), "idempotency_key": new_id(), "hidden_for": []})
    doc = await db.conversations.find_one({"customer_id": prof["id"], "landing_page_id": lp["id"]}, {"_id": 0, "id": 1})
    return doc["id"]


async def send_auto_messages(c: dict, kind: str) -> None:
    """Employee's pre-made messages. 'welcome' on a new chat; 'return' when a customer comes back after 12h+ (once per 12h)."""
    if not c.get("employee_id"):
        return
    emp = await db.users.find_one({"id": c["employee_id"]}, {"_id": 0, "id": 1, "name": 1, "auto_messages": 1, "active": 1})
    cfg = (emp or {}).get("auto_messages") or {}
    if not emp or not emp.get("active", True) or not cfg.get("enabled", True):
        return
    if kind == "welcome":
        texts = [m["text"] for m in cfg.get("welcome", []) if m.get("enabled", True) and m.get("text", "").strip()]
    else:
        if not cfg.get("return_enabled") or not cfg.get("return_text", "").strip():
            return
        if (c.get("last_return_auto_at") or "") > iso(now() - timedelta(hours=12)) or c.get("last_message_at", "") > iso(now() - timedelta(hours=12)):
            return
        texts = [cfg["return_text"]]
    if not texts:
        return
    org = await db.organizations.find_one({"id": c["org_id"]}, {"_id": 0, "name": 1}) or {}
    first = (c.get("customer_name") or "").split(" ")[0]
    base = now()
    for i, txt in enumerate(texts):
        body = txt.replace("{name}", first).replace("{org}", org.get("name", "")).replace("{employee}", emp["name"]).strip()
        await db.messages.insert_one({"id": new_id(), "conversation_id": c["id"], "org_id": c["org_id"], "sender_role": "employee",
                                      "sender_id": emp["id"], "sender_name": emp["name"], "text": body, "attachment": None, "auto": True,
                                      "reply_to": None, "reply_preview": "", "status": "sent", "created_at": iso(base + timedelta(milliseconds=50 * (i + 1))),
                                      "idempotency_key": new_id(), "hidden_for": []})
    upd: dict = {"last_message": body[:120], "last_message_at": iso(base + timedelta(milliseconds=50 * len(texts)))}
    if kind == "return":
        upd["last_return_auto_at"] = upd["last_message_at"]
    await db.conversations.update_one({"id": c["id"]}, {"$set": upd, "$inc": {"unread_customer": len(texts)}})
