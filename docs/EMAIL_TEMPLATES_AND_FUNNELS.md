# Templates & Funnels

Teacher/admin email tooling at `/dashboard/email-templates`. Access is gated by
`canAccessEmailTools` (admins, plus Julia's teacher account), the same gate as
the inbox.

## Templates

- Built in the block editor (`components/email-builder`). Each row in
  `email_templates` stores the block JSON in `body` and the rendered HTML in
  `body_html`.
- Placeholders are substituted at send time by `renderEmailTemplate` in
  `lib/email-variables.ts`. The same renderer is used by the Send button, the
  funnel worker, and the preview modal, so what you preview is what goes out.

  | Placeholder | Value |
  |---|---|
  | `{{first_name}}` `{{last_name}}` `{{full_name}}` `{{email}}` | The student |
  | `{{teacher_name}}` `{{teacher_first_name}}` `{{teacher_email}}` | The sending mailbox / enrolling teacher |
  | `{{academy_name}}` `{{academy_website}}` `{{login_url}}` | Academy constants (`login_url` uses `NEXT_PUBLIC_APP_URL`) |
  | `{{unsubscribe_url}}` | Signed one-click unsubscribe link for the recipient (`lib/email-unsubscribe.ts`) |

- **Preheader**: the optional inbox preview text on a template. Injected as a
  hidden block at the top of the rendered HTML at send time.

- Categories: welcome, onboarding, lesson, follow_up, course, announcement, general.
- **Starter templates** live in code at `lib/email-templates/starter-templates.ts`.
  The templates tab offers an "Add" button for any starter not yet in the
  database (matched by `starter_key`, then name). Once added it is an ordinary
  editable row.

## The VAA campaign

The full email campaign (students, student leads, teachers, mentorship) is
defined in code and installed with one click; every email is built from the
standard blocks, so it can be edited in the template editor like anything a
person made by hand.

- Copy and block layout: `lib/email-templates/vaa-funnel-emails.json`,
  generated from the design doc script
  `vaa-website/marketing/build-email-template-designs.py --json <path>`. The
  same script renders the HTML design doc, so the doc and the installed
  templates cannot drift. Regenerate both after editing the script.
- Funnels, phase order and delays: `lib/email-templates/starter-funnels.ts`.
- Installer: `POST /api/email-funnels/starter` (idempotent, never overwrites
  existing rows). `GET` reports what is installed.

| Funnel | Trigger | Emails (days after the previous one) |
|---|---|---|
| Students · New account | `student_signup` | Welcome (0) · 30-Second Check (+2) · Scales + Rhythm (+3) · Upgrade Path (+5) · Re-engagement (+7) |
| Student Leads · Pitch guide | `student_lead` | Pitch Guide (0) · Mistake Your Ears Miss (+2) · Before Your Next Rehearsal (+3) |
| Teachers · Demo request | `teacher_demo` | Demo Received (0) · Unbooked Reminder (+3) · Playbook (+2) · Between Lessons (+14) |
| Teachers · Playbook (email only) | `teacher_lead` | Playbook (0) · Between Lessons (+14) |
| Mentorship · Voice Application | `mentorship_application` | Application Received (0) · While Julia Reviews (+2) |

Sent by hand from the template list (pick the person under "Website leads"
in the Send dialog): *Teachers 4 · Post-Demo Recap*, *Teachers 5 · Keep Your
Spot?*, *Mentorship 3 · Julia Would Like to Meet You*, *Mentorship 4 · Not
This Semester*.

Campaign env vars (all optional):

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_EMAIL_IMAGE_BASE` | Where the screenshots live. Default `https://voicealchemyacademy.app/images` (the website's `public/images`). |
| `NEXT_PUBLIC_EMAIL_LOGO_URL` | Header logo. Default `<image base>/logo.png`. |
| `EMAIL_LINK_DEMO_SCHEDULING` | Demo booking link. Falls back to a mailto reply. |
| `EMAIL_LINK_JULIA_BOOKING` | Mentorship call booking link. Falls back to a mailto reply. |
| `EMAIL_LINK_PLAYBOOK_PDF` | Practice visibility playbook PDF. Falls back to the website's teacher view. |
| `EMAIL_LINK_PITCH_GUIDE_PDF` | Pitch guide PDF. Falls back to student signup. |
| `EMAIL_FUNNEL_FROM` | Mailbox funnel emails go out from when the enroller has none (e.g. `hello@voicealchemyacademy.com`). |

Links are resolved at install time, so change the env var **before**
installing, or edit the button in the template afterwards.
- Set `NEXT_PUBLIC_EMAIL_LOGO_URL` to a hosted PNG to put a logo in the starter
  header and in email signatures; without it a text wordmark is used.

## Sending a template

"Send" on a template card opens a student picker (students by default, staff
optional) and sends from the caller's own verified mailbox
(`email_accounts` + `email_domains.verification_status = 'verified'`). Each
send is written to `email_threads`/`emails` as a sent message so replies thread
into the inbox. "Schedule" writes the email as `queued` with `scheduled_at`;
the cron sends it when due.

## Funnels

A funnel is an ordered list of phases; each phase points at a template and has
a delay (days + hours) after the previous phase. Tables:
`email_funnels`, `email_funnel_phases`, `email_funnel_enrollments`,
`email_funnel_logs` (migration `20260729000003_email_funnels.sql`).

Two kinds of people can be in a funnel:

- an **account holder**: `lead_id` = `profiles.id`, email from the `users`
  mirror table;
- a **website lead**: `contact_id` = `email_leads.id`. Leads are people who
  left first name, last name and email on the marketing site (singer guide
  form, teacher demo form, coach overview form, Voice Application) but have no
  account. Migration `20260907000001_email_leads_and_funnel_triggers.sql`.

Ways someone enters a funnel:

1. **Website trigger.** Every form on the marketing site posts to
   `POST /api/leads/inbound` (header `Authorization: Bearer $LEAD_INTAKE_SECRET`,
   the same value as the website's `CRM_LEADS_SECRET`). The lead is upserted
   by email and enrolled in the active funnel whose `trigger_key` matches:
   singer email → `student_lead`, coach email → `teacher_lead`, demo form →
   `teacher_demo` (and ends any `teacher_lead` enrollment), Voice Application
   → `mentorship_application`. Progressive-profiling follow-ups
   (`lead_details`, `teacher_demo_details`) only merge metadata. Someone who
   already has an account is never put on the student lead track.
2. **New student account.** The delivery worker sweeps student profiles
   created in the last 3 days and enrolls them in the `student_signup`
   funnel, links the matching lead row (`email_leads.profile_id`), and cancels
   their `student_lead` enrollment ("Created an account").
3. **Enroll Students** on the funnel page (`POST /api/email-funnels/enroll`
   with `student_ids`). Only active funnels with a template on every phase
   accept enrollments; students already in the funnel or without an email are
   skipped and reported.
4. **Suggested** tab: when `EMAIL_AI_ENABLED=true` and a funnel has
   auto-enrollment on plus a purpose description, inbound emails that match
   are inserted as `pending_approval` (`lib/funnel-matcher.ts`). Nothing sends
   until approved.

Phases are delay-only. Conditions in the design doc ("only if unbooked",
"only if practiced") are not evaluated; pause or remove the person from the
funnel page instead. `enrolled_via` records how each enrollment started
(`manual`, `website`, `signup`, `ai`).

### Unsubscribes

Every template footer links `{{unsubscribe_url}}`, and every send carries
`List-Unsubscribe` / `List-Unsubscribe-Post` headers. `GET|POST
/api/email/unsubscribe?e=<email>&t=<token>` records the address in
`email_unsubscribes`, flags the lead, and cancels their live enrollments. The
worker and the Send dialog skip unsubscribed addresses. Token secret:
`EMAIL_UNSUBSCRIBE_SECRET` (falls back to `CRON_SECRET`).

Per-student controls on the funnel page: pause, resume, remove
(`PATCH /api/email-funnels/enrollments/[id]` with `action`).

## Delivery worker

`GET /api/cron/process-email-queue` (every 5 minutes via `vercel.json`,
authenticated with `CRON_SECRET`):

- Part 0 enrolls new student accounts (see above).
- Part A sends queued one-off emails whose `scheduled_at` is due.
- Part B sends due funnel phases. Each enrollment is claimed with a
  conditional update before sending so overlapping runs cannot double-send;
  a failed send logs to `email_funnel_logs` with `status = 'failed'` and
  retries 30 minutes later. Sends go from the enrolling teacher's verified
  mailbox, then `EMAIL_FUNNEL_FROM`, then any verified mailbox.
- Opens, clicks, and bounces reported by the SendGrid event webhook roll up to
  `email_funnel_logs`, the phase counters, and the funnel totals.

Trigger a run by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/process-email-queue
```

## Production checklist (send + receive)

Email → Settings shows a live **Email Health** panel (`/api/email/health`)
that runs these checks. What has to be true:

| Layer | Requirement | Where |
|---|---|---|
| SendGrid account | Paid plan or available credits. A free account with 0 credits returns "Maximum credits exceeded" on every send. | app.sendgrid.com → Settings → Account Details |
| Domain | `voicealchemyacademy.com` authenticated (CNAMEs valid). MX → `mx.sendgrid.net` for receiving. | SendGrid → Sender Authentication; DNS |
| Inbound | Parse rule: host `voicealchemyacademy.com` → `https://www.voicealchemyacademy.app/api/email/webhooks/sendgrid/inbound` | SendGrid → Settings → Inbound Parse |
| Events | Event Webhook enabled → `https://www.voicealchemyacademy.app/api/email/webhooks/sendgrid/events` with delivered, open, click, bounce, dropped, spam report. Turn on Signed Event Webhook and copy the key. | SendGrid → Settings → Mail Settings → Event Webhook |
| Vercel env | `SENDGRID_API_KEY`, `CRON_SECRET`, `SENDGRID_FROM_EMAIL=noreply@voicealchemyacademy.com`, `NEXT_PUBLIC_EMAIL_DOMAIN=voicealchemyacademy.com`, `NEXT_PUBLIC_APP_URL=https://www.voicealchemyacademy.app`, `SENDGRID_WEBHOOK_SECRET`, `LEAD_INTAKE_SECRET` (shared with the website), `EMAIL_FUNNEL_FROM`, `EMAIL_AI_ENABLED` (optional) | Vercel project `voice-alchemy-dashboard` |
| Website env | `CRM_LEADS_URL=https://www.voicealchemyacademy.app/api/leads/inbound`, `CRM_LEADS_SECRET` (= `LEAD_INTAKE_SECRET`) | vaa-website Vercel project |
| Mailbox | The sending teacher/admin has an active row in `email_accounts` on the verified domain. | Email → Settings → Accounts |

Without `CRON_SECRET` the delivery worker rejects every run, so scheduled
sends and funnels silently never go out. Add env vars with:

```bash
vercel env add CRON_SECRET production
vercel env add SENDGRID_FROM_EMAIL production
vercel env add NEXT_PUBLIC_EMAIL_DOMAIN production
vercel env add SENDGRID_WEBHOOK_SECRET production
```

then redeploy.
