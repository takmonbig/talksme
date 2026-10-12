"""CRM: customers, deposits ledger (append-only events), transfers, analytics. Employee + Admin."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from lib.analytics import compute
from lib.auth import require
from lib.db import db
from lib.util import audit, new_id, now_iso
from models.schemas import (Analytics, CustomerProfile, CustomerUpdate, DecideIn, Deposit, DepositCorrectionIn, DepositEvent,
                            DepositIn, DepositStatusIn, EmployeeStat, FollowUpIn, FollowUpPatch, NoteIn, Organization, Transfer)
from routers.chat import reassign

router = APIRouter()
staff = require("employee", "admin")
STAGES = {"New Lead", "Interested", "Hot Lead", "Converted", "VIP", "Frequent Customer", "Inactive", "Blocked"}


async def need_feature(user: dict, key: str) -> None:
    org = await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0, "features": 1})
    if (org or {}).get("features", {}).get(key) is False:
        raise HTTPException(403, "This feature is not enabled for your organization. Contact the platform owner.")


def scope(user: dict, field: str = "assigned_employee_id") -> dict:
    q = {"org_id": user["org_id"]}
    if user["role"] == "employee":
        q[field] = user["id"]
    return q


async def with_totals(profs: list[dict]) -> list[dict]:
    ids = [p["id"] for p in profs]
    totals: dict[str, list[float]] = {}
    async for d in db.deposits.find({"customer_id": {"$in": ids}, "status": {"$ne": "Reversed"}}, {"_id": 0, "customer_id": 1, "amount": 1}):
        totals.setdefault(d["customer_id"], []).append(d["amount"])
    return [{**p, "total_deposits": sum(totals.get(p["id"], [])), "deposit_count": len(totals.get(p["id"], []))} for p in profs]


async def get_profile(user: dict, pid: str) -> dict:
    p = await db.customer_profiles.find_one({"id": pid, "org_id": user["org_id"]}, {"_id": 0})
    if not p or (user["role"] == "employee" and p.get("assigned_employee_id") != user["id"]):
        raise HTTPException(404, "Customer not found")
    return p


@router.get("/customers", response_model=list[CustomerProfile])
async def list_customers(q: str = "", label: str = "", user: dict = Depends(staff)):
    query = scope(user)
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"phone": {"$regex": q.replace("+", r"\+")}}]
    if label:
        query["labels"] = label
    profs = await db.customer_profiles.find(query, {"_id": 0}).sort("last_active", -1).to_list(2000)
    return await with_totals(profs)


@router.get("/customers/{pid}", response_model=CustomerProfile)
async def get_customer(pid: str, user: dict = Depends(staff)):
    return (await with_totals([await get_profile(user, pid)]))[0]


@router.patch("/customers/{pid}", response_model=CustomerProfile)
async def update_customer(pid: str, body: CustomerUpdate, user: dict = Depends(staff)):
    p = await get_profile(user, pid)
    upd = body.model_dump(exclude_none=True)
    if "stage" in upd and upd["stage"] not in STAGES:
        raise HTTPException(422, "Unknown lead stage")
    if "assigned_employee_id" in upd:
        if user["role"] != "admin":
            raise HTTPException(403, "Only admins can reassign customers")
        emp = await db.users.find_one({"id": upd["assigned_employee_id"], "org_id": user["org_id"], "role": "employee"}, {"_id": 0})
        if not emp:
            raise HTTPException(400, "Employee not found")
        upd["assigned_employee_name"] = emp["name"]
        async for c in db.conversations.find({"customer_id": pid}, {"_id": 0}):
            await reassign(user, c, emp, "Customer reassigned by admin")
    if "labels" in upd:
        upd["labels"] = sorted({l.strip() for l in upd["labels"] if l.strip()})[:20]
    if "blocked" in upd:
        if not upd["blocked"] and p.get("blocked_by_role") == "admin" and user["role"] != "admin":
            raise HTTPException(403, "This block was set by an admin")
        upd["blocked_by_role"] = user["role"] if upd["blocked"] else None
        await audit(user, "customer.blocked" if upd["blocked"] else "customer.unblocked", f"customer:{pid}", user["org_id"])
    if upd:
        await db.customer_profiles.update_one({"id": pid}, {"$set": upd})
    conv_upd = {k2: upd[k] for k, k2 in (("name", "customer_name"), ("phone", "customer_phone")) if k in upd}
    if conv_upd:  # org-scoped CRM record only; the customer's own identity/login is untouched
        await db.conversations.update_many({"customer_id": pid}, {"$set": conv_upd})
        await audit(user, "customer.details_updated", f"customer:{pid} {sorted(conv_upd)}", user["org_id"])
    return (await with_totals([await get_profile(user, pid)]))[0]


@router.post("/customers/{pid}/notes", response_model=CustomerProfile)
async def add_note(pid: str, body: NoteIn, user: dict = Depends(staff)):
    await get_profile(user, pid)
    note = {"id": new_id(), "text": body.text, "author_name": user["name"], "created_at": now_iso()}
    await db.customer_profiles.update_one({"id": pid}, {"$push": {"notes": {"$each": [note], "$position": 0}}})
    return (await with_totals([await get_profile(user, pid)]))[0]


@router.post("/customers/{pid}/followups", response_model=CustomerProfile)
async def add_followup(pid: str, body: FollowUpIn, user: dict = Depends(staff)):
    await get_profile(user, pid)
    fu = {"id": new_id(), "title": body.title, "due": body.due, "done": False}
    await db.customer_profiles.update_one({"id": pid}, {"$push": {"follow_ups": fu}})
    await db.conversations.update_many({"customer_id": pid}, {"$set": {"follow_up": True}})
    return (await with_totals([await get_profile(user, pid)]))[0]


@router.patch("/customers/{pid}/followups/{fid}", response_model=CustomerProfile)
async def patch_followup(pid: str, fid: str, body: FollowUpPatch, user: dict = Depends(staff)):
    await get_profile(user, pid)
    await db.customer_profiles.update_one({"id": pid, "follow_ups.id": fid}, {"$set": {"follow_ups.$.done": body.done}})
    return (await with_totals([await get_profile(user, pid)]))[0]


@router.get("/employees", response_model=list[EmployeeStat])
async def list_employees(user: dict = Depends(staff)):
    out = []
    async for e in db.users.find({"org_id": user["org_id"], "role": "employee", "deleted": {"$ne": True}}, {"_id": 0, "password_hash": 0}).sort("name", 1):
        e["open_conversations"] = await db.conversations.count_documents({"employee_id": e["id"], "status": "open"})
        e["total_conversations"] = await db.conversations.count_documents({"employee_id": e["id"]})
        e["deposits_total"] = sum([d["amount"] async for d in db.deposits.find({"employee_id": e["id"], "status": {"$ne": "Reversed"}}, {"amount": 1})])
        out.append(e)
    return out


# ---------------- deposits ----------------
@router.get("/deposits", response_model=list[Deposit])
async def list_deposits(status: str = "", q: str = "", customer_id: str = "", user: dict = Depends(staff)):
    query = scope(user, "employee_id")
    if status:
        query["status"] = status
    if customer_id:
        query["customer_id"] = customer_id
    if q:
        query["$or"] = [{"customer_name": {"$regex": q, "$options": "i"}}, {"reference": {"$regex": q, "$options": "i"}},
                        {"product": {"$regex": q, "$options": "i"}}]
    return await db.deposits.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)


@router.post("/deposits", response_model=Deposit)
async def record_deposit(body: DepositIn, user: dict = Depends(staff)):
    p = await get_profile(user, body.customer_id)
    await need_feature(user, "deposits")
    if body.reference.strip() in ("", "-"):  # quick payment without a transaction reference: generate a unique one
        body.reference = f"MANUAL-{new_id()[:8].upper()}"
    if await db.deposits.find_one({"org_id": user["org_id"], "reference": body.reference}):
        raise HTTPException(409, "A deposit with this transaction reference already exists")
    emp_id = p.get("assigned_employee_id") if user["role"] == "admin" and p.get("assigned_employee_id") else user["id"]
    emp = await db.users.find_one({"id": emp_id}, {"_id": 0, "name": 1})
    t = now_iso()
    d = {"id": new_id(), "org_id": user["org_id"], "customer_id": p["id"], "customer_name": p["name"], "employee_id": emp_id,
         "employee_name": emp["name"] if emp else user["name"], **body.model_dump(exclude={"customer_id"}),
         "status": "Recorded", "created_at": t}
    await db.deposits.insert_one(dict(d))
    await db.deposit_events.insert_one({"id": new_id(), "deposit_id": d["id"], "org_id": d["org_id"], "action": "recorded",
                                        "from_status": "", "to_status": "Recorded", "old_amount": None, "new_amount": d["amount"],
                                        "reason": body.notes or "Initial entry", "actor_name": user["name"], "at": t})
    if p["stage"] in ("New Lead", "Interested", "Hot Lead"):
        await db.customer_profiles.update_one({"id": p["id"]}, {"$set": {"stage": "Converted"}, "$addToSet": {"labels": "Converted"}})
    elif await db.deposits.count_documents({"customer_id": p["id"], "status": {"$ne": "Reversed"}}) >= 3:
        await db.customer_profiles.update_one({"id": p["id"]}, {"$addToSet": {"labels": "Frequent Customer"}})
    return Deposit(**d)


async def _deposit(user: dict, did: str) -> dict:
    d = await db.deposits.find_one({"id": did, **scope(user, "employee_id")}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Deposit not found")
    return d


@router.get("/deposits/{did}/events", response_model=list[DepositEvent])
async def deposit_events(did: str, user: dict = Depends(staff)):
    await _deposit(user, did)
    return await db.deposit_events.find({"deposit_id": did}, {"_id": 0}).sort("at", 1).to_list(500)


@router.post("/deposits/{did}/status", response_model=Deposit)
async def change_status(did: str, body: DepositStatusIn, user: dict = Depends(require("admin"))):
    d = await _deposit(user, did)
    if d["status"] == body.status:
        raise HTTPException(400, f"Deposit is already {body.status}")
    if d["status"] == "Reversed":
        raise HTTPException(400, "Reversed deposits are final; record a new entry instead")
    if body.status in ("Disputed", "Reversed") and len(body.reason.strip()) < 5:
        raise HTTPException(422, "A reason (min 5 characters) is required to dispute or reverse")
    await db.deposits.update_one({"id": did}, {"$set": {"status": body.status}})
    await db.deposit_events.insert_one({"id": new_id(), "deposit_id": did, "org_id": d["org_id"], "action": "status_change",
                                        "from_status": d["status"], "to_status": body.status, "old_amount": None, "new_amount": None,
                                        "reason": body.reason, "actor_name": user["name"], "at": now_iso()})
    await audit(user, f"deposit.{body.status.lower()}", f"deposit:{did}", d["org_id"], body.reason)
    return Deposit(**{**d, "status": body.status})


@router.post("/deposits/{did}/correction", response_model=Deposit)
async def correct_amount(did: str, body: DepositCorrectionIn, user: dict = Depends(require("admin"))):
    d = await _deposit(user, did)
    if d["status"] == "Reversed":
        raise HTTPException(400, "Reversed deposits cannot be corrected")
    await db.deposits.update_one({"id": did}, {"$set": {"amount": body.amount}})
    await db.deposit_events.insert_one({"id": new_id(), "deposit_id": did, "org_id": d["org_id"], "action": "correction",
                                        "from_status": d["status"], "to_status": d["status"], "old_amount": d["amount"],
                                        "new_amount": body.amount, "reason": body.reason, "actor_name": user["name"], "at": now_iso()})
    await audit(user, "deposit.corrected", f"deposit:{did} {d['amount']} -> {body.amount}", d["org_id"], body.reason)
    return Deposit(**{**d, "amount": body.amount})


# ---------------- transfers ----------------
@router.get("/transfers", response_model=list[Transfer])
async def list_transfers(user: dict = Depends(staff)):
    q = {"org_id": user["org_id"]}
    if user["role"] == "employee":
        q["$or"] = [{"from_employee_id": user["id"]}, {"to_employee_id": user["id"]}]
    return await db.transfers.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/transfers/{tid}/decide", response_model=Transfer)
async def decide_transfer(tid: str, body: DecideIn, user: dict = Depends(require("admin"))):
    tr = await db.transfers.find_one({"id": tid, "org_id": user["org_id"]}, {"_id": 0})
    if not tr:
        raise HTTPException(404, "Transfer not found")
    if tr["status"] != "pending":
        raise HTTPException(400, "Transfer already decided")
    status = "approved" if body.approve else "rejected"
    await db.transfers.update_one({"id": tid}, {"$set": {"status": status, "decided_by_name": user["name"]}})
    if body.approve:
        c = await db.conversations.find_one({"id": tr["conversation_id"]}, {"_id": 0})
        emp = await db.users.find_one({"id": tr["to_employee_id"]}, {"_id": 0})
        if c and emp:
            await reassign(user, c, emp, f"Transfer approved: {tr['reason']}")
    await audit(user, f"transfer.{status}", f"transfer:{tid}", user["org_id"], tr["reason"])
    return Transfer(**{**tr, "status": status, "decided_by_name": user["name"]})


# ---------------- analytics ----------------
@router.get("/org", response_model=Organization)
async def my_org(user: dict = Depends(staff)):
    return await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0})


@router.get("/analytics", response_model=Analytics)
async def analytics(range: str = "30d", frm: Optional[str] = None, to: Optional[str] = None, employee_id: Optional[str] = None,
                    user: dict = Depends(staff)):
    emp = user["id"] if user["role"] == "employee" else employee_id
    return await compute(user["org_id"], emp, range, frm, to)
