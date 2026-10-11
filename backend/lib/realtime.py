"""WebSocket hub that works across several backend replicas.

Each pod keeps its own sockets in memory, and every event is also written to Mongo (`rt_events`, TTL 2 min).
A relay loop on each pod polls for events from the other pods and delivers them to its local sockets. Presence
(visible/foreground), Super Admin silent watchers and ringing calls live in Mongo too, so they are shared by all pods.
"""
import asyncio
import logging
import time
import uuid
from collections import defaultdict
from datetime import timedelta

from fastapi import WebSocket

from lib.db import db
from lib.util import now

log = logging.getLogger("realtime")
INSTANCE = uuid.uuid4().hex
RING_SECS = 40


class Hub:
    def __init__(self) -> None:
        self.conns: dict[str, set[WebSocket]] = defaultdict(set)
        self.visible: set[WebSocket] = set()  # local sockets whose tab/app is in the foreground
        self._seen: dict[str, float] = {}

    # ---------- local sockets ----------
    def add(self, uid: str, ws: WebSocket) -> None:
        self.conns[uid].add(ws)

    async def remove(self, uid: str, ws: WebSocket) -> None:
        self.conns[uid].discard(ws)
        self.visible.discard(ws)
        await self._presence(uid)
        if not self.conns[uid]:
            await db.rt_watchers.delete_many({"uid": uid})

    def online(self, uid: str) -> bool:
        return bool(self.conns.get(uid))

    async def _deliver(self, uids, event: dict) -> None:
        for uid in uids:
            for ws in list(self.conns.get(uid, ())):
                try:
                    await ws.send_json(event)
                except Exception:  # noqa: BLE001
                    self.conns[uid].discard(ws)

    async def send(self, uids: set[str], event: dict) -> None:
        """Deliver locally now, and hand off to the other replicas through Mongo."""
        uids = {u for u in uids if u}
        if not uids:
            return
        await self._deliver(uids, event)
        await db.rt_events.insert_one({"targets": list(uids), "event": event, "origin": INSTANCE, "at": now()})

    async def relay_loop(self) -> None:
        await db.rt_events.create_index("at", expireAfterSeconds=120)
        await db.rt_presence.create_index("at", expireAfterSeconds=300)
        await db.rt_watchers.create_index("at", expireAfterSeconds=120)
        await db.rt_calls.create_index("at", expireAfterSeconds=300)
        beat = 0.0
        while True:
            try:
                t = time.time()
                async for ev in db.rt_events.find({"at": {"$gt": now() - timedelta(seconds=5)}, "origin": {"$ne": INSTANCE}}).sort("at", 1):
                    k = str(ev["_id"])
                    if k in self._seen:
                        continue
                    self._seen[k] = t
                    local = [u for u in ev["targets"] if self.conns.get(u)]
                    if local:
                        await self._deliver(local, ev["event"])
                self._seen = {k: v for k, v in self._seen.items() if t - v < 15}
                if t - beat > 30:  # keep presence fresh for users connected to this pod
                    beat = t
                    for uid in [u for u, s in self.conns.items() if s]:
                        await self._presence(uid)
            except Exception as e:  # noqa: BLE001
                log.warning("relay loop error: %s", e)
            await asyncio.sleep(0.25)

    # ---------- presence (shared) ----------
    async def set_visible(self, uid: str, ws: WebSocket, visible: bool) -> None:
        (self.visible.add if visible else self.visible.discard)(ws)
        await self._presence(uid)

    async def _presence(self, uid: str) -> None:
        key = f"{INSTANCE}:{uid}"
        if not self.conns.get(uid):
            await db.rt_presence.delete_one({"_id": key})
            return
        vis = any(ws in self.visible for ws in self.conns[uid])
        await db.rt_presence.update_one({"_id": key}, {"$set": {"uid": uid, "visible": vis, "at": now()}}, upsert=True)

    async def visible_now(self, uid: str) -> bool:
        return await db.rt_presence.find_one({"uid": uid, "visible": True, "at": {"$gt": now() - timedelta(seconds=90)}}, {"_id": 1}) is not None

    # ---------- Super Admin silent watchers (shared) ----------
    async def watch(self, cid: str, uid: str) -> bool:
        """Returns True when this is a new watch (for auditing)."""
        r = await db.rt_watchers.update_one({"_id": f"{cid}:{uid}"}, {"$set": {"cid": cid, "uid": uid, "at": now()}}, upsert=True)
        return r.upserted_id is not None

    async def unwatch(self, cid: str, uid: str) -> None:
        await db.rt_watchers.delete_one({"_id": f"{cid}:{uid}"})

    async def watchers(self, cid: str) -> set[str]:
        return {w["uid"] async for w in db.rt_watchers.find({"cid": cid, "at": {"$gt": now() - timedelta(seconds=30)}}, {"uid": 1})}

    # ---------- ringing calls (shared) ----------
    async def ring(self, cid: str, callee: str, ev: dict) -> None:
        await db.rt_calls.replace_one({"_id": cid}, {"callee": callee, "ev": ev, "at": now()}, upsert=True)

    async def stop_ring(self, cid: str) -> None:
        await db.rt_calls.delete_one({"_id": cid})

    async def ringing_for(self, uid: str) -> list[dict]:
        return [c["ev"] async for c in db.rt_calls.find({"callee": uid, "at": {"$gt": now() - timedelta(seconds=RING_SECS)}})]


hub = Hub()


async def audience(c: dict) -> set[str]:
    """Everyone allowed to see a conversation: the customer, the assigned employee (or org queue) and org admins."""
    ids = {c["customer_user_id"]}
    q = {"org_id": c["org_id"], "role": "admin"} if c.get("employee_id") else {"org_id": c["org_id"], "role": {"$in": ["admin", "employee"]}}
    ids |= {u["id"] async for u in db.users.find(q, {"id": 1})}
    if c.get("employee_id"):
        ids.add(c["employee_id"])
    return ids


async def publish(c: dict, event: dict, exclude: str | None = None) -> None:
    await hub.send((await audience(c) | await hub.watchers(c["id"])) - {exclude}, {"conversation_id": c["id"], **event})
