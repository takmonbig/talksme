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

## Calls, notifications, PWA install, auto messages (latest)
- ROOT-CAUSE FIX: beginSession() used queryClient.clear(), so the app-root useMe observer (realtime WebSocket + CallManager) was orphaned after login or landing-page onboarding. The WebSocket never connected until a reload, so calls were never delivered and ended as "missed". It now removes every query except ["me"] and invalidates ["me"]; useRealtime reconnects whenever the user id changes.
- ICE/TURN: GET /api/calls/ice-servers returns STUN plus Metered TURN. It uses METERED_TURN_APP + METERED_TURN_API_KEY if set; otherwise it mints a Metered realtime token with METERED_SK_ID/SECRET and reads welcome.metadata.iceServers. Results are cached for 30 min. turn=false means the Metered account has no TURN service enabled yet.
- Calls: ringtone (incoming) and ringback (outgoing) via WebAudio (lib/sound.ts), plus a system notification when the tab is hidden. A 25s connecting timeout logs "failed". Brief disconnects get a 6s grace period. The pending offer (and its ICE candidates) is kept up to 40s, so a callee who opens the app from the push notification still rings.
- Web Push (VAPID; keys in backend/.env): POST /api/push/subscribe, GET /api/push/key. The server pushes on new messages (only to users with no visible tab; the WS sends {type:"visibility"}) and on incoming calls (always). sw.js handles push and notificationclick (focus + navigate). In dev, sw.js?dev=1 handles push only, with no caching.
- Message sound: playMessageTone when a message from someone else arrives (realtime event carries sender_id), unless notify_sound=false.
- UI: NotifyBanner ("Enable") above the chat composer for customers and employees, and at the top of staff pages, until permission is granted (shows unblock steps if denied; iOS hint if unsupported). InstallBanner ("INSTALL APP NOW", hidden in standalone): on landing pages (sticky top), under the customer chat header, and in the customer inbox list. InstallPill in the inbox header. InstallHelpDialog has Android and iOS steps.
- Onboarding dialog shows a large "enter your REAL WhatsApp number (backup)" notice. After start, if the PWA is detected as installed (getInstalledRelatedApps) and we're in the browser, an "Open in app / Continue here" dialog appears.
- Mobile keyboard: viewport meta interactive-widget=resizes-content, 100dvh layouts, and the composer scrolls into view on focus.
- Employee auto messages: GET/PUT /api/employee/auto-messages {enabled, welcome[≤5]{id,text,enabled}, return_enabled, return_text}. Placeholders: {name}, {employee}, {org}. Welcome messages are sent as the employee when a NEW conversation is created; the welcome-back message is sent when an existing chat is reopened after 12h+ of inactivity (at most once per 12h). UI is in Employee → Settings. Demo employees are seeded with 2 welcome messages and a welcome-back message.

## Agora calls, multi-replica realtime, no-login guests, real Meta Pixel (latest)
- Voice calls use Agora RTC (agora-rtc-sdk-ng, loaded lazily). Ring/accept/reject/end/busy are still signalled over our WebSocket (actions offer/answer/reject/end/busy, plus not_allowed sent back by the server). The caller joins channel `call_{conversation_id}` while ringing; the callee joins on accept. The call counts as connected on user-joined or user-published. GET /api/calls/{cid}/agora returns {app_id, channel, uid, token}; the token is built with agora-token-builder (RtcTokenBuilder, 1h) from AGORA_APP_ID + AGORA_APP_CERTIFICATE in backend/.env. Access is checked with can_access.
- Production runs 2 backend replicas. lib/realtime.py Hub delivers to local sockets and writes every event to Mongo `rt_events` (TTL 120s); each pod's relay_loop polls every 250ms and delivers events from other pods. Presence/visibility (`rt_presence`), Super Admin watchers (`rt_watchers`) and ringing calls (`rt_calls`) are also stored in Mongo.
- Push fix: guests used to be created with notify_push=false, so push filtered them out. New guests get true, a boot migration ("push-default-on") flips existing customers, and /push/subscribe sets notify_push=true. Push tasks keep references so they aren't garbage-collected, and every send is logged ("push <tag> -> <status>"). When the app is visible but a different chat is open, an in-app toast appears.
- Per-customer calling: customer_profiles.calls_allowed (default true), toggled by staff in the CustomerPanel ("Customer can call me", PATCH /api/customers/{id}). When false, the customer's conversation has calls_enabled=false (call button disabled) and the server refuses customer offers with not_allowed. Employees can still call the customer.
- No login for customers: Chat Now immediately calls /public/landing/{org}/{slug}/start with {} and creates "Guest NNNN" (phone ""), or reuses the cookie session. A new chat gets a system message with kind="phone_request"; the customer sees a Share/Skip card (POST /api/me/backup-phone, /api/me/backup-phone/skip). Numbers already owned by another customer return 409, and restoring those requires the OTP flow ("Chatted with us before? Restore your chats" link on the landing page). The customer ⋮ menu has "Add WhatsApp backup number".
- Persistent login: JWT and cookie last 400 days, and GET /auth/me re-issues the cookie (sliding). The login page shows "already signed in, Continue".
- Meta Pixel is real (lib/pixel.ts): official fbevents.js loader, init once per ID, PageView on load, Lead + Contact on chat start, with eventID and UTM params only. The admin builder accepts a pasted full Pixel code and extracts the ID (frontend extractPixelId plus a backend field_validator). The consent banner and mock log were removed.

## Control center batch (latest)
- SECURITY FIX: removed POST /api/demo/reset. Any signed-in user could call it and wipe the whole platform. The reset button was removed from every header.
- Super Admin orgs (/superadmin/organizations): server search GET /api/superadmin/org-search?q matches org name/slug/domain/ID and Admin name/email/phone. Checkboxes + Select All + bulk bar → POST /api/superadmin/organizations/bulk {ids, action: activate|suspend|archive|delete|restore|plan|seats, plan_id?, seats?, reason}. Delete is soft (status "deleted", purge_after +30 days). Suspend/archive/delete unpublish landing pages; current_user blocks staff of suspended/archived/deleted orgs.
- Reset links: POST /api/superadmin/users/{uid}/reset-link creates a single-use token (24h; only its sha256 is stored in password_resets). Public page /reset-password calls POST /api/auth/reset-password.
- Danger zone (inside the org details dialog only): GET /superadmin/organizations/{oid}/reset-preview shows counts. POST .../reset {password (step-up check against the SA's own password), confirm_name (exact org name), reason} starts a background job (`jobs`). The job snapshots documents to `org_reset_backups`, then deletes that org's conversations, messages, customer_profiles, deposits, deposit_events, calls, transfers, broadcasts, notifications and quick_replies. It keeps the org, users, landing pages, invoices/billing and audit logs. Poll GET /superadmin/jobs/{id}. Export buttons for backup are shown before reset.
- /superadmin/landing-pages: GET /api/superadmin/landing-pages lists every page (with org, employees, visits, leads, conversions). Filters: org/employee/domain/type/status, A–Z / Z–A sort, search by title/URL/ID. PATCH (published/archived/title/cta/description), DELETE (soft: deleted+archived, slug freed).
- Admin: DELETE /api/admin/landing-pages/{lid} (own org only, soft). Two types only: template "B" = Type A Chat Now; template "A" = Type B Choose service (service cards with image, name, description, employee, per-service default_message; reorderable; customer selects a card, then Start Chat).
- Default customer message: landing_pages.default_message / auto_send_default / employee_can_edit_message (and images[].default_message). /start returns `prefill`, which the frontend passes as router state to ChatThread to prefill the composer. When auto_send_default is on, it is inserted once as a CUSTOMER message (idempotency_key default-msg-{cid}). Employees edit it via GET /api/employee/landing-pages and PATCH /api/employee/landing-pages/{lid}/default-message, only when allowed.
- Platform support: org "org-platform" ("TalksMe Support", slug talksme-support, LP "support") is created at boot and hidden from SA org lists. Main-site "Connect with Support Agent" calls POST /api/public/support/start, which uses the same guest/session flow. Super Admins can access org-platform conversations only (can_access); GET /conversations returns them; the audience includes all superadmins. Super Admin messages are labelled "<identity> · <first name>" (identity must contain "TalksMe"; GET/PUT /superadmin/support/identity). New outbound: POST /superadmin/support/conversations {customer_user_id, text, kind support|announcement}; announcements require opt-in and append STOP text. UI: /superadmin/support.
- Admin notifications (/admin/notifications): POST /api/admin/notifications {customer_id, title, body, url} pushes to that customer's devices. Status: sent, no_device, blocked_by_preferences or failed. History is stored in `notifications`.
- Employee avatar: AvatarUploader (JPG/PNG/WebP ≤5MB, square crop with drag/zoom, 512px JPEG uploaded to Cloudinary, replace/remove) in Employee settings.
- QuickPayment form at the top of CustomerPanel: name, WhatsApp, label(stage), amount ₹, date, method, note. It PATCHes /customers/{id} (name/phone also sync to the conversations) and POSTs /deposits (product/reference are now optional with defaults).
- Admin employee activation already existed (PATCH /admin/employees/{eid} active); reactivating now sends the employee a push.
- Chat: Linkify (http/https/www only, safe href, noopener) in ChatThread; a "Powered by TalksMe" chip links to https://talksme.in; staff see "Customer deleted this for themselves" (deleted_by_customer), and delete-for-self still hides the message only for the customer.
- Pixel: once per page path (SPA-safe); Admin PixelTester fires real events and checks for a facebook.com/tr request.
- sw.js: pushsubscriptionchange re-subscribes.
