# OmniChat CRM (talksme.in) — Spec

Interactive, backend-connected preview of a multi-tenant chat CRM. FastAPI + MongoDB backend, Vite/React/TS frontend.

## Roles & login
Email/password, JWT in httpOnly cookie `omni_session` (12h). Every endpoint enforces role + tenant scope server-side (`lib/auth.require`, `lib/conv.can_access`).
- customer → `/chat` universal inbox (conversations across orgs, by `customer_user_id`)
- employee → `/employee/*` (only own assigned conversations + org queue, own customers/deposits)
- admin → `/admin/*` (own org only)
- superadmin → `/superadmin/*` (platform; cross-tenant data only via `POST /superadmin/organizations/{id}/access` with reason + password step-up, audited)
Credentials: see memory/test_credentials.md. All demo passwords `Demo@123`.

## Seed (lib/seed_data.py, reset via POST /api/demo/reset or `python seed.py`; auto-seeds on empty DB)
3 orgs (org-talksme "Talksme Demo Co." growth/active, org-aurora "Aurora Wellness" starter/trial, org-nimbus "Nimbus Realty" business/active), 8 employees, 3 admins, 1 superadmin, 30 customer users (32 profiles; Rahul has profiles in all 3 orgs), 50 conversations, ~233 messages, 30 deposits (14 Recorded/10 Reviewed/4 Disputed/2 Reversed), 5 landing pages (talksme: sales[A, fixed], support[B, round_robin, 24/7], team-a[B, unpublished, calls off]; aurora: consult[A]; nimbus: homes[B]), 4 plans, 4 broadcasts, 12 invoices, 1 pending transfer (Priya → Rohan, org-talksme).

## Key flows
- Public landing `/p/{orgSlug}/{slug}` → onboarding (country code + phone + name) → guest customer session → conversation (upsert unique on customer+landing page, so retries/double clicks never duplicate). If phone already exists → OTP challenge (MOCKED: code returned in response and shown in UI) before history is disclosed.
- Routing: fixed / round_robin (skips offline) / least_busy (online only, else queue) / manual (queue) / team. Template A image → mapped employee.
- Messages: idempotency_key dedupe, sent→delivered (other side lists convs)→read (other side opens thread), typing, reply, delete-for-self (`hidden_for`), archive/mute per viewer, rate limit 20/10s, attachments ≤25MB.
- Transfers: employee requests → admin approves/rejects → reassign + system message + audit log.
- Deposits: employee/admin record (status Recorded, provisional). Admin: status change (reason required for Disputed/Reversed; Reversed is final), amount correction appends event with old/new. Events in `deposit_events` (append-only).
- Billing: admin change plan → pending invoice → simulated webhook (success/fail) updates subscription. Never on redirect.
- Super Admin: orgs CRUD/suspend (reason), plans editor, admins, domains, audit logs, settings (flags, theme presets).

## MOCKED
WebRTC calls (state simulation + call log), payments/webhooks, push notifications, Meta Pixel (console + on-page log, consent-gated), DNS/TLS verification, SMS OTP delivery, media storage (small images as data URLs, others sample URLs), realtime (polling 3–4s).

## Stabilisation notes (latest)
- Customer OTP: always a real BlackSMS WhatsApp OTP, no demo bypass (owner decision). If BlackSMS balance is low, OTP fails with a clear error. Customer email login (customer@talksme.in / Demo@123) still works.
- Uploads: 9 MB limit checked in the UI (media.tsx/ChatThread) and on the server (POST messages returns 413 above 9 MB; signature max_bytes=9437184).
- WebRTC call checked with two browsers: ring -> accept -> connected -> end.

## Super Admin Customer explorer (/superadmin/customers)
- Filter by organization and employee (URL ?org=&employee=). The employees table shows how many customers and conversations each employee has.
- Customer table (search/sort/pagination): name, email, WhatsApp number, org, employee(s), stage, deposits, messages, last active.
- Customer sheet: every profile field, labels, notes, follow-ups, deposit list, all conversations, plus the full read-only chat transcript (including messages a participant deleted only for themselves).
- APIs (superadmin only, 403 for other roles): GET /api/superadmin/employees?org_id, GET /api/superadmin/customers?org_id&employee_id, GET /api/superadmin/customers/{id}, GET /api/superadmin/conversations/{id}/messages. Each call writes an audit log entry (sa.customers_listed / sa.customer_viewed / sa.transcript_viewed).
- Entry points: sidebar "Customer explorer", and "Customers & chats" on each employee row in the org details dialog.

## Super Admin audit tools
- Export: GET /api/superadmin/export?fmt=xlsx|pdf&org_id&employee_id. Excel has 3 sheets (Customers, Chat history, Deposits); the PDF has a customer table, then each conversation's transcript, then deposits. Buttons appear on the Customer explorer and Employee comparison pages. Audited (sa.export_*).
- Chat search (/superadmin/search): GET /api/superadmin/search?q (min 2 chars)&org_id. Text matches are case-insensitive; phone matches need 4+ digits. "Open chat" opens the customer sheet on that conversation. Audited (sa.chat_search).
- Employee comparison (/superadmin/employee-compare): GET /api/superadmin/employee-compare?org_id. Per employee: customers, chats, messages sent, avg reply minutes (customer message → next employee reply), conversion %, deposits, target progress.
- Live watch: while a transcript is open, the Super Admin's WebSocket sends {type:"watch"} (repeated every 2s, idempotent) and the hub adds them to hub.watchers[conversation_id]. publish() also delivers message/typing events to watchers. Participants are never told. The first watch is audited (sa.live_watch_started); an "unwatch" is sent when the transcript closes.
