"""Web Push (VAPID) delivery: reaches phones even when the talksme.in app/tab is closed (best effort, browser-dependent)."""
import asyncio
import json
import logging
import os

from pywebpush import WebPushException, webpush

from lib.db import db
from lib.realtime import hub

log = logging.getLogger("push")


def _send(sub: dict, data: dict) -> int:
    try:
        webpush(subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]}, data=json.dumps(data),
                vapid_private_key=os.environ["VAPID_PRIVATE_KEY"], vapid_claims={"sub": os.environ["VAPID_SUBJECT"]}, ttl=60, timeout=10)
        return 201
    except WebPushException as e:
        return e.response.status_code if e.response is not None else 0
    except Exception as e:  # noqa: BLE001
        log.warning("push failed: %s", e)
        return 0


async def push_to(uids: set[str], data: dict, only_if_not_visible: bool = True) -> int:
    """Push to every subscribed device of these users. Skips users who currently have the app open and visible."""
    targets = {u for u in uids if not (only_if_not_visible and await hub.visible_now(u))}
    if not targets:
        return 0
    users = {u["id"] async for u in db.users.find({"id": {"$in": list(targets)}, "notify_push": {"$ne": False}}, {"_id": 0, "id": 1})}
    subs = await db.push_subscriptions.find({"user_id": {"$in": list(users)}}, {"_id": 0}).to_list(200)
    ok = 0
    for sub in subs:
        code = await asyncio.to_thread(_send, sub, data)
        log.info("push %s -> %s", data.get("tag"), code)
        ok += code in (200, 201, 202)
        if code in (404, 410):  # expired subscription cleanup
            await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
    return ok


_tasks: set[asyncio.Task] = set()


def push_bg(uids: set[str], data: dict, only_if_not_visible: bool = True) -> None:
    t = asyncio.get_running_loop().create_task(push_to(uids, data, only_if_not_visible))
    _tasks.add(t)  # keep a reference so the task isn't garbage-collected mid-send
    t.add_done_callback(_tasks.discard)
