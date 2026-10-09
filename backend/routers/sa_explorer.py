"""Super Admin customer explorer: org -> employee -> customers -> full chat transcripts. Read-only, every view audited."""
import io
import re
from datetime import datetime
from typing import Literal
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from lib.auth import require
from lib.db import db
from lib.util import audit, now_iso
from models.schemas import Deposit, Message, SACompareRow, SAConversation, SACustomerDetail, SACustomerRow, SAEmployee, SASearchHit

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


# ---------- employee comparison ----------
async def _reply_minutes(conv_ids: list[str]) -> float | None:
    """Average minutes from a customer's message to the next employee reply, across the given conversations."""
    gaps: list[float] = []
    pending: dict[str, datetime] = {}
    async for m in db.messages.find({"conversation_id": {"$in": conv_ids}, "sender_role": {"$in": ["customer", "employee"]}},
                                    {"_id": 0, "conversation_id": 1, "sender_role": 1, "created_at": 1}).sort("created_at", 1):
        cid, t = m["conversation_id"], datetime.fromisoformat(m["created_at"])
        if m["sender_role"] == "customer":
            pending.setdefault(cid, t)
        elif cid in pending:
            gaps.append((t - pending.pop(cid)).total_seconds() / 60)
    return round(sum(gaps) / len(gaps), 1) if gaps else None


@router.get("/employee-compare", response_model=list[SACompareRow])
async def employee_compare(org_id: str | None = None, user: dict = Depends(sa)):
    names = await _org_names()
    q: dict = {"role": "employee", "deleted": {"$ne": True}}
    if org_id:
        q["org_id"] = org_id
    rows = []
    async for u in db.users.find(q, {"_id": 0, "id": 1, "name": 1, "email": 1, "org_id": 1, "avatar": 1, "active": 1, "target": 1}).sort("name", 1):
        convs = await db.conversations.find({"employee_id": u["id"]}, {"_id": 0, "id": 1, "customer_id": 1}).to_list(5000)
        cust_ids = list({c["customer_id"] for c in convs})
        converted = await db.customer_profiles.count_documents({"id": {"$in": cust_ids}, "stage": {"$in": ["Converted", "VIP", "Frequent Customer"]}})
        deps = [d async for d in db.deposits.find({"employee_id": u["id"], "status": {"$ne": "Reversed"}}, {"_id": 0, "amount": 1})]
        rows.append(SACompareRow(**{**u, "org_name": names.get(u["org_id"], ""), "customers": len(cust_ids), "conversations": len(convs),
                                    "messages_sent": await db.messages.count_documents({"sender_id": u["id"]}),
                                    "avg_reply_minutes": await _reply_minutes([c["id"] for c in convs]),
                                    "converted": converted, "conversion_rate": round(converted / len(cust_ids) * 100, 1) if cust_ids else 0,
                                    "deposits_total": sum(d["amount"] for d in deps), "deposit_count": len(deps), "target": u.get("target") or 0}))
    await audit(user, "sa.employee_compare_viewed", f"org:{org_id or 'all'}", org_id)
    return rows


# ---------- platform-wide chat search ----------
@router.get("/search", response_model=list[SASearchHit])
async def search(q: str = Query(min_length=2, max_length=100), org_id: str | None = None, user: dict = Depends(sa)):
    names = await _org_names()
    cq: dict = {"org_id": org_id} if org_id else {}
    convs = {c["id"]: c async for c in db.conversations.find(cq, {"_id": 0, "id": 1, "customer_id": 1, "customer_name": 1, "customer_phone": 1,
                                                                   "employee_name": 1, "org_id": 1, "last_message": 1, "last_message_at": 1})}
    hits: list[SASearchHit] = []
    digits = re.sub(r"\D", "", q)
    base = lambda c: {"conversation_id": c["id"], "customer_id": c["customer_id"], "customer_name": c["customer_name"], "customer_phone": c["customer_phone"],  # noqa: E731
                      "employee_name": c.get("employee_name") or "", "org_id": c["org_id"], "org_name": names.get(c["org_id"], "")}
    if len(digits) >= 4:
        for c in convs.values():
            if digits in re.sub(r"\D", "", c["customer_phone"]):
                hits.append(SASearchHit(kind="phone", text=c.get("last_message", ""), created_at=c["last_message_at"], **base(c)))
    async for m in db.messages.find({"conversation_id": {"$in": list(convs)}, "text": {"$regex": re.escape(q), "$options": "i"}},
                                    {"_id": 0}).sort("created_at", -1).limit(300):
        c = convs[m["conversation_id"]]
        hits.append(SASearchHit(kind="message", message_id=m["id"], sender_name=m.get("sender_name", ""), sender_role=m["sender_role"],
                                text=m.get("text", ""), created_at=m["created_at"], **base(c)))
    await audit(user, "sa.chat_search", f"query:{q!r} org:{org_id or 'all'} ({len(hits)} hits)", org_id)
    return hits


# ---------- audit export (Excel / PDF) ----------
async def _export_data(org_id: str | None, employee_id: str | None):
    names = await _org_names()
    q: dict = {}
    if org_id:
        q["org_id"] = org_id
    cq: dict = {**q}
    if employee_id:
        cq["employee_id"] = employee_id
        ids = await db.conversations.distinct("customer_id", {"employee_id": employee_id})
        q["$or"] = [{"id": {"$in": ids}}, {"assigned_employee_id": employee_id}]
    customers = [await _row(p, names) async for p in db.customer_profiles.find(q, {"_id": 0}).sort("name", 1)]
    cust_ids = [c.id for c in customers]
    convs = await db.conversations.find({**cq, "customer_id": {"$in": cust_ids}}, {"_id": 0}).sort("customer_name", 1).to_list(10000)
    msgs: dict[str, list[dict]] = {c["id"]: [] for c in convs}
    async for m in db.messages.find({"conversation_id": {"$in": list(msgs)}}, {"_id": 0}).sort("created_at", 1):
        msgs[m["conversation_id"]].append(m)
    dq: dict = {"customer_id": {"$in": cust_ids}}
    if employee_id:
        dq["employee_id"] = employee_id
    deposits = await db.deposits.find(dq, {"_id": 0}).sort("payment_date", -1).to_list(10000)
    return customers, convs, msgs, deposits


def _msg_text(m: dict) -> str:
    a = m.get("attachment")
    return (m.get("text") or "") + (f" [{a['kind']}: {a.get('name', '')} {a.get('url', '')}]" if a else "")


@router.get("/export")
async def export(fmt: Literal["xlsx", "pdf"] = "xlsx", org_id: str | None = None, employee_id: str | None = None, user: dict = Depends(sa)):
    customers, convs, msgs, deposits = await _export_data(org_id, employee_id)
    emp = await db.users.find_one({"id": employee_id}, {"_id": 0, "name": 1}) if employee_id else None
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1}) if org_id else None
    scope = " - ".join(x for x in [(org or {}).get("name"), (emp or {}).get("name")] if x) or "All organizations"
    slug = re.sub(r"[^a-z0-9]+", "-", scope.lower()).strip("-")
    buf = io.BytesIO()
    cust_head = ["Customer", "WhatsApp", "Email", "Organization", "Employee(s)", "Assigned", "Stage", "Labels", "Deposits (INR)", "Payments",
                 "Conversations", "Messages", "Opted in", "Blocked", "Created", "Last active"]
    cust_rows = [[c.name, c.phone, c.email, c.org_name, ", ".join(c.employees), c.assigned_employee_name, c.stage, ", ".join(c.labels), c.total_deposits,
                  c.deposit_count, c.conversation_count, c.message_count, "Yes" if c.opted_in else "No", "Yes" if c.blocked else "No", c.created_at, c.last_active]
                 for c in customers]
    if fmt == "xlsx":
        wb = Workbook()
        ws = wb.active
        ws.title = "Customers"
        sheets = [(ws, cust_head, cust_rows),
                  (wb.create_sheet("Chat history"), ["Time", "Customer", "WhatsApp", "Employee", "Landing page", "Sender", "Role", "Message", "Status"],
                   [[m["created_at"], c["customer_name"], c["customer_phone"], c.get("employee_name", ""), c.get("landing_title", ""), m.get("sender_name", ""),
                     m["sender_role"], _msg_text(m), m.get("status", "")] for c in convs for m in msgs[c["id"]]]),
                  (wb.create_sheet("Deposits"), ["Payment date", "Customer", "Employee", "Product", "Method", "Reference", "Amount", "Currency", "Status", "Notes"],
                   [[d["payment_date"], d["customer_name"], d["employee_name"], d["product"], d["method"], d["reference"], d["amount"], d["currency"], d["status"], d.get("notes", "")] for d in deposits])]
        for sh, head, rows in sheets:
            sh.append(head)
            for c in sh[1]:
                c.font = Font(bold=True, color="FFFFFF")
                c.fill = PatternFill("solid", fgColor="0284C7")
            for r in rows:
                sh.append(r)
            for i, col in enumerate(sh.columns, 1):
                sh.column_dimensions[get_column_letter(i)].width = min(60, max(10, *(len(str(x.value or "")) + 2 for x in col)))
            sh.freeze_panes = "A2"
        wb.save(buf)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        ss = getSampleStyleSheet()
        small = ParagraphStyle("small", parent=ss["BodyText"], fontSize=8, leading=10)
        P = lambda t: Paragraph(escape(str(t)), small)  # noqa: E731
        doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=24, rightMargin=24, topMargin=24, bottomMargin=24, title=f"Audit export - {scope}")
        tstyle = TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0284C7")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                             ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")), ("VALIGN", (0, 0), (-1, -1), "TOP")])
        story = [Paragraph(f"OmniChat CRM audit export: {escape(scope)}", ss["Title"]),
                 Paragraph(f"Generated {now_iso()[:19]} UTC by {escape(user['name'])} - {len(customers)} customers, {len(convs)} conversations, "
                           f"{sum(len(v) for v in msgs.values())} messages, {len(deposits)} deposits. Confidential.", small), Spacer(1, 10)]
        pick = [0, 1, 2, 4, 6, 8, 10, 11, 15]
        story.append(Table([[P(cust_head[i]) for i in pick]] + [[P(r[i]) for i in pick] for r in cust_rows], repeatRows=1, style=tstyle))
        for c in convs:
            story += [PageBreak(), Paragraph(escape(f"{c['customer_name']} ({c['customer_phone']}) <> {c.get('employee_name') or 'Queue'} - {c.get('landing_title', '')}"), ss["Heading3"])]
            rows = [[P("Time"), P("Sender"), P("Message")]] + [[P(m["created_at"][:16].replace("T", " ")), P(f"{m.get('sender_name', '')} ({m['sender_role']})"), P(_msg_text(m))] for m in msgs[c["id"]]]
            story.append(Table(rows, colWidths=[90, 140, 540], repeatRows=1, style=tstyle) if len(rows) > 1 else Paragraph("No messages", small))
        if deposits:
            story += [PageBreak(), Paragraph("Deposits", ss["Heading2"]),
                      Table([[P(h) for h in ["Date", "Customer", "Employee", "Product", "Method / ref", "Amount", "Status"]]] +
                            [[P(d["payment_date"][:10]), P(d["customer_name"]), P(d["employee_name"]), P(d["product"]), P(f"{d['method']} / {d['reference']}"),
                              P(f"{d['currency']} {d['amount']:,.2f}"), P(d["status"])] for d in deposits], repeatRows=1, style=tstyle)]
        doc.build(story)
        media = "application/pdf"
    await audit(user, f"sa.export_{fmt}", f"scope:{scope} ({len(customers)} customers, {len(convs)} conversations)", org_id)
    return Response(buf.getvalue(), media_type=media, headers={"Content-Disposition": f'attachment; filename="omnichat-audit-{slug}.{fmt}"'})
