"""Public landing pages + customer onboarding. Entering a phone number never discloses existing history."""
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response

from lib.auth import optional_user, set_session
from lib.conv import open_conversation
from lib.db import db
from lib.util import audit, iso, now_iso
from lib.util import new_id
from routers.realtime import create_challenge
from models.schemas import PublicLanding, StartChatIn, StartChatOut, VerifyIn

router = APIRouter()


async def _published(slug: str, org_slug: str | None = None) -> tuple[dict, dict]:
    q = {"slug": slug, "published": True, "archived": {"$ne": True}, "deleted": {"$ne": True}}
    if org_slug:
        org = await db.organizations.find_one({"slug": org_slug}, {"_id": 0})
        if not org:
            raise HTTPException(404, "Page not found")
        q["org_id"] = org["id"]
    lp = await db.landing_pages.find_one(q, {"_id": 0})
    if not lp:
        raise HTTPException(404, "Page not found or unpublished")
    org = await db.organizations.find_one({"id": lp["org_id"]}, {"_id": 0})
    if not org or org["status"] == "suspended":
        raise HTTPException(404, "Page unavailable")
    return lp, org


@router.get("/public/landing/{org_slug}/{slug}", response_model=PublicLanding)
async def public_landing(org_slug: str, slug: str):
    lp, org = await _published(slug, org_slug)
    await db.landing_pages.update_one({"id": lp["id"]}, {"$inc": {"views": 1}})
    emps = await db.users.find({"id": {"$in": lp["assigned_employee_ids"]}, "active": True},
                               {"_id": 0, "id": 1, "name": 1, "avatar": 1, "title": 1, "status": 1, "verified": 1}).to_list(50)
    return PublicLanding(page=lp, org=org, employees=emps)


@router.post("/public/landing/{org_slug}/{slug}/start", response_model=StartChatOut)
async def start_chat(org_slug: str, slug: str, body: StartChatIn, response: Response, viewer: dict | None = Depends(optional_user)):
    lp, _ = await _published(slug, org_slug)
    phone = f"{body.country_code or '+91'}{body.phone}" if body.phone else None
    preferred = body.employee_id
    img = next((i for i in lp.get("images", []) if i["id"] == body.image_id), None) if body.image_id else None
    if img:
        preferred = img.get("employee_id") or preferred
    first_msg = ((img or {}).get("default_message") or lp.get("default_message") or "").strip()

    async def done(u: dict) -> StartChatOut:
        cid = await open_conversation(u, lp, preferred)
        return StartChatOut(status="ok", conversation_id=cid, prefill=await default_message(u, lp, cid, first_msg))
    # An already-authenticated customer with this phone is an authorized session.
    # Returning visitor on this device (session cookie): straight back into chat, no login of any kind.
    if viewer and viewer["role"] == "customer" and (not phone or viewer.get("phone") == phone):
        return await done(viewer)
    existing = await db.users.find_one({"phone": phone, "role": "customer"}, {"_id": 0}) if phone else None
    if existing:
        # Real WhatsApp OTP (BlackSMS) before any existing history is disclosed.
        return StartChatOut(status="verification_required", challenge_id=await create_challenge(existing, lp["id"], preferred))
    name = body.name or f"Guest {secrets.randbelow(9000) + 1000}"
    user = {"id": new_id(), "email": None, "name": name, "role": "customer", "org_id": None, "password_hash": None,
            "avatar": "", "title": "", "phone": phone or "", "status": "online", "verified": False, "active": True,
            "calls_enabled": True, "guest": True, "target": 0, "notify_sound": True, "notify_push": True, "created_at": now_iso()}
    await db.users.insert_one(dict(user))
    set_session(response, user)
    return await done(user)


async def default_message(user: dict, lp: dict, cid: str, text: str) -> str:
    """Landing/service default message: auto-sent ONCE as the customer (if Admin enabled it), otherwise prefilled."""
    if not text or await db.messages.find_one({"conversation_id": cid, "sender_role": "customer"}, {"_id": 1}):
        return ""
    if not lp.get("auto_send_default"):
        return text
    key = f"default-msg-{cid}"  # idempotent: refreshes / double clicks / retries can't send it twice
    if not await db.messages.find_one({"conversation_id": cid, "idempotency_key": key}, {"_id": 1}):
        conv = await db.conversations.find_one({"id": cid}, {"_id": 0, "created_at": 1}) or {}
        # placed right after "Connected to…" so the customer's first message comes BEFORE the automatic replies / menu
        t = iso(datetime.fromisoformat(conv["created_at"]) + timedelta(milliseconds=10)) if conv.get("created_at") else now_iso()
        await db.messages.insert_one({"id": new_id(), "conversation_id": cid, "org_id": lp["org_id"], "sender_role": "customer", "sender_id": user["id"],
                                      "sender_name": user["name"], "text": text, "attachment": None, "reply_to": None, "reply_preview": "",
                                      "status": "sent", "created_at": t, "idempotency_key": key, "hidden_for": []})
        await db.conversations.update_one({"id": cid}, {"$inc": {"unread_employee": 1}})
    return ""


@router.post("/public/verify", response_model=StartChatOut)
async def verify(body: VerifyIn, response: Response):
    ch = await db.otp_challenges.find_one({"id": body.challenge_id}, {"_id": 0})
    if not ch or ch["expires"] < now_iso() or ch["attempts"] >= 5:
        raise HTTPException(400, "Verification expired. Please start again.")
    if not secrets.compare_digest(ch["code"], body.code):
        await db.otp_challenges.update_one({"id": ch["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Incorrect code")
    await db.otp_challenges.delete_one({"id": ch["id"]})
    user = await db.users.find_one({"id": ch["user_id"]}, {"_id": 0})
    lp = await db.landing_pages.find_one({"id": ch["landing_id"]}, {"_id": 0})
    if not user or not lp:
        raise HTTPException(404, "Not found")
    set_session(response, user)
    await audit(user, "customer.phone_verified", f"user:{user['id']}", lp["org_id"])
    return StartChatOut(status="ok", conversation_id=await open_conversation(user, lp, ch.get("preferred")))
