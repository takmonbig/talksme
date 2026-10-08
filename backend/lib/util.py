"""Small shared helpers: ids, ISO timestamps, date ranges, audit logging."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException

from lib.db import db


def new_id() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def now_iso() -> str:
    return iso(now())


def range_bounds(rng: str = "30d", frm: Optional[str] = None, to: Optional[str] = None) -> tuple[str, str]:
    """Server-anchored date ranges -> (start_iso, end_iso). Timestamps are stored as UTC ISO strings."""
    n = now()
    today = n.replace(hour=0, minute=0, second=0, microsecond=0)
    end = n + timedelta(seconds=1)
    if rng == "today":
        start = today
    elif rng == "yesterday":
        start, end = today - timedelta(days=1), today
    elif rng == "7d":
        start = today - timedelta(days=6)
    elif rng == "30d":
        start = today - timedelta(days=29)
    elif rng == "custom" and frm and to:
        try:
            start = datetime.fromisoformat(frm).replace(tzinfo=timezone.utc)
            end = datetime.fromisoformat(to).replace(tzinfo=timezone.utc) + timedelta(days=1)
        except ValueError:
            raise HTTPException(400, "Invalid custom date range")
        if start >= end:
            raise HTTPException(400, "Start date must be before end date")
    elif rng == "all":
        start = datetime(2000, 1, 1, tzinfo=timezone.utc)
    else:
        raise HTTPException(400, "Unknown range")
    return iso(start), iso(end)


async def audit(actor: dict, action: str, resource: str, org_id: Optional[str] = None, reason: str = "") -> None:
    await db.audit_logs.insert_one({
        "id": new_id(),
        "org_id": org_id,
        "actor_id": actor.get("id"),
        "actor_name": actor.get("name", "system"),
        "actor_role": actor.get("role", "system"),
        "action": action,
        "resource": resource,
        "reason": reason,
        "at": now_iso(),
    })
