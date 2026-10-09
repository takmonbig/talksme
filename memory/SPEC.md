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
