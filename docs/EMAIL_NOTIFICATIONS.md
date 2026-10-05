# BZEAD Email Systems — Auth SMTP (MSG91) & Notification Emails (Resend)

> **Status:** Production · Last updated 2026-10-05
> **Critical rule:** The two systems below are **fully independent**. Changing one must never touch the other.

---

## 1. Architecture Overview

| | **Auth emails** | **Notification emails** |
|---|---|---|
| Purpose | OTP login, magic links, password reset, email confirmation | Order events, product/KYC approvals, returns, refunds, contact form |
| Provider | **MSG91** transactional SMTP (`smtp.mailer91.com:587`) | **Resend** REST API (`https://api.resend.com/emails`) |
| Where configured | Supabase Dashboard → **Authentication → SMTP** (stored inside GoTrue, NOT in edge function secrets) | Supabase **Edge Function secrets** (`RESEND_API_KEY`, …) |
| Code | None (platform-managed by Supabase Auth) | `supabase/functions/send-email/`, `supabase/functions/send-contact-email/` |
| From address | `no-reply@mail.bzead.com` (sender name "BZEAD") | `no-reply@bzead.com` (via `RESEND_FROM_EMAIL`) |
| DNS domain | `mail.bzead.com` — SPF `v=spf1 include:mailer91.com ~all` **(must stay)** | `bzead.com` (apex) — verified in Resend |
| Invoked by | Supabase Auth internally | Frontend (`src/lib/notificationService.ts`) → edge functions |

**⚠️ DO NOT EDIT the Auth SMTP settings** unless explicitly asked. They work. Removing/changing them breaks OTP login for every user instantly.

---

## 2. Auth SMTP (MSG91) — read-only reference

- Host: `smtp.mailer91.com`, port 587, user `emailer@mail.bzead.com` (see `supabase/config.toml [auth.email.smtp]` — mirrors the dashboard settings for local dev).
- Credentials live **only** in Supabase Auth's own config store. They are **not** edge function secrets. The `MSG91_*` edge secrets are legacy and unrelated to auth.
- DNS: `mail.bzead.com` has SPF `include:mailer91.com` and MX `mx1/mx2.mailer91.com`. **Do not remove these** — auth deliverability depends on them.

---

## 3. Notification emails (Resend) — how it works

### 3.1 Edge functions

| Function | verify_jwt | Auth check (in code) | Role |
|---|---|---|---|
| `send-email` | `false` | Bearer must be service-role key **or** a valid Supabase user JWT (verified against `/auth/v1/user`) | All order/notification emails |
| `send-contact-email` | `true` | Public contact endpoint with input validation + CORS allowlist | Contact form (mobile + web) |

> The `verify_jwt` flags above are the **live project settings** — preserve them on every deploy (see §5).

### 3.2 Event types (`send-email` Mode 1 — structured)

`order_placed`, `order_accepted`, `order_rejected`, `order_cancelled`, `label_ready`,
`order_shipped`, `order_picked_up`, `order_in_transit`, `order_delivered`,
`return_requested`, `return_approved`, `return_rejected`, `refund_processed`

Each event renders per-recipient subjects/bodies for **buyer / seller / admin** (templates in `supabase/functions/send-email/index.ts`, `EVENT_CONFIG`).

Frontend entry points: `notifyOrderEvent()`, `notifyAccountEvent()`, `sendOrderEmail()` in `src/lib/notificationService.ts`.

### 3.3 Reliability features

- **Idempotency** — every structured send is checked against the `email_logs` table (unique index on `order_id + event_type + recipient_type + email`). Replays return `status: "skipped"` and no duplicate email is sent.
- **Audit trail** — every attempt is written to `email_logs` (`sent` / `failed` / `skipped` + `error_message`). Query failures with:
  ```sql
  SELECT * FROM email_logs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 20;
  ```
- **Failure fallback** — if Resend fails, the recipient gets an **in-app notification** ("Email delivery failed … you have been notified in-app instead") so no event is silently lost.
- **Retries** — 3 attempts, exponential backoff (500ms base). HTTP 400/401/403/422 from Resend fail fast (they can never succeed on retry).
- **Attachments** — the invoice PDF is attached to the buyer's `order_placed` email only (base64 → Resend `attachments[].content`).
- **Rate limit** — 240 emails/min (4/sec), far below Resend's 10 req/s.

### 3.4 Contact form (`send-contact-email`)

Validates name/email/message, then emails `CONTACT_TO_EMAIL` (default `info@bzead.com`), with `reply_to` set to the submitter so support can hit "Reply" directly.

---

## 4. Configuration (edge function secrets)

| Secret | Required | Value in production | Notes |
|---|---|---|---|
| `RESEND_API_KEY` | ✅ | `re_ZP4S…` (send-only restricted key) | Restricted keys can send but **cannot manage domains** via API |
| `RESEND_FROM_EMAIL` | — | `no-reply@bzead.com` | Falls back to `no-reply@mail.bzead.com` if unset — do NOT use that default with Resend (unverified subdomain in Resend) |
| `RESEND_REPLY_TO` | — | `support@bzead.com` (code default) | |
| `CONTACT_FROM_EMAIL` | — | `no-reply@bzead.com` | **Was** `no-reply@mail.bzead.com` (MSG91-era); it outranks `RESEND_FROM_EMAIL` in the contact function |
| `CONTACT_TO_EMAIL` | — | `info@bzead.com` (default) | |
| `MSG91_*` | legacy | left in place, unused by email functions | Auth SMTP does not read these |

Set/rotate with:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_…
# one secret
curl -X POST "https://api.supabase.com/v1/projects/aiiefgjfftmerayihpbv/secrets" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '[{"name":"RESEND_API_KEY","value":"re_…"}]'
```

Note: names starting with `SUPABASE_` are reserved — the API rejects them.

---

## 5. Deploying the functions

```bash
export SUPABASE_ACCESS_TOKEN=sbp_…
cd Bzeadstore-main   # directory containing supabase/

# send-email — MUST keep verify_jwt=false (live setting)
bunx supabase functions deploy send-email \
  --project-ref aiiefgjfftmerayihpbv --no-verify-jwt

# send-contact-email — MUST keep verify_jwt=true (default, no flag)
bunx supabase functions deploy send-contact-email \
  --project-ref aiiefgjfftmerayihpbv
```

Verify after deploy:

```bash
curl -s "https://api.supabase.com/v1/projects/aiiefgjfftmerayihpbv/functions" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | jq '.[] | {slug, verify_jwt, status}'
```

---

## 6. DNS records (Cloudflare zone `bzead.com`, zone id `89e4576c4de59722253f1fd03c6748d2`)

### For Resend (apex `bzead.com` — verified in Resend dashboard)

| Type | Name | Content | Purpose |
|---|---|---|---|
| TXT | `bzead.com` | `v=spf1 include:amazonses.com ~all` | SPF for Resend/SES sending (added 2026-10-05) |
| TXT | `resend._domainkey.bzead.com` | `p=MIGfMA0GCSqGSIb3…` | DKIM signing |
| CNAME | `send.bzead.com` | `send.forge.rmta.net` | Bounce/return-path handling |
| CNAME | `rsend.bzead.com` | `rsend-apne1.forge.rmta.net` | Resend infra |

### For Auth SMTP (MSG91) — **DO NOT TOUCH**

| Type | Name | Content |
|---|---|---|
| TXT | `mail.bzead.com` | `v=spf1 include:mailer91.com ~all` |
| MX | `mail.bzead.com` | `mx1.mailer91.com`, `mx2.mailer91.com` |

If you ever send notifications from a *different* domain than `bzead.com`, verify it in the Resend dashboard first — Resend returns **403 "not authorized to send emails from …"** otherwise.

---

## 7. End-to-end test recipe

```bash
BASE="https://aiiefgjfftmerayihpbv.supabase.co"
ANON="…anon key…"; TOKEN="…user JWT from a signed-in session…"

# 1. Contact form path
curl -X POST "$BASE/functions/v1/send-contact-email" \
  -H "Origin: https://www.bzead.com" -H "apikey: $ANON" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"E2E Test","email":"e2e-test@bzead.com","message":"E2E test message, please ignore."}'
# expect: {"ok":true,"id":"<resend-id>"}

# 2. Structured order event (idempotent — safe to replay)
curl -X POST "$BASE/functions/v1/send-email" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventType":"order_placed","data":{"order_id":"RES-E2E-TEST-001","customer_name":"E2E Buyer","order_total":"1.00","currency":"INR","items":[]},"recipients":[{"email":"delivered@resend.dev","recipientType":"admin","recipientName":"E2E"}]}'
# expect: {"success":true,"sent":1,…}   (second identical call → "skipped":1)

# 3. Audit trail (must show status='sent')
#    SELECT event_type, recipient_type, status, created_at
#    FROM email_logs ORDER BY created_at DESC LIMIT 5;
```

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Resend 401: API key is invalid/restricted` | Key revoked or lacks send scope | Rotate in Resend dashboard → update `RESEND_API_KEY` secret |
| `Resend 403: not authorized to send emails from X` | From-domain not verified in Resend | Verify domain in Resend dashboard or set `RESEND_FROM_EMAIL` to a verified domain (`bzead.com`) |
| `{"error":"Unauthorized"}` from `send-email` | Bearer is neither the service-role env value nor a real user JWT | Send a user JWT (frontend does this automatically) or the current service key |
| Contact form returns `RESEND_API_KEY not configured` | Secret missing | Add secret (§4); no redeploy needed |
| Emails fail but in-app alerts arrive | Resend rejection — check `email_logs.error_message` | See rows above |
| OTP/login emails stop | **Auth SMTP (MSG91) issue — separate system** | Check Supabase Auth SMTP settings + `mail.bzead.com` SPF/MX. Do **not** touch Resend config for this |

### Incident log

- **2026-08-14 → 2026-10-05 — notification emails 100% down.** MSG91 SMTP credentials stored as edge secrets started returning `535 Invalid Credentials` (167 consecutive failures, zero emails sent). Auth/OTP was unaffected (separate credential store). Customers still received in-app notifications, masking the outage. **Fix:** migrated notification email to Resend (commit `80ff7c5`), verified end-to-end 2026-10-05.
- **2026-05-02 — historical:** earlier Resend integration failed with `401 API key invalid` (4 attempts) before the MSG91 SMTP era; the current integration supersedes both.

---

## 9. Known limitations

- Resend **sandbox/restricted** keys only send from verified domains — `mail.bzead.com` is *not* verified in Resend (it belongs to MSG91/auth). Notification sender must stay `no-reply@bzead.com` (or another Resend-verified domain).
- The `resend.dev` test addresses (`delivered@`, `bounced@`) simulate delivery without a real inbox — useful for CI-style checks.
- `send-contact-email` is invoked by mobile apps too; changing its CORS `ALLOWED_ORIGINS` or `verify_jwt` requires checking both platforms.
