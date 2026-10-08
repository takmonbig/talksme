"""Public landing pages + customer onboarding. Entering a phone number never discloses existing history."""
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response

from lib.auth import optional_user, set_session
from lib.conv import open_conversation
from lib.db import db
from lib.util import audit, iso, new_id, now, now_iso
from models.schemas import PublicLanding, StartChatIn, StartChatOut, VerifyIn

router = APIRouter()


async def _published(slug: str, org_slug: str | None = None) -> tuple[dict, dict]:
    q = {"slug": slug, "published": True}
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
    phone = f"{body.country_code}{body.phone}"
    preferred = body.employee_id
    if body.image_id:
        img = next((i for i in lp.get("images", []) if i["id"] == body.image_id), None)
        preferred = img.get("employee_id") if img else preferred
    # An already-authenticated customer with this phone is an authorized session.
    if viewer and viewer["role"] == "customer" and viewer.get("phone") == phone:
        return StartChatOut(status="ok", conversation_id=await open_conversation(viewer, lp, preferred))
    existing = await db.users.find_one({"phone": phone, "role": "customer"}, {"_id": 0})
    if existing:
        code = f"{secrets.randbelow(10**6):06d}"
        ch = {"id": new_id(), "user_id": existing["id"], "code": code, "landing_id": lp["id"], "preferred": preferred,
              "expires": iso(now() + timedelta(minutes=10)), "attempts": 0}
        await db.otp_challenges.insert_one(ch)
        # MOCKED: production would deliver this via SMS/WhatsApp OTP. The preview returns it for testing.
        return StartChatOut(status="verification_required", challenge_id=ch["id"], mock_code=code)
    user = {"id": new_id(), "email": None, "name": body.name, "role": "customer", "org_id": None, "password_hash": None,
            "avatar": "", "title": "", "phone": phone, "status": "online", "verified": False, "active": True,
            "calls_enabled": True, "guest": True, "target": 0, "notify_sound": True, "notify_push": False, "created_at": now_iso()}
    await db.users.insert_one(dict(user))
    set_session(response, user)
    return StartChatOut(status="ok", conversation_id=await open_conversation(user, lp, preferred))


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
