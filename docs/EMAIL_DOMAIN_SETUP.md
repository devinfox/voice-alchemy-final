# Voice Alchemy Academy — Email Domain Setup

The full ByeTalk/CRM email client is ported as **SendGrid-only**, using the same
**Meridian “other” SendGrid account** (`OTHER_SENDGRID_API_KEY`).

## Env (already wired in `.env.local`)

| Variable | Purpose |
|---|---|
| `SENDGRID_API_KEY` | Same Meridian/other key (domain auth + default send) |
| `OTHER_SENDGRID_API_KEY` | Meridian/other account key |
| `OTHER_SENDGRID_DOMAIN` | `voicealchemyacademy.com` (must match authenticated domain) |
| `SENDGRID_FROM_EMAIL` | Default from address |
| `SENDGRID_WEBHOOK_SECRET` | Event webhook verification (optional) |
| `INBOUND_FORWARD_SECRET` | Railway inbound service → app handoff |
| `NEXT_PUBLIC_EMAIL_DOMAIN` | UI domain hint |
| `EMAIL_AI_ENABLED` | Turn on AI triage of inbound mail |

## Your steps (domain)

1. **Apply Supabase migrations**
   - `20260729000001_email_users_shim.sql`
   - `20260729000002_email_system.sql`
   - `20260729000003_email_funnels.sql`
   - `20260729000004_email_storage_buckets.sql`

2. **Authenticate domain in SendGrid** (Meridian/other account)
   - In app: **Email → Settings → Domains → Add** `voicealchemyacademy.com`
   - Or via SendGrid UI: Domain Authentication
   - Publish the CNAME records SendGrid shows (DKIM + mail CNAME)

3. **MX for inbound** (if you want mail received in the app)
   - Point MX to SendGrid Inbound Parse (or your parse hostname)
   - Inbound Parse URL should hit either:
     - Railway `inbound-email-service` (recommended for large attachments), which
       forwards to `https://<app>/api/email/webhooks/sendgrid/inbound` with
       `INBOUND_FORWARD_SECRET`, **or**
     - Directly the inbound webhook (small messages only; Vercel body limit)

4. **Event webhook** (opens/clicks/bounces)
   - SendGrid → Event Webhook →
     `https://<app>/api/email/webhooks/sendgrid/events`

5. **Create your mailbox**
   - Email → Settings → Accounts → create e.g.
     `you@voicealchemyacademy.com` on the verified domain

6. **Deploy inbound service (optional but recommended)**
   See `inbound-email-service/` — Railway env:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `CRM_BASE_URL` = production app URL
   - `INBOUND_FORWARD_SECRET` = same as app
   - `STORAGE_BUCKET=email-attachments`

## App routes

- Client: `/dashboard/email`
- Templates / funnels: `/dashboard/email-templates`
- Domains: `/dashboard/email/settings/domains`
- Accounts: `/dashboard/email/settings/accounts`
