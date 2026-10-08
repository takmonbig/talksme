"""Server-side analytics shared by employee, admin and super admin dashboards."""
from datetime import datetime, timedelta
from typing import Optional

from lib.db import db
from lib.util import iso, now, range_bounds

CONVERTED = {"Converted", "VIP", "Frequent Customer"}


async def compute(org_id: Optional[str], employee_id: Optional[str], rng: str, frm: Optional[str], to: Optional[str]) -> dict:
    start, end = range_bounds(rng, frm, to)
    q: dict = {}
    if org_id:
        q["org_id"] = org_id
    cq = dict(q, **({"employee_id": employee_id} if employee_id else {}))
    pq = dict(q, **({"assigned_employee_id": employee_id} if employee_id else {}))
    convs = await db.conversations.find(cq, {"_id": 0, "id": 1, "created_at": 1, "last_message_at": 1, "unread_employee": 1,
                                             "employee_id": 1, "landing_page_id": 1, "customer_id": 1, "customer_name": 1,
                                             "last_message": 1, "status": 1}).to_list(10000)
    profs = await db.customer_profiles.find(pq, {"_id": 0, "id": 1, "stage": 1, "created_at": 1}).to_list(10000)
    deps = await db.deposits.find(cq, {"_id": 0}).to_list(10000)

    t = now()
    today = iso(t.replace(hour=0, minute=0, second=0, microsecond=0))
    yday = iso(t.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1))
    day_ago = iso(t - timedelta(days=1))
    in_r = [c for c in convs if start <= c["created_at"] < end]
    dr = [d for d in deps if start <= d["created_at"] < end]
    sums = {s: sum(d["amount"] for d in dr if d["status"] == s) for s in ("Recorded", "Reviewed", "Disputed", "Reversed")}
    provisional = sums["Recorded"] + sums["Reviewed"] + sums["Disputed"]
    valid = [d for d in dr if d["status"] != "Reversed"]
    pay_counts: dict[str, int] = {}
    for d in deps:
        if d["status"] != "Reversed":
            pay_counts[d["customer_id"]] = pay_counts.get(d["customer_id"], 0) + 1
    converted = sum(1 for p in profs if p["stage"] in CONVERTED)

    # average first-response time (customer message -> next employee reply), in minutes
    conv_ids = [c["id"] for c in in_r][:500]
    msgs = await db.messages.find({"conversation_id": {"$in": conv_ids}, "sender_role": {"$in": ["customer", "employee"]}},
                                  {"_id": 0, "conversation_id": 1, "sender_role": 1, "created_at": 1}).sort("created_at", 1).to_list(20000)
    waits, pending = [], {}
    for m in msgs:
        cid = m["conversation_id"]
        if m["sender_role"] == "customer":
            pending.setdefault(cid, m["created_at"])
        elif cid in pending:
            a, b = datetime.fromisoformat(pending.pop(cid)), datetime.fromisoformat(m["created_at"])
            waits.append((b - a).total_seconds() / 60)

    kpis = {
        "conversations": len(in_r),
        "today_conversations": sum(1 for c in convs if c["created_at"] >= today),
        "yesterday_conversations": sum(1 for c in convs if yday <= c["created_at"] < today),
        "all_time_conversations": len(convs),
        "active_conversations": sum(1 for c in convs if c["last_message_at"] >= day_ago),
        "unread_messages": sum(c.get("unread_employee", 0) for c in convs),
        "new_leads": sum(1 for p in profs if start <= p["created_at"] < end),
        "total_customers": len(profs),
        "converted_customers": converted,
        "conversion_rate": round(100 * converted / len(profs), 1) if profs else 0,
        "repeat_customers": sum(1 for v in pay_counts.values() if v >= 2),
        "deposits_provisional": provisional,
        "deposits_recorded": sums["Recorded"],
        "deposits_reviewed": sums["Reviewed"],
        "deposits_disputed": sums["Disputed"],
        "deposits_reversed": sums["Reversed"],
        "deposit_count": len(dr),
        "avg_payment": round(sum(d["amount"] for d in valid) / len(valid), 2) if valid else 0,
        "avg_response_minutes": round(sum(waits) / len(waits), 1) if waits else 0,
    }

    # daily series, capped at the last 31 days of the range
    s_dt = max(datetime.fromisoformat(start), datetime.fromisoformat(end) - timedelta(days=31))
    days = []
    d = s_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    while iso(d) < end:
        days.append(d)
        d += timedelta(days=1)
    series = []
    for d in days:
        a, b = iso(d), iso(d + timedelta(days=1))
        series.append({"date": d.strftime("%d %b"),
                       "conversations": sum(1 for c in convs if a <= c["created_at"] < b),
                       "deposits": sum(x["amount"] for x in deps if a <= x["created_at"] < b and x["status"] != "Reversed")})

    emp_q = {"role": "employee", **({"org_id": org_id} if org_id else {}), **({"id": employee_id} if employee_id else {})}
    by_employee = []
    async for e in db.users.find(emp_q, {"_id": 0, "id": 1, "name": 1, "target": 1, "avatar": 1}):
        e_convs = [c for c in in_r if c.get("employee_id") == e["id"]]
        e_deps = sum(x["amount"] for x in dr if x["employee_id"] == e["id"] and x["status"] != "Reversed")
        conv_custs = len({c["customer_id"] for c in e_convs})
        paid_custs = len({x["customer_id"] for x in dr if x["employee_id"] == e["id"] and x["status"] != "Reversed"})
        by_employee.append({"id": e["id"], "name": e["name"], "avatar": e.get("avatar", ""), "conversations": len(e_convs),
                            "deposits": e_deps, "target": e.get("target", 0),
                            "conversion": round(100 * paid_custs / conv_custs, 1) if conv_custs else 0})

    lp_q = {"org_id": org_id} if org_id else {}
    first_lp = {}
    for c in sorted(convs, key=lambda c: c["created_at"]):
        first_lp.setdefault(c["customer_id"], c.get("landing_page_id"))
    by_landing = []
    async for lp in db.landing_pages.find(lp_q, {"_id": 0, "id": 1, "title": 1, "views": 1, "leads": 1}):
        rev = sum(x["amount"] for x in dr if first_lp.get(x["customer_id"]) == lp["id"] and x["status"] != "Reversed")
        by_landing.append({"id": lp["id"], "title": lp["title"], "views": lp["views"], "leads": lp["leads"],
                           "conversations": sum(1 for c in in_r if c.get("landing_page_id") == lp["id"]), "revenue": rev})

    recent = [{"customer_name": c["customer_name"], "text": c["last_message"], "at": c["last_message_at"], "conversation_id": c["id"]}
              for c in sorted(convs, key=lambda c: c["last_message_at"], reverse=True)[:8]]
    return {"kpis": kpis, "series": series, "by_employee": by_employee, "by_landing": by_landing, "recent": recent}
