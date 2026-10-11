"""Push subscriptions (VAPID) and WebRTC ICE/TURN servers (Metered)."""
import asyncio
import hashlib
import json
import logging
import os
import time

import httpx
from agora_token_builder import RtcTokenBuilder
import websockets
from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_user, require
from lib.conv import can_access
from lib.db import db
from lib.util import now_iso
from models.schemas import AgoraJoinOut, BackupPhoneIn, IceServersOut, Ok, PushKeyOut, PushSubscriptionIn

router = APIRouter()
log = logging.getLogger("turn")
STUN = [{"urls": ["stun:stun.l.google.com:19302", "stun:stun.relay.metered.ca:80"]}]
_cache: dict = {"at": 0.0, "servers": None}


async def _metered_ice() -> list[dict] | None:
    """Mint a Metered realtime token with the secret key pair; TURN credentials arrive in the welcome frame."""
    app, api_key = os.environ.get("METERED_TURN_APP"), os.environ.get("METERED_TURN_API_KEY")
    if app and api_key:  # classic Metered TURN credentials API (Dashboard -> TURN Server -> API key)
        try:
            async with httpx.AsyncClient(timeout=10) as cl:
                r = await cl.get(f"https://{app}/api/v1/turn/credentials", params={"apiKey": api_key})
                r.raise_for_status()
                return r.json() or None
        except Exception as e:  # noqa: BLE001
            log.warning("Metered TURN credentials API failed: %s", e)
    kid, secret = os.environ.get("METERED_SK_ID"), os.environ.get("METERED_SK_SECRET")
    if not kid or not secret:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as cl:
            r = await cl.post("https://rms.metered.ca/v1/tokens", headers={"Authorization": f"Bearer {kid}:{secret}"},
                              json={"peerId": f"talksme-ice-{int(time.time())}", "expiresInSec": 120})
            r.raise_for_status()
        async with websockets.connect(f"wss://rms.metered.ca/v1?token={r.json()['token']}", open_timeout=8) as ws:
            welcome = json.loads(await asyncio.wait_for(ws.recv(), 8))
        servers = (welcome.get("metadata") or {}).get("iceServers")
        if not servers:
            log.warning("Metered returned no TURN iceServers - enable a TURN service + Auto-inject TURN on the key in the Metered dashboard")
        return servers or None
    except Exception as e:  # noqa: BLE001
        log.warning("Metered TURN fetch failed: %s", e)
        return None


@router.get("/calls/ice-servers", response_model=IceServersOut)
async def ice_servers(user: dict = Depends(current_user)):
    if not _cache["servers"] or time.time() - _cache["at"] > 1800:
        turn = await _metered_ice()
        _cache.update(at=time.time() if turn else time.time() - 1500, servers=turn)  # retry sooner when TURN is missing
    turn = _cache["servers"]
    return IceServersOut(ice_servers=(turn or []) + STUN, turn=bool(turn))


@router.get("/push/key", response_model=PushKeyOut)
async def push_key():
    return PushKeyOut(public_key=os.environ["VAPID_PUBLIC_KEY"])


@router.post("/push/subscribe", response_model=Ok)
async def push_subscribe(body: PushSubscriptionIn, user: dict = Depends(current_user)):
    await db.push_subscriptions.update_one({"endpoint": body.endpoint},
                                           {"$set": {"endpoint": body.endpoint, "keys": body.keys.model_dump(), "user_id": user["id"], "updated_at": now_iso()}},
                                           upsert=True)
    await db.users.update_one({"id": user["id"]}, {"$set": {"notify_push": True}})
    return Ok(message="Notifications are on for this device")


# ---------- optional WhatsApp backup number for no-login guests ----------
@router.post("/me/backup-phone", response_model=Ok)
async def backup_phone(body: BackupPhoneIn, user: dict = Depends(require("customer"))):
    phone = f"{body.country_code}{body.phone}"
    taken = await db.users.find_one({"phone": phone, "role": "customer", "id": {"$ne": user["id"]}}, {"_id": 0, "id": 1})
    if taken:
        raise HTTPException(409, "This number already has chats with us. Use 'Restore chats' on the landing page to verify it by WhatsApp code.")
    await db.users.update_one({"id": user["id"]}, {"$set": {"phone": phone}})
    await db.customer_profiles.update_many({"user_id": user["id"]}, {"$set": {"phone": phone}})
    await db.conversations.update_many({"customer_user_id": user["id"]}, {"$set": {"customer_phone": phone}})
    await db.messages.update_many({"kind": "phone_request", "conversation_id": {"$in": await db.conversations.distinct("id", {"customer_user_id": user["id"]})}},
                                  {"$set": {"kind": "phone_saved", "text": f"✅ WhatsApp number {phone} saved for backup."}})
    return Ok(message="WhatsApp number saved for backup")


@router.post("/me/backup-phone/skip", response_model=Ok)
async def backup_skip(user: dict = Depends(require("customer"))):
    await db.users.update_one({"id": user["id"]}, {"$set": {"backup_skipped": True}})
    await db.messages.update_many({"kind": "phone_request", "conversation_id": {"$in": await db.conversations.distinct("id", {"customer_user_id": user["id"]})}},
                                  {"$set": {"kind": "phone_skipped", "text": "You can add a WhatsApp backup number any time from the ⋮ menu."}})
    return Ok(message="Skipped")


# ---------- Agora voice transport (signalling stays on our WebSocket) ----------
@router.get("/calls/{cid}/agora", response_model=AgoraJoinOut)
async def agora_join(cid: str, user: dict = Depends(current_user)):
    c = await db.conversations.find_one({"id": cid}, {"_id": 0})
    if not c or not can_access(user, c):
        raise HTTPException(404, "Conversation not found")
    app_id = os.environ.get("AGORA_APP_ID")
    if not app_id:
        raise HTTPException(503, "Voice calling is not configured")
    uid = int.from_bytes(hashlib.sha256(user["id"].encode()).digest()[:4], "big") % 2_000_000_000 + 1  # stable numeric Agora uid
    channel = f"call_{cid}"
    cert = os.environ.get("AGORA_APP_CERTIFICATE")
    # Secured projects (App Certificate on) need a server-signed token; "App ID only" projects join with token=None.
    token = RtcTokenBuilder.buildTokenWithUid(app_id, cert, channel, uid, 1, int(time.time()) + 3600) if cert else None
    return AgoraJoinOut(app_id=app_id, channel=channel, uid=uid, token=token)
