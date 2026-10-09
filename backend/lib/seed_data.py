"""Deterministic demo dataset. reset_demo() wipes and reseeds every collection (used by seed.py and /api/demo/reset)."""
import random
from datetime import timedelta

from lib.auth import hash_pw
from lib.db import db, ensure_indexes
from lib.util import iso, new_id, now

DEMO_PASSWORD = "Demo@123"
COLLECTIONS = [
    "users", "organizations", "customer_profiles", "conversations", "messages", "deposits", "deposit_events",
    "transfers", "landing_pages", "broadcasts", "plans", "invoices", "audit_logs", "calls", "otp_challenges",
    "platform_settings", "quick_replies",
]
LOGO = "https://customer-assets-m6fa6gv7.emergentagent.net/job_9a74ecc3-1406-41c7-b859-27f365d11bd4/artifacts/eff273b31f7ef718_Talksme.in_Gradient_Chat_Logo-removebg-preview.png"
BANNERS = [
    "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1400&q=70",
    "https://images.unsplash.com/photo-1544027993-37dbfe43562a?w=1400&q=70",
    "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1400&q=70",
]
FIRST = ["Aarav", "Diya", "Ishaan", "Kavya", "Aditya", "Saanvi", "Vihaan", "Anika", "Reyansh", "Myra", "Arnav", "Pari",
         "Kian", "Zara", "Dhruv", "Tara", "Yash", "Ira", "Laksh", "Riya", "Om", "Navya", "Veer", "Siya", "Rudra",
         "Aisha", "Krish", "Meher", "Shaurya"]
LAST = ["Kapoor", "Reddy", "Joshi", "Bose", "Chopra", "Desai", "Menon", "Pillai", "Rao", "Saxena"]
CUST_LINES = ["Hi, I saw your page and wanted to know more.", "What are the pricing options?",
              "Can I get a callback today?", "Is this available in Mumbai?", "Thanks, that helps!",
              "I've made the payment, please check.", "Can you share the brochure?", "Do you offer EMI?",
              "What are your working hours?", "Please send the invoice."]
EMP_LINES = ["Hello! Thanks for reaching out. How can I help you today?", "Sure — sharing the details right away.",
             "Our plans start from ₹2,999. Shall I walk you through them?", "Payment noted, our team will review it.",
             "Absolutely, I'll schedule a callback for you.", "Here is the brochure you asked for.",
             "Yes, EMI options are available on 3, 6 and 12 months."]
PRODUCTS = ["Premium Plan", "Wellness Package", "Consultation", "Site Visit Booking", "Annual Membership", "Starter Kit"]
STAGES = ["New Lead", "Interested", "Hot Lead", "Converted", "VIP", "Frequent Customer", "Inactive"]


def avatar(n: int) -> str:
    return f"https://i.pravatar.cc/200?img={n}"


DEFAULT_AUTO = {"enabled": True, "return_enabled": True, "welcome": [
    {"id": "auto-1", "enabled": True, "text": "Hi {name}! 👋 I'm {employee} from {org}. Thanks for reaching out, how can I help you today?"},
    {"id": "auto-2", "enabled": True, "text": "Tip: install the talksme.in app and turn on notifications so you never miss my reply 🔔"}],
    "return_text": "Welcome back {name}! 😊 Great to see you again. Let me know what you need."}


async def reset_demo() -> None:
    rnd = random.Random(42)
    t0 = now()
    for c in COLLECTIONS:
        await db[c].drop()
    await ensure_indexes()
    pw = hash_pw(DEMO_PASSWORD)

    plans = [
        {"id": "plan-starter", "name": "Starter", "price_monthly": 999, "price_yearly": 9990, "seats": 3,
         "features": ["1 organization", "1 custom domain", "Basic analytics"], "active": True},
        {"id": "plan-growth", "name": "Growth", "price_monthly": 2999, "price_yearly": 29990, "seats": 10,
         "features": ["Advanced analytics", "CRM automation", "Broadcast management"], "active": True},
        {"id": "plan-business", "name": "Business", "price_monthly": 6999, "price_yearly": 69990, "seats": 25,
         "features": ["Advanced permissions", "Enhanced reporting", "Priority support"], "active": True},
        {"id": "plan-enterprise", "name": "Enterprise", "price_monthly": 19999, "price_yearly": 199990, "seats": 100,
         "features": ["Custom seats", "Custom usage limits", "Advanced support"], "active": True},
    ]
    await db.plans.insert_many([dict(p) for p in plans])

    orgs = [
        {"id": "org-talksme", "name": "Talksme Demo Co.", "slug": "talksme", "domain": "chat.talksme.in",
         "domain_status": "verified", "plan_id": "plan-growth", "seats": 10, "status": "active",
         "primary_color": "#0284C7", "accent_color": "#8B5CF6", "logo_url": LOGO, "banner_url": BANNERS[0]},
        {"id": "org-aurora", "name": "Aurora Wellness", "slug": "aurora", "domain": "care.aurorawellness.in",
         "domain_status": "pending", "plan_id": "plan-starter", "seats": 3, "status": "trial",
         "primary_color": "#059669", "accent_color": "#06B6D4", "logo_url": "", "banner_url": BANNERS[1]},
        {"id": "org-nimbus", "name": "Nimbus Realty", "slug": "nimbus", "domain": "", "domain_status": "unconfigured",
         "plan_id": "plan-business", "seats": 25, "status": "active", "primary_color": "#7C3AED",
         "accent_color": "#F59E0B", "logo_url": "", "banner_url": BANNERS[2]},
    ]
    for i, o in enumerate(orgs):
        o.update({"features": {k: True for k in ("broadcasts", "audio_calls", "landing_builder", "advanced_analytics", "deposits", "quick_replies")}, "billing_cycle": "monthly", "font": "Inter", "retention_days": 90,
                  "created_at": iso(t0 - timedelta(days=120 - i * 30)),
                  "trial_ends": iso(t0 + timedelta(days=10)) if o["status"] == "trial" else None})
    await db.organizations.insert_many([dict(o) for o in orgs])

    def user(email, name, role, org_id=None, **kw):
        return {"id": new_id(), "email": email, "name": name, "role": role, "org_id": org_id, "password_hash": pw,
                "avatar": kw.get("avatar", ""), "title": kw.get("title", ""), "phone": kw.get("phone", ""),
                "status": kw.get("status", "offline"), "verified": kw.get("verified", False), "active": True,
                "calls_enabled": True, "guest": False, "target": kw.get("target", 0),
                "notify_sound": True, "notify_push": False, "created_at": iso(t0 - timedelta(days=90))}

    emp_specs = [
        ("agent@talksme.in", "Priya Sharma", "org-talksme", "Customer Success Lead", 47, "online"),
        ("rohan@talksme.in", "Rohan Patel", "org-talksme", "Sales Associate", 12, "online"),
        ("vikram@talksme.in", "Vikram Malhotra", "org-talksme", "Tech Support", 13, "away"),
        ("neha@talksme.in", "Neha Iyer", "org-talksme", "Sales Associate", 45, "offline"),
        ("arjun@aurora.demo", "Arjun Mehta", "org-aurora", "Wellness Advisor", 15, "online"),
        ("sara@aurora.demo", "Sara Khan", "org-aurora", "Wellness Advisor", 44, "offline"),
        ("kabir@nimbus.demo", "Kabir Singh", "org-nimbus", "Property Consultant", 33, "online"),
        ("meera@nimbus.demo", "Meera Nair", "org-nimbus", "Property Consultant", 49, "online"),
    ]
    employees = [user(e, n, "employee", o, title=t, avatar=avatar(a), status=s, verified=i != 3,
                      target=150000 if o == "org-talksme" else 80000)
                 for i, (e, n, o, t, a, s) in enumerate(emp_specs)]
    for e in employees:
        e["auto_messages"] = DEFAULT_AUTO
    admins = [user("admin@talksme.in", "Ananya Gupta", "admin", "org-talksme", avatar=avatar(32), title="Org Admin"),
              user("admin@aurora.demo", "Dev Arora", "admin", "org-aurora", avatar=avatar(52), title="Org Admin"),
              user("admin@nimbus.demo", "Isha Kulkarni", "admin", "org-nimbus", avatar=avatar(20), title="Org Admin")]
    superadmin = user("superadmin@talksme.in", "Platform Owner", "superadmin", avatar=avatar(60), title="Super Admin")
    rahul = user("customer@talksme.in", "Rahul Verma", "customer", phone="+919800000001", avatar=avatar(11))
    customers = [rahul]
    for i in range(29):
        c = user(None, f"{FIRST[i]} {LAST[i % len(LAST)]}", "customer", phone=f"+91980000{1002 + i:04d}")
        c["password_hash"] = None
        customers.append(c)
    await db.users.insert_many([dict(u) for u in employees + admins + [superadmin] + customers])

    emp_by_org: dict[str, list[dict]] = {}
    for e in employees:
        emp_by_org.setdefault(e["org_id"], []).append(e)
    org_by_id = {o["id"]: o for o in orgs}

    lps = [
        ("org-talksme", "Talk to our Sales Team", "sales", "A", "Pick your associate and start chatting in seconds."),
        ("org-talksme", "24/7 Customer Support", "support", "B", "Questions about your order? We reply fast."),
        ("org-talksme", "Team A — Enterprise", "team-a", "B", "Dedicated desk for enterprise buyers."),
        ("org-aurora", "Book a Wellness Consultation", "consult", "A", "Choose your wellness advisor."),
        ("org-nimbus", "Find Your Dream Home", "homes", "B", "Talk to a property consultant today."),
    ]
    landing = []
    for i, (org_id, title, slug, tpl, desc) in enumerate(lps):
        emps = emp_by_org[org_id]
        lp = {"id": new_id(), "org_id": org_id, "title": title, "slug": slug, "template": tpl, "description": desc,
              "cta_text": "Chat Now", "primary_color": org_by_id[org_id]["primary_color"], "font": "Inter",
              "logo_url": org_by_id[org_id]["logo_url"], "banner_url": org_by_id[org_id]["banner_url"],
              "trust_items": ["Verified team members", "Secure, encrypted chat", "Replies in under 5 minutes"],
              "routing": ["fixed", "round_robin", "least_busy", "round_robin", "least_busy"][i],
              "assigned_employee_ids": [e["id"] for e in emps],
              "images": [{"id": new_id(), "url": e["avatar"], "label": e["name"], "employee_id": e["id"]} for e in emps] if tpl == "A" else [],
              "calls_enabled": i != 2, "pixel_id": "123456789012345" if i < 2 else "", "published": i != 2,
              "available_24_7": i == 1, "views": rnd.randint(400, 3000), "leads": 0, "rr_index": 0,
              "created_at": iso(t0 - timedelta(days=60 - i))}
        landing.append(lp)

    profiles, convs, messages, deposits, dep_events = [], [], [], [], []
    org_cycle = ["org-talksme"] * 17 + ["org-aurora"] * 6 + ["org-nimbus"] * 6
    assignments = [(customers[0], "org-talksme"), (customers[0], "org-aurora"), (customers[0], "org-nimbus")]
    assignments += [(customers[i + 1], org_cycle[i]) for i in range(29)]
    for cu, org_id in assignments:
        pool = emp_by_org[org_id]
        emp = pool[0] if (org_id == "org-talksme" and rnd.random() < 0.5) else rnd.choice(pool)
        created = t0 - timedelta(days=rnd.randint(0, 40), hours=rnd.randint(0, 23))
        stage = rnd.choice(STAGES)
        labels = [stage] + (["VIP"] if stage == "VIP" else []) + (["Repeat"] if rnd.random() < 0.2 else [])
        profiles.append({"id": new_id(), "org_id": org_id, "user_id": cu["id"], "name": cu["name"], "phone": cu["phone"],
                         "labels": sorted(set(labels)), "stage": stage, "assigned_employee_id": emp["id"],
                         "assigned_employee_name": emp["name"], "blocked": False, "opted_in": rnd.random() > 0.2,
                         "notes": [], "follow_ups": [], "created_at": iso(created), "last_active": iso(created)})

    # 50 conversations: one per profile, then extra ones on a second landing page.
    pairs = [(p, [lp for lp in landing if lp["org_id"] == p["org_id"]][0]) for p in profiles]
    extra = [p for p in profiles if p["org_id"] == "org-talksme"]
    pairs += [(p, [lp for lp in landing if lp["org_id"] == "org-talksme"][1 + k % 2]) for k, p in enumerate(extra[:50 - len(pairs)])]
    emp_lookup = {e["id"]: e for e in employees}
    for idx, (p, lp) in enumerate(pairs):
        emp = emp_lookup[p["assigned_employee_id"]]
        start = t0 - (timedelta(minutes=rnd.randint(30, 300)) if idx % 6 == 0 else timedelta(days=rnd.randint(1, 35), hours=rnd.randint(0, 20)))
        cid, t = new_id(), start
        n = rnd.randint(3, 6)
        last = ""
        for m in range(n):
            role = "customer" if m % 2 == 0 else "employee"
            text = rnd.choice(CUST_LINES if role == "customer" else EMP_LINES)
            att = {"kind": "image", "name": "brochure.jpg", "url": BANNERS[idx % 3], "size": 182000} if (role == "employee" and m == 3) else None
            t = t + timedelta(minutes=rnd.randint(1, 18))
            messages.append({"id": new_id(), "conversation_id": cid, "org_id": p["org_id"], "sender_role": role,
                             "sender_id": p["user_id"] if role == "customer" else emp["id"],
                             "sender_name": p["name"] if role == "customer" else emp["name"], "text": text,
                             "attachment": att, "reply_to": None, "reply_preview": "",
                             "status": "read" if m < n - 1 else "delivered", "created_at": iso(t),
                             "idempotency_key": new_id(), "hidden_for": []})
            last = text if not att else "📷 Photo"
        unread = 1 if (n % 2 == 1 and idx % 3 == 0) else 0
        convs.append({"id": cid, "org_id": p["org_id"], "customer_id": p["id"], "customer_user_id": p["user_id"],
                      "customer_name": p["name"], "customer_phone": p["phone"], "employee_id": emp["id"],
                      "employee_name": emp["name"], "landing_page_id": lp["id"], "landing_title": lp["title"],
                      "last_message": last, "last_message_at": iso(t), "unread_employee": unread, "unread_customer": 0,
                      "archived_by": [], "muted_by": [], "follow_up": idx % 7 == 0, "blocked_by_customer": False,
                      "status": "open", "created_at": iso(start), "typing": {}})
        lp["leads"] += 1
        if iso(start) < p["created_at"]:
            p["created_at"] = iso(start)
        p["last_active"] = max(p["last_active"], iso(t))

    # unassigned waiting-queue conversation (manual routing demo)
    statuses = ["Recorded"] * 14 + ["Reviewed"] * 10 + ["Disputed"] * 4 + ["Reversed"] * 2
    paying = [p for p in profiles if p["stage"] in ("Converted", "VIP", "Frequent Customer", "Hot Lead")] or profiles
    for i in range(30):
        p = paying[i % len(paying)]
        emp = emp_lookup[p["assigned_employee_id"]]
        dt = t0 - timedelta(days=rnd.randint(0, 29) if i % 5 else 0, hours=rnd.randint(0, 12) if i % 5 else 0, minutes=rnd.randint(5, 50))
        st = statuses[i]
        d = {"id": new_id(), "org_id": p["org_id"], "customer_id": p["id"], "customer_name": p["name"],
             "employee_id": emp["id"], "employee_name": emp["name"], "amount": float(rnd.choice([2999, 4999, 7500, 12000, 18500, 25000, 49999])),
             "currency": "INR", "product": rnd.choice(PRODUCTS), "method": rnd.choice(["UPI", "Bank Transfer", "Card", "Cash"]),
             "reference": f"TXN{rnd.randint(10**8, 10**9)}", "payment_date": dt.date().isoformat(), "notes": "",
             "proof_name": "receipt.pdf" if i % 3 == 0 else "", "status": st, "created_at": iso(dt)}
        deposits.append(d)
        dep_events.append({"id": new_id(), "deposit_id": d["id"], "org_id": d["org_id"], "action": "recorded", "from_status": "",
                           "to_status": "Recorded", "old_amount": None, "new_amount": d["amount"], "reason": "Initial entry",
                           "actor_name": emp["name"], "at": iso(dt)})
        if st != "Recorded":
            dep_events.append({"id": new_id(), "deposit_id": d["id"], "org_id": d["org_id"], "action": "status_change",
                               "from_status": "Recorded", "to_status": st, "old_amount": None, "new_amount": None,
                               "reason": {"Reviewed": "Matched with bank statement", "Disputed": "Reference not found",
                                          "Reversed": "Customer refund issued"}[st],
                               "actor_name": "Ananya Gupta", "at": iso(dt + timedelta(hours=6))})

    await db.landing_pages.insert_many(landing)
    await db.customer_profiles.insert_many(profiles)
    await db.conversations.insert_many(convs)
    await db.messages.insert_many(messages)
    await db.deposits.insert_many(deposits)
    await db.deposit_events.insert_many(dep_events)

    # a pending transfer request for the admin approval demo
    c0 = next(c for c in convs if c["employee_id"] == employees[0]["id"])
    await db.transfers.insert_one({"id": new_id(), "org_id": "org-talksme", "conversation_id": c0["id"],
                                   "customer_name": c0["customer_name"], "from_employee_id": employees[0]["id"],
                                   "from_employee_name": employees[0]["name"], "to_employee_id": employees[1]["id"],
                                   "to_employee_name": employees[1]["name"], "reason": "Customer prefers Hindi-speaking associate",
                                   "status": "pending", "created_at": iso(t0 - timedelta(hours=3)), "decided_by_name": ""})

    bcs = [("Diwali Offer", "Get 20% off on annual plans this week!", "all", "sent", 5),
           ("Webinar Invite", "Join our product webinar on Friday 5pm.", "Hot Lead", "sent", 12),
           ("New Feature", "Voice notes are now available in chat.", "VIP", "scheduled", -2),
           ("Wellness Week", "Free consultation for all members.", "all", "sent", 8)]
    for i, (title, msg, seg, st, days) in enumerate(bcs):
        org_id = "org-aurora" if i == 3 else "org-talksme"
        rec = rnd.randint(8, 16)
        await db.broadcasts.insert_one({"id": new_id(), "org_id": org_id, "title": title, "message": msg, "segment": seg,
                                        "scheduled_at": iso(t0 + timedelta(days=-days)) if st == "scheduled" else None,
                                        "status": st, "recipients": rec, "delivered": rec - 1 if st == "sent" else 0,
                                        "read": rec // 2 if st == "sent" else 0, "opted_out": 1 if st == "sent" else 0,
                                        "created_at": iso(t0 - timedelta(days=abs(days)))})

    plan_by = {p["id"]: p for p in plans}
    for o in orgs:
        for m in range(4):
            amt = plan_by[o["plan_id"]]["price_monthly"]
            await db.invoices.insert_one({"id": new_id(), "org_id": o["id"], "org_name": o["name"],
                                          "plan_name": plan_by[o["plan_id"]]["name"], "cycle": "monthly", "seats": o["seats"],
                                          "amount": amt, "status": "failed" if (o["id"] == "org-aurora" and m == 0) else "paid",
                                          "date": iso(t0 - timedelta(days=30 * m + 2))})

    await db.platform_settings.insert_one({
        "id": "platform", "default_retention_days": 90, "maintenance_mode": False, "payment_qr_url": "", "upi_id": "talksme@upi",
        "feature_flags": {"audio_calls": True, "broadcasts": True, "meta_pixel": True, "voice_notes": True, "employee_2fa": False},
        "theme_presets": [{"name": "Talksme Ocean", "primary": "#0284C7", "accent": "#8B5CF6"},
                          {"name": "Emerald", "primary": "#059669", "accent": "#06B6D4"},
                          {"name": "Royal Violet", "primary": "#7C3AED", "accent": "#F59E0B"}]})
    for o in orgs:
        await db.quick_replies.insert_many([{"id": new_id(), "org_id": o["id"], "title": t, "text": x, "created_by": "Admin"} for t, x in [
            ("Pricing", "Our plans start from ₹2,999. I can share a detailed price list — which product are you interested in?"),
            ("EMI", "Yes! EMI is available on 3, 6 and 12 months with leading banks and UPI apps."),
            ("Callback", "Sure — please share a convenient time and I'll call you back."),
            ("Payment received", "Thank you! Your payment has been recorded and will be confirmed by our accounts team shortly.")]])
    await db.audit_logs.insert_one({"id": new_id(), "org_id": None, "actor_id": None, "actor_name": "system",
                                    "actor_role": "system", "action": "demo.reset", "resource": "platform",
                                    "reason": "Demo data seeded", "at": iso(t0)})
