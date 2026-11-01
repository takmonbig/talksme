"""Stickers (built-in pack + org + personal), menu-option choices in chat, and the first-visit intro video."""
from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import require
from lib.conv import get_conv
from lib.db import db
from lib.flow import send_node
from lib.realtime import publish
from lib.util import audit, new_id, now_iso
from models.schemas import FlowNodeStat, FlowOptionStat, FlowStats, IntroOut, MenuChoiceIn, Message, Ok, Sticker, StickerIn

router = APIRouter()
chat_user = require("customer", "employee", "admin")
PLATFORM_INTRO = "https://customer-assets-wrfwihn1.emergentagent.net/job_crm-demo-hub/artifacts/6467dfa3528c54b3_edited_video.mp4"
BUILTIN = [Sticker(id=f"builtin-{k}", scope="builtin", name=k.replace("-", " ").title(), url=f"/stickers/{k}.webp")
           for k in ("hello", "thanks", "ok", "wait", "trust", "call", "congrats", "goodnight")]


@router.get("/stickers", response_model=list[Sticker])
async def list_stickers(user: dict = Depends(chat_user)):
    """Built-in TalksMe pack + this org's stickers (staff, or every org the customer chats with) + the user's own uploads."""
    orgs = [user["org_id"]] if user.get("org_id") else await db.conversations.distinct("org_id", {"customer_user_id": user["id"]})
    q = {"$or": [{"scope": "org", "org_id": {"$in": orgs}}, {"scope": "mine", "owner_id": user["id"]}]}
    own = [Sticker(**s) async for s in db.stickers.find(q, {"_id": 0}).sort("created_at", -1).limit(200)]
    return BUILTIN + own


@router.post("/stickers", response_model=Sticker)
async def add_sticker(body: StickerIn, user: dict = Depends(chat_user)):
    if body.scope == "org" and user["role"] != "admin":
        raise HTTPException(403, "Only an Admin can add stickers for the whole organization")
    if await db.stickers.count_documents({"owner_id": user["id"]}) >= 100:
        raise HTTPException(409, "You can keep up to 100 stickers. Delete some first.")
    doc = {"id": new_id(), "scope": body.scope, "name": body.name, "url": body.url, "owner_id": user["id"],
           "org_id": user.get("org_id") if body.scope == "org" else None, "created_at": now_iso()}
    await db.stickers.insert_one(dict(doc))
    return Sticker(**doc)


@router.delete("/stickers/{sid}", response_model=Ok)
async def delete_sticker(sid: str, user: dict = Depends(chat_user)):
    s = await db.stickers.find_one({"id": sid}, {"_id": 0})
    if not s or not (s["owner_id"] == user["id"] or (user["role"] == "admin" and s.get("org_id") == user.get("org_id"))):
        raise HTTPException(404, "Sticker not found")
    await db.stickers.delete_one({"id": sid})
    return Ok(message="Sticker removed")


@router.post("/conversations/{cid}/menu/{mid}", response_model=Message)
async def choose_option(cid: str, mid: str, body: MenuChoiceIn, user: dict = Depends(require("customer"))):
    c = await get_conv(user, cid)
    menu = await db.messages.find_one({"id": mid, "conversation_id": cid, "kind": "menu"}, {"_id": 0})
    opt = next((o for o in (menu or {}).get("options", []) if o["id"] == body.option_id), None)
    if not menu or not opt:
        raise HTTPException(404, "Option not found")
    # atomic: a double tap / retry can't answer the same menu twice
    res = await db.messages.update_one({"id": mid, "answered": {"$in": ["", None]}}, {"$set": {"answered": opt["id"]}})
    if not res.modified_count:
        raise HTTPException(409, "You already chose an option here")
    t = now_iso()
    msg = {"id": new_id(), "conversation_id": cid, "org_id": c["org_id"], "sender_role": "customer", "sender_id": user["id"],
           "sender_name": user["name"], "text": opt["label"], "attachment": None, "reply_to": mid, "reply_preview": menu.get("text", "")[:80],
           "status": "sent", "created_at": t, "idempotency_key": f"menu-{mid}", "hidden_for": [], "kind": "text"}
    await db.messages.insert_one(dict(msg))
    await db.conversations.update_one({"id": cid}, {"$set": {"last_message": opt["label"], "last_message_at": t}, "$inc": {"unread_employee": 1}})
    lp = await db.landing_pages.find_one({"id": c.get("landing_page_id")}, {"_id": 0, "flow": 1}) or {}
    node = next((n for n in (lp.get("flow") or {}).get("nodes", []) if n["id"] == menu.get("node_id")), None)
    nxt = next((o.get("next", "") for o in (node or {}).get("options", []) if o["id"] == opt["id"]), "")
    if nxt:
        await send_node({**c, "customer_name": c.get("customer_name", "")}, lp["flow"], nxt)
    await publish(c, {"type": "message", "sender_id": user["id"]})
    return Message(**msg)


@router.get("/public/intro", response_model=IntroOut)
async def intro(org_id: str = Query(..., max_length=80)):
    o = await db.organizations.find_one({"id": org_id}, {"_id": 0, "intro_enabled": 1, "intro_video_url": 1}) or {}
    return IntroOut(enabled=o.get("intro_enabled", True), url=o.get("intro_video_url") or PLATFORM_INTRO)


@router.post("/admin/intro/reset", response_model=Ok)
async def intro_reset(user: dict = Depends(require("admin"))):
    await db.organizations.update_one({"id": user["org_id"]}, {"$set": {"intro_video_url": ""}})
    await audit(user, "org.intro_video_reset", f"org:{user['org_id']}", user["org_id"])
    return Ok(message="Using the TalksMe default video")


# ---------- Flow analytics: which menu options customers tap ----------
async def _flow_stats(lp: dict) -> FlowStats:
    flow = lp.get("flow") or {}
    node_meta = {n["id"]: n for n in flow.get("nodes", [])}
    cids = await db.conversations.distinct("id", {"landing_page_id": lp["id"]})
    menus = await db.messages.find({"conversation_id": {"$in": cids}, "kind": "menu"}, {"_id": 0, "node_id": 1, "options": 1, "answered": 1}).to_list(20000)
    per: dict[str, dict] = {}
    for m in menus:
        nid = m.get("node_id") or ""
        d = per.setdefault(nid, {"shown": 0, "answered": 0, "counts": {}, "labels": {}})
        d["shown"] += 1
        for o in m.get("options", []):
            d["labels"].setdefault(o["id"], o["label"])
            d["counts"].setdefault(o["id"], 0)
        if m.get("answered"):
            d["answered"] += 1
            d["counts"][m["answered"]] = d["counts"].get(m["answered"], 0) + 1
    # include configured nodes/options that nobody has seen yet, with current labels
    for nid, n in node_meta.items():
        if n.get("options"):
            d = per.setdefault(nid, {"shown": 0, "answered": 0, "counts": {}, "labels": {}})
            for o in n["options"]:
                d["labels"][o["id"]] = o["label"]
                d["counts"].setdefault(o["id"], 0)
    nodes, best = [], ("", -1)
    for nid, d in per.items():
        meta = node_meta.get(nid, {})
        opts = sorted((FlowOptionStat(option_id=k, label=d["labels"].get(k, "(removed option)"), count=v,
                                      pct=round(100 * v / d["answered"], 1) if d["answered"] else 0) for k, v in d["counts"].items()), key=lambda o: -o.count)
        for o in opts:
            if o.count > best[1]:
                best = (o.label, o.count)
        nodes.append(FlowNodeStat(node_id=nid, title=meta.get("title") or ("(deleted step)" if nid not in node_meta else "Step"),
                                  prompt=meta.get("prompt", ""), shown=d["shown"], answered=d["answered"], options=opts))
    nodes.sort(key=lambda n: (n.node_id != flow.get("root"), -n.shown))
    shown, ans = sum(n.shown for n in nodes), sum(n.answered for n in nodes)
    return FlowStats(landing_page_id=lp["id"], title=lp["title"], slug=lp["slug"], flow_enabled=bool(flow.get("enabled")), chats=len(cids),
                     menus_shown=shown, answered=ans, response_rate=round(100 * ans / shown, 1) if shown else 0,
                     top_option=best[0] if best[1] > 0 else "", nodes=nodes)


@router.get("/admin/flow-analytics", response_model=list[FlowStats])
async def flow_analytics(landing_page_id: str | None = Query(None, max_length=80), user: dict = Depends(require("admin"))):
    q = {"org_id": user["org_id"], "deleted": {"$ne": True}}
    if landing_page_id:
        q["id"] = landing_page_id
    lps = await db.landing_pages.find(q, {"_id": 0, "id": 1, "title": 1, "slug": 1, "flow": 1}).to_list(200)
    if landing_page_id and not lps:
        raise HTTPException(404, "Landing page not found")
    return [await _flow_stats(lp) for lp in lps]
