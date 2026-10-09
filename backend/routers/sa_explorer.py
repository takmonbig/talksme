"""Super Admin customer explorer: org -> employee -> customers -> full chat transcripts. Read-only, every view audited."""
from fastapi import APIRouter, Depends, HTTPException

from lib.auth import require
from lib.db import db
from lib.util import audit
from models.schemas import Deposit, Message, SAConversation, SACustomerDetail, SACustomerRow, SAEmployee

router = APIRouter(prefix="/superadmin")
sa = require("superadmin")


async def _org_names() -> dict[str, str]:
    return {o["id"]: o["name"] async for o in db.organizations.find({}, {"_id": 0, "id": 1, "name": 1})}


@router.get("/employees", response_model=list[SAEmployee])
async def list_employees(org_id: str | None = None, user: dict = Depends(sa)):
    names = await _org_names()
    q: dict = {"role": "employee", "deleted": {"$ne": True}}
    if org_id:
        q["org_id"] = org_id
    out = []
    async for u in db.users.find(q, {"_id": 0, "id": 1, "name": 1, "email": 1, "org_id": 1, "active": 1, "status": 1, "avatar": 1}).sort("name", 1):
        custs = await db.conversations.distinct("customer_id", {"employee_id": u["id"]})
        out.append(SAEmployee(**u, org_name=names.get(u["org_id"], ""), customers=len(custs),
                              conversations=await db.conversations.count_documents({"employee_id": u["id"]})))
    return out


async def _row(p: dict, names: dict[str, str]) -> SACustomerRow:
    convs = await db.conversations.find({"customer_id": p["id"]}, {"_id": 0, "id": 1, "employee_name": 1, "last_message": 1, "last_message_at": 1}).sort("last_message_at", -1).to_list(100)
    cu = await db.users.find_one({"id": p["user_id"]}, {"_id": 0, "email": 1}) or {}
    deps = [d async for d in db.deposits.find({"customer_id": p["id"], "status": {"$ne": "Reversed"}}, {"_id": 0, "amount": 1})]
    return SACustomerRow(**{**p, "org_name": names.get(p["org_id"], ""), "email": cu.get("email") or "",
                            "employees": sorted({c["employee_name"] for c in convs if c.get("employee_name")}),
                            "conversation_count": len(convs),
                            "message_count": await db.messages.count_documents({"conversation_id": {"$in": [c["id"] for c in convs]}}),
                            "last_message": convs[0].get("last_message", "") if convs else "",
                            "total_deposits": sum(d["amount"] for d in deps), "deposit_count": len(deps)})


@router.get("/customers", response_model=list[SACustomerRow])
async def list_customers(org_id: str | None = None, employee_id: str | None = None, user: dict = Depends(sa)):
    q: dict = {}
    if org_id:
        q["org_id"] = org_id
    if employee_id:
        ids = await db.conversations.distinct("customer_id", {"employee_id": employee_id})
        q["$or"] = [{"id": {"$in": ids}}, {"assigned_employee_id": employee_id}]
    names = await _org_names()
    rows = [await _row(p, names) async for p in db.customer_profiles.find(q, {"_id": 0}).sort("last_active", -1)]
    await audit(user, "sa.customers_listed", f"org:{org_id or 'all'} employee:{employee_id or 'all'} ({len(rows)} customers)", org_id)
    return rows


@router.get("/customers/{cid}", response_model=SACustomerDetail)
async def customer_detail(cid: str, user: dict = Depends(sa)):
    p = await db.customer_profiles.find_one({"id": cid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Customer not found")
    convs = []
    async for c in db.conversations.find({"customer_id": cid}, {"_id": 0}).sort("last_message_at", -1):
        convs.append(SAConversation(**c, message_count=await db.messages.count_documents({"conversation_id": c["id"]})))
    deps = await db.deposits.find({"customer_id": cid}, {"_id": 0}).sort("payment_date", -1).to_list(500)
    await audit(user, "sa.customer_viewed", f"customer:{p['name']} {p['phone']}", p["org_id"])
    return SACustomerDetail(customer=await _row(p, await _org_names()), conversations=convs, deposits=[Deposit(**d) for d in deps])


@router.get("/conversations/{conv_id}/messages", response_model=list[Message])
async def transcript(conv_id: str, user: dict = Depends(sa)):
    c = await db.conversations.find_one({"id": conv_id}, {"_id": 0, "org_id": 1, "customer_name": 1, "employee_name": 1})
    if not c:
        raise HTTPException(404, "Conversation not found")
    msgs = await db.messages.find({"conversation_id": conv_id}, {"_id": 0}).sort("created_at", 1).to_list(5000)
    await audit(user, "sa.transcript_viewed", f"conversation:{conv_id} {c.get('customer_name')} <> {c.get('employee_name') or 'queue'}", c["org_id"])
    return msgs
