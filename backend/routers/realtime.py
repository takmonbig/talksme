"""WebSocket (/api/ws), Cloudinary upload signing, WhatsApp OTP login, quick replies."""
import logging
import os
import secrets
import time
from datetime import timedelta

import cloudinary
import cloudinary.utils
import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from lib.auth import current_user, optional_user, require, set_session
from lib.conv import can_access
from lib.db import db
from lib.realtime import hub, publish
from lib.util import audit, iso, new_id, now, now_iso
from models.schemas import Ok, StartChatOut, User, VerifyIn

router = APIRouter()
cloudinary.config(cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"], api_key=os.environ["CLOUDINARY_API_KEY"],
                  api_secret=os.environ["CLOUDINARY_API_SECRET"], secure=True)
MAX_UPLOAD = 9 * 1024 * 1024


# ---------- realtime ----------
@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    user = await optional_user(ws)  # type: ignore[arg-type]  # cookie auth works on any HTTPConnection
    if not user:
        await ws.close(code=4401)
        return
    await ws.accept()
    hub.add(user["id"], ws)
    try:
        while True:
            msg = await ws.receive_json()
            c = await db.conversations.find_one({"id": msg.get("conversation_id")}, {"_id": 0})
            if not c or not can_access(user, c):
                continue
            if msg.get("type") == "typing":
                await publish(c, {"type": "typing", "role": user["role"]}, exclude=user["id"])
            elif msg.get("type") == "call":
                org = await db.organizations.find_one({"id": c["org_id"]}, {"_id": 0, "features": 1})
                if (org or {}).get("features", {}).get("audio_calls") is False:
                    continue
                peer = c.get("employee_id") if user["role"] == "customer" else c["customer_user_id"]
                if peer:
                    await hub.send({peer}, {"type": "call", "conversation_id": c["id"], "action": msg.get("action"),
                                            "payload": msg.get("payload"), "from_name": user["name"], "from_avatar": user.get("avatar", "")})
    except (WebSocketDisconnect, RuntimeError, ValueError):
        pass
    finally:
        hub.remove(user["id"], ws)


# ---------- media ----------
class Signature(BaseModel):
    signature: str
    timestamp: int
    cloud_name: str
    api_key: str
    folder: str
    max_bytes: int


@router.get("/media/signature", response_model=Signature)
async def media_signature(user: dict = Depends(current_user)):
    folder = f"omnichat/{user.get('org_id') or 'customers'}/{user['id']}"
    ts = int(time.time())
    sig = cloudinary.utils.api_sign_request({"timestamp": ts, "folder": folder}, os.environ["CLOUDINARY_API_SECRET"])
    return Signature(signature=sig, timestamp=ts, cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
                     api_key=os.environ["CLOUDINARY_API_KEY"], folder=folder, max_bytes=MAX_UPLOAD)


# ---------- WhatsApp OTP ----------
async def send_whatsapp_otp(phone: str, code: str) -> tuple[bool, str]:
    digits = phone.lstrip("+")
    number = digits[-10:] if digits.startswith("91") else digits
    try:
        async with httpx.AsyncClient(timeout=15) as cl:
            r = await cl.post(os.environ["BLACKSMS_WA_URL"], headers={"Authorization": os.environ["BLACKSMS_API_KEY"]},
                              json={"sender_id": os.environ["BLACKSMS_SENDER_ID"], "variables_values": code, "numbers": number, "route": 1})
        data = r.json()
        ok = r.status_code == 200 and (data.get("status") == 1 or data.get("success") is True)
        msg = str(data.get("message", ""))
        logging.getLogger("otp").warning("BlackSMS response: %s", msg) if not ok else None
        return ok, ("low balance on the WhatsApp OTP account" if "balance" in msg.lower() else "provider error")
    except Exception:
        return False, "provider unreachable"


async def create_challenge(user: dict, landing_id: str | None = None, preferred: str | None = None) -> str:
    code = f"{secrets.randbelow(10**6):06d}"
    ok, why = await send_whatsapp_otp(user["phone"], code)
    if not ok:
        raise HTTPException(400, f"Couldn't send the WhatsApp OTP right now ({why}). Please try again shortly.")
    ch = {"id": new_id(), "user_id": user["id"], "code": code, "landing_id": landing_id, "preferred": preferred,
          "expires": iso(now() + timedelta(minutes=10)), "attempts": 0}
    await db.otp_challenges.insert_one(ch)
    return ch["id"]


class OtpRequestIn(BaseModel):
    country_code: str = Field(pattern=r"^\+\d{1,4}$")
    phone: str = Field(pattern=r"^\d{6,14}$")


@router.post("/auth/otp/request", response_model=StartChatOut)
async def otp_request(body: OtpRequestIn):
    user = await db.users.find_one({"phone": f"{body.country_code}{body.phone}", "role": "customer"}, {"_id": 0})
    if not user:
        raise HTTPException(404, "No chats found for this number. Start a chat from a business page first.")
    return StartChatOut(status="verification_required", challenge_id=await create_challenge(user))


@router.post("/auth/otp/verify", response_model=User)
async def otp_verify(body: VerifyIn, response: Response):
    ch = await db.otp_challenges.find_one({"id": body.challenge_id}, {"_id": 0})
    if not ch or ch["expires"] < now_iso() or ch["attempts"] >= 5:
        raise HTTPException(400, "Code expired. Request a new one.")
    if not secrets.compare_digest(ch["code"], body.code):
        await db.otp_challenges.update_one({"id": ch["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Incorrect code")
    await db.otp_challenges.delete_one({"id": ch["id"]})
    user = await db.users.find_one({"id": ch["user_id"]}, {"_id": 0})
    set_session(response, user)
    await audit(user, "customer.otp_login", f"user:{user['id']}")
    return User(**user)


# ---------- quick replies ----------
class QuickReply(BaseModel):
    id: str
    title: str
    text: str
    created_by: str = ""


class QuickReplyIn(BaseModel):
    title: str = Field(min_length=2, max_length=40)
    text: str = Field(min_length=2, max_length=1000)


staff = require("employee", "admin")


@router.get("/quick-replies", response_model=list[QuickReply])
async def list_qr(user: dict = Depends(staff)):
    return await db.quick_replies.find({"org_id": user["org_id"]}, {"_id": 0}).sort("title", 1).to_list(200)


@router.post("/quick-replies", response_model=QuickReply)
async def create_qr(body: QuickReplyIn, user: dict = Depends(staff)):
    org = await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0, "features": 1})
    if (org or {}).get("features", {}).get("quick_replies") is False:
        raise HTTPException(403, "Quick replies are not enabled for your plan")
    qr = {"id": new_id(), "org_id": user["org_id"], **body.model_dump(), "created_by": user["name"]}
    await db.quick_replies.insert_one(dict(qr))
    return QuickReply(**qr)


@router.delete("/quick-replies/{qid}", response_model=Ok)
async def delete_qr(qid: str, user: dict = Depends(staff)):
    q = {"id": qid, "org_id": user["org_id"]}
    if user["role"] != "admin":
        q["created_by"] = user["name"]
    if not (await db.quick_replies.delete_one(q)).deleted_count:
        raise HTTPException(404, "Not found or not yours")
    return Ok()
