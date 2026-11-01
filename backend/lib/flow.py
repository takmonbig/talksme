"""Landing-page chat flow: automatic first messages (text/image/video/voice/sticker) + multi-step 'choose an option' menus."""
from datetime import timedelta

from lib.db import db
from lib.util import iso, new_id, now

LABEL = {"image": "📷 Photo", "video": "🎬 Video", "audio": "🎤 Voice note", "file": "📎 File", "sticker": "🙂 Sticker"}


def flow_sig(lp: dict) -> str:
    """Fingerprint of an enabled flow ("" when off) so chats re-run it after the Admin changes it."""
    import hashlib, json
    f = lp.get("flow") or {}
    if not f.get("enabled") or not f.get("root"):
        return ""
    return hashlib.sha1(json.dumps(f, sort_keys=True, default=str).encode()).hexdigest()[:16]


def fill(text: str, c: dict, org_name: str, emp_name: str) -> str:
    first = (c.get("customer_name") or "").split(" ")[0]
    return (text or "").replace("{name}", first).replace("{org}", org_name).replace("{employee}", emp_name).strip()


async def post_bot_messages(c: dict, items: list[dict], menu: dict | None = None) -> int:
    """Insert messages as the assigned employee (or the business when the chat is queued). Returns how many were posted."""
    emp = await db.users.find_one({"id": c.get("employee_id")}, {"_id": 0, "id": 1, "name": 1}) if c.get("employee_id") else None
    org = await db.organizations.find_one({"id": c["org_id"]}, {"_id": 0, "name": 1}) or {}
    sender_id, sender_name = (emp["id"], emp["name"]) if emp else (None, org.get("name", "Team"))
    base, n, last = now(), 0, ""
    docs = []
    for it in items:
        text = fill(it.get("text", ""), c, org.get("name", ""), sender_name)
        att = it.get("attachment")
        if not text and not att:
            continue
        n += 1
        last = text or LABEL.get((att or {}).get("kind", ""), "📎 File")
        docs.append({"text": text, "attachment": att, "kind": "text", "options": [], "at": iso(base + timedelta(milliseconds=60 * n))})
    if menu and menu.get("options"):
        n += 1
        last = menu.get("prompt") or "Please choose an option 👇"
        docs.append({"text": last, "attachment": None, "kind": "menu", "node_id": menu["id"],
                     "options": [{"id": o["id"], "label": o["label"], "action": o.get("action", "reply")} for o in menu["options"]], "at": iso(base + timedelta(milliseconds=60 * n))})
    for d in docs:
        at = d.pop("at")
        await db.messages.insert_one({"id": new_id(), "conversation_id": c["id"], "org_id": c["org_id"], "sender_role": "employee",
                                      "sender_id": sender_id, "sender_name": sender_name, "auto": True, "answered": "",
                                      "reply_to": None, "reply_preview": "", "status": "sent", "created_at": at,
                                      "idempotency_key": new_id(), "hidden_for": [], **d})
    if n:
        await db.conversations.update_one({"id": c["id"]}, {"$set": {"last_message": last[:120], "last_message_at": iso(base + timedelta(milliseconds=60 * n))},
                                                            "$inc": {"unread_customer": n}})
    return n


async def send_node(c: dict, flow: dict, node_id: str) -> int:
    node = next((x for x in flow.get("nodes", []) if x["id"] == node_id), None)
    if not node:
        return 0
    return await post_bot_messages(c, node.get("messages", []), node if node.get("options") else None)


async def start_flow(c: dict, lp: dict) -> bool:
    """Run the landing page's flow on a NEW chat. Returns False when no flow is configured (employee welcome is used instead)."""
    flow = lp.get("flow") or {}
    if not flow.get("enabled") or not flow.get("root"):
        return False
    return await send_node(c, flow, flow["root"]) > 0
