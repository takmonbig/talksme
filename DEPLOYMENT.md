# Deploying OmniChat CRM

**Preview status: not production-ready.** Calls, payments, push, Meta Pixel, DNS/TLS, SMS OTP and media storage are mocked; realtime uses polling.

## Frontend (Netlify)
1. Connect the repo; `netlify.toml` builds `frontend/` (`yarn build`, publish `dist`) with SPA fallback.
2. Replace `YOUR-BACKEND-ORIGIN` in `netlify.toml` with your API origin so `/api/*` stays same-origin (cookies are `Secure; HttpOnly; SameSite=Lax`).
3. No secrets live in the frontend.

## Backend (FastAPI)
Env (`backend/.env`): `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`, `JWT_SECRET`. Run `uvicorn server:app`. Seed with `python seed.py`.

## Path to production (planned phases)
- Realtime: replace polling with WebSockets/Supabase Realtime; keep idempotency keys.
- Media: object storage with signed URLs, file-type + malware scanning, 90-day retention job.
- Calls: WebRTC with authenticated signaling and TURN/STUN.
- Billing: Stripe/Razorpay checkout + signed webhook endpoint (status only changes on webhook).
- OTP: SMS/WhatsApp provider for phone-ownership verification.
- Optional migration to PostgreSQL with row-level tenant isolation.
