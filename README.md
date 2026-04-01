# YDT (WordBoost-like) – Full-stack SaaS

Backend: Node.js + Express + MongoDB (Mongoose)  
Frontend: React + Vite

## Local development

### 1) Backend

- Copy `.env.example` to `.env` and fill values.
- Run:

```bash
cd ydt-kelime
npm install
npm start
```

Backend health: `GET /api/health`

### 2) Frontend

```bash
cd ydt-kelime/ydt-kelime-pratigi
npm install
npm run dev
```

### Public pages (Paddle doğrulama)

Canlı sitede şu yollar çalışmalı (SPA: tüm route’lar `index.html`’e düşmeli):

- `https://<domain>/pricing` — fiyatlandırma
- `https://<domain>/terms` — kullanım şartları
- `https://<domain>/privacy` — gizlilik

Yerel geliştirmede Vite bu üç path için `index.html` döndürür.

## Key features (production-ready)

### Billing (Paddle Billing, hosted checkout)

- **Plans endpoint**: `GET /api/billing/plans`
- **Checkout link** (auth): `POST /api/billing/paddle/portal-link` → `{ url }`
- **Webhook**: `POST /api/billing/paddle/webhook` (raw body + HMAC signature)
- Premium/entitlement info is exposed via `GET /api/me`.

Required env:
- `PADDLE_ENV` (`sandbox` | `live`)
- `PADDLE_API_KEY` (server-side; never commit)
- `PADDLE_WEBHOOK_SECRET`
- `PADDLE_PRICE_IDS` — one-line JSON: `aiPlus`, `premium`, `classroom` tiers with `priceId` (`pri_…`), `label`, `description`, `features`, and `entitlements` (see `paddle-price-ids.sample.json` in this folder). Copy the minified JSON into Railway Variables. **Price IDs are not secret tokens**, but keep them out of git if you prefer a repo without live catalog data.

Frontend (`ydt-kelime-pratigi/.env`, optional for embedded Paddle.js): `VITE_PADDLE_CLIENT_TOKEN` (must match the same environment as the API key, e.g. `live_…` with `PADDLE_ENV=live`).

**Entitlements:** `aiPlus` → `entitlements.aiPlus` (lifetime AI Mode, no daily cap); subscription webhooks set `premiumUntil` for `premium` / `classroom`; classroom tier allows quantity (seats).

### AI Mode (Anthropic, streaming SSE + usage tracking)

- **Streaming generation**: `POST /api/ai/write/stream` (SSE)
- **Streaming rewrite**: `POST /api/ai/rewrite/stream` (SSE)
- Daily free limit: 3 requests/day (non-premium).
- DB logging: `AiLog` collection (prompt/output masked).

Required env (same rule as `BREVO_API_KEY`: set in **Railway / Render Variables** or local `.env` only; **never commit** real keys):
- `ANTHROPIC_API_KEY` ([Anthropic Console](https://console.anthropic.com); if leaked or rotated, create a new key and update the variable)
- `ANTHROPIC_MODEL` (optional)
- The Anthropic project must have **billing / credits** enabled; otherwise API returns a credit-balance error (fix under Console → **Plans & Billing**).

### Ads + GDPR

Frontend env (`ydt-kelime-pratigi/.env`):
- `VITE_ADSENSE_CLIENT`
- `VITE_ADSENSE_SLOT_DASHBOARD_SIDEBAR`
- `VITE_ADSENSE_SLOT_DASHBOARD_INLINE`

Cookie consent is required before loading AdSense. Premium users do not see ads.

### Classroom

- Teacher: create class, list classes, view students
- Student: join with class code, list memberships
- CSV bulk import (teacher): `POST /api/classes/:id/import-csv`
- Analytics (teacher): `GET /api/classes/:id/analytics`

## Notes

- Do not commit `.env`. Treat `ANTHROPIC_API_KEY` like mail/API secrets (`BREVO_API_KEY`, etc.): production values live only in the host’s environment variables.
- Webhook endpoint must be publicly reachable in production.
