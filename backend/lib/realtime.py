"""In-process WebSocket hub: instant message/typing delivery + WebRTC call signaling relay."""
import time
from collections import defaultdict

from fastapi import WebSocket

from lib.db import db


class Hub:
    def __init__(self) -> None:
        self.conns: dict[str, set[WebSocket]] = defaultdict(set)
        # Super Admin silent watchers: conversation_id -> {superadmin user ids}. Participants are never notified.
        self.watchers: dict[str, set[str]] = defaultdict(set)
        self.visible: set[WebSocket] = set()  # sockets whose tab/app is currently in the foreground
        # Ringing calls (conversation_id -> (callee uid, event, started)) so a callee who opens the app from a push still gets the offer.
        self.pending_calls: dict[str, tuple[str, dict, float]] = {}

    def add(self, uid: str, ws: WebSocket) -> None:
        self.conns[uid].add(ws)

    def remove(self, uid: str, ws: WebSocket) -> None:
        self.conns[uid].discard(ws)
        self.visible.discard(ws)
        if not self.conns[uid]:
            for w in self.watchers.values():
                w.discard(uid)

    def visible_now(self, uid: str) -> bool:
        return any(ws in self.visible for ws in self.conns.get(uid, ()))

    def ringing_for(self, uid: str) -> list[dict]:
        now = time.time()
        for cid in [k for k, v in self.pending_calls.items() if now - v[2] > 40]:
            self.pending_calls.pop(cid, None)
        return [ev for callee, ev, _ in self.pending_calls.values() if callee == uid]

    def online(self, uid: str) -> bool:
        return bool(self.conns.get(uid))

    async def send(self, uids: set[str], event: dict) -> None:
        for uid in uids:
            for ws in list(self.conns.get(uid, ())):
                try:
                    await ws.send_json(event)
                except Exception:
                    self.conns[uid].discard(ws)


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
    await hub.send((await audience(c) | hub.watchers.get(c["id"], set())) - {exclude}, {"conversation_id": c["id"], **event})
