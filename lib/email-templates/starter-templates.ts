/**
 * Starter email templates for Voice Alchemy Academy.
 *
 * Defined in code (as block-builder blocks) so a fresh install can add them
 * with one click and they stay editable in the builder afterwards. Installed
 * via POST /api/email-templates/starter, matched by `name` so re-running is
 * idempotent.
 */

import type { EmailBlock } from '@/lib/email-builder-types'
import { blocksToHtml } from '@/components/email-builder/utils/blocks-to-html'
import { ACADEMY_NAME, ACADEMY_WEBSITE, type TemplateCategoryValue } from '@/lib/email-variables'
import campaign from './vaa-funnel-emails.json'
import { CAMPAIGN_TEMPLATE_KEYS, MANUAL_SEND_TEMPLATES } from './starter-funnels'

export interface StarterTemplate {
  key: string
  name: string
  subject: string
  preheader?: string
  description: string
  category: TemplateCategoryValue
  blocks: EmailBlock[]
  /** Campaign grouping shown in the UI (students, leads, teachers, mentorship) */
  group?: string
}

const GOLD = '#CEB466'
const INK = '#171229'
const TEXT = '#2D2D2D'
const MUTED = '#6B6B6B'

/** Optional hosted logo for email headers/signatures. Text fallback otherwise. */
export function emailLogoUrl(): string {
  return (process.env.NEXT_PUBLIC_EMAIL_LOGO_URL || '').trim()
}

function block(type: EmailBlock['type'], id: string, properties: Record<string, unknown>): EmailBlock {
  return { id: `starter-${id}`, type, properties }
}

function text(id: string, content: string, opts: Partial<{ align: string; fontSize: number; color: string; padding: number }> = {}): EmailBlock {
  return block('text', id, {
    content,
    align: opts.align || 'left',
    padding: opts.padding ?? 16,
    fontSize: opts.fontSize ?? 16,
    color: opts.color || TEXT,
  })
}

function header(id: string): EmailBlock {
  return block('header', id, {
    logoUrl: emailLogoUrl(),
    companyName: ACADEMY_NAME,
    bgColor: INK,
    textColor: GOLD,
    padding: 28,
    align: 'center',
  })
}

function footer(id: string): EmailBlock {
  return block('footer', id, {
    text: `© ${new Date().getFullYear()} ${ACADEMY_NAME}. You are receiving this because you have an account with us.`,
    showSocial: false,
    socialLinks: [],
    unsubscribeUrl: '',
    bgColor: '#1E1E1E',
    textColor: '#9A9A9A',
    padding: 24,
  })
}

function button(id: string, label: string, url: string): EmailBlock {
  return block('button', id, {
    text: label,
    url,
    bgColor: GOLD,
    textColor: INK,
    align: 'center',
    borderRadius: 8,
    padding: 8,
    fontSize: 16,
    fullWidth: false,
  })
}

function divider(id: string): EmailBlock {
  return block('divider', id, { color: '#E0E0E0', thickness: 1, width: 100, style: 'solid', padding: 12 })
}

function spacer(id: string, height = 16): EmailBlock {
  return block('spacer', id, { height })
}

/**
 * The standard Voice Alchemy Academy introduction email. Sent to a new
 * student after they join; also the first phase of the welcome funnel.
 */
export const VAA_INTRO_TEMPLATE: StarterTemplate = {
  key: 'vaa-intro',
  name: 'Welcome to Voice Alchemy Academy',
  subject: 'Welcome to Voice Alchemy Academy, {{first_name}}',
  description:
    'Standard introduction email for new students: what the academy is, how lessons work, and how to get started in the dashboard.',
  category: 'welcome',
  blocks: [
    header('intro-header'),
    spacer('intro-space-top', 8),
    text(
      'intro-greeting',
      `<p style="font-size:22px;font-weight:bold;margin:0 0 12px 0;">Hi {{first_name}}, welcome to ${ACADEMY_NAME}.</p>
<p style="margin:0 0 12px 0;">I'm so glad you're here. ${ACADEMY_NAME} is where singers of every level learn to use their voice with confidence, freedom, and real technique behind it.</p>
<p style="margin:0;">This email is a quick tour of what you now have access to and how to make the most of it.</p>`
    ),
    divider('intro-div-1'),
    text(
      'intro-what-to-expect',
      `<p style="font-size:18px;font-weight:bold;margin:0 0 10px 0;">What to expect</p>
<ul style="margin:0;padding-left:20px;">
  <li style="margin-bottom:8px;"><strong>Live lessons.</strong> Your lessons happen right inside the studio, with video, recording, and notes in one place.</li>
  <li style="margin-bottom:8px;"><strong>Training Center.</strong> Pitch, scale, and rhythm trainers you can use any day of the week to keep your ear and voice sharp between lessons.</li>
  <li style="margin-bottom:8px;"><strong>Courses.</strong> Structured programs you can move through at your own pace.</li>
  <li style="margin-bottom:0;"><strong>Your progress.</strong> Every session is saved so you can look back and hear how far you have come.</li>
</ul>`
    ),
    divider('intro-div-2'),
    text(
      'intro-next-steps',
      `<p style="font-size:18px;font-weight:bold;margin:0 0 10px 0;">Your first three steps</p>
<ol style="margin:0;padding-left:20px;">
  <li style="margin-bottom:8px;">Log in to your dashboard and complete your profile.</li>
  <li style="margin-bottom:8px;">Open the Training Center and try the pitch trainer for five minutes.</li>
  <li style="margin-bottom:0;">Book your first lesson from the calendar, or reply to this email and I will help you find a time.</li>
</ol>`
    ),
    spacer('intro-space-btn', 8),
    button('intro-cta', 'Open my dashboard', '{{login_url}}'),
    spacer('intro-space-after-btn', 8),
    text(
      'intro-signoff',
      `<p style="margin:0 0 12px 0;">If you have any questions at all, just hit reply. I read every message.</p>
<p style="margin:0;">Warmly,<br><strong>{{teacher_name}}</strong><br><span class="email-text-muted" style="color:${MUTED};">${ACADEMY_NAME}</span><br><a href="${ACADEMY_WEBSITE}" style="color:${GOLD};text-decoration:none;">${ACADEMY_WEBSITE.replace('https://', '')}</a></p>`
    ),
    spacer('intro-space-bottom', 8),
    footer('intro-footer'),
  ],
}

// ---------------------------------------------------------------------------
// The VAA campaign (students, student leads, teachers, mentorship)
// ---------------------------------------------------------------------------
// Generated from vaa-website/marketing/build-email-template-designs.py
// (`--json`), which also renders the design doc. Every email is an ordinary
// list of builder blocks, so once installed it is edited like any template.

interface CampaignEmail {
  key: string
  role: string
  n: number
  name: string
  timing: string
  subject: string
  preheader: string
  cta: string
  landing: string
  why: string
  ship_first: boolean
  assets: string[]
  blocks: { type: string; note: string; properties: Record<string, unknown> }[]
}

interface CampaignData {
  roles: Record<string, { title: string; kicker: string; goal: string; trigger: string; audience: string; cta_note: string }>
  emails: CampaignEmail[]
}

const CAMPAIGN = campaign as unknown as CampaignData

const ROLE_LABEL: Record<string, string> = {
  students: 'Students',
  leads: 'Student Leads',
  teachers: 'Teachers',
  mentorship: 'Mentorship',
}

const ROLE_CATEGORY: Record<string, TemplateCategoryValue> = {
  students: 'onboarding',
  leads: 'follow_up',
  teachers: 'follow_up',
  mentorship: 'general',
}

/**
 * Where the campaign images are served from. Default: the public
 * `email-template-images` storage bucket of this Supabase project, folder
 * `campaign/` (logo.png, app/*.webp, photos/*.jpg), uploaded from
 * vaa-website/public/images. Override with NEXT_PUBLIC_EMAIL_IMAGE_BASE.
 */
export function emailImageBase(): string {
  const override = (process.env.NEXT_PUBLIC_EMAIL_IMAGE_BASE || '').trim()
  if (override) return override.replace(/\/$/, '')
  const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xojhghxsevggzgeejkyx.supabase.co').replace(/\/$/, '')
  return `${supabase}/storage/v1/object/public/email-template-images/campaign`
}

const REPLY = 'mailto:hello@voicealchemyacademy.com'

/**
 * Links the doc leaves as placeholders. Set the env var to the real URL; the
 * fallback keeps every button working (a reply, or the app) until then.
 */
export function campaignLinks(): Record<string, string> {
  const site = (process.env.NEXT_PUBLIC_MARKETING_SITE_URL || 'https://voicealchemyacademy.app').replace(/\/$/, '')
  return {
    '#SCHEDULING_LINK': process.env.EMAIL_LINK_DEMO_SCHEDULING || `${REPLY}?subject=Demo%20time`,
    '#PLAYBOOK_PDF': process.env.EMAIL_LINK_PLAYBOOK_PDF || `${site}/?view=teacher`,
    '#PITCH_GUIDE_PDF': process.env.EMAIL_LINK_PITCH_GUIDE_PDF || `${site}/signup?role=student&src=email`,
    '#JULIA_BOOKING_LINK': process.env.EMAIL_LINK_JULIA_BOOKING || `${REPLY}?subject=Mentorship%20conversation`,
  }
}

function resolveCampaignString(value: string): string {
  let out = value
  const logo = emailLogoUrl()
  if (logo) out = out.replace('{{IMAGE_BASE}}/logo.png', logo)
  out = out.split('{{IMAGE_BASE}}').join(emailImageBase())
  for (const [placeholder, url] of Object.entries(campaignLinks())) out = out.split(placeholder).join(url)
  return out
}

function resolveDeep<T>(value: T): T {
  if (typeof value === 'string') return resolveCampaignString(value) as unknown as T
  if (Array.isArray(value)) return value.map(resolveDeep) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = resolveDeep(v)
    return out as unknown as T
  }
  return value
}

function campaignTemplate(e: CampaignEmail): StarterTemplate {
  const manual = MANUAL_SEND_TEMPLATES.includes(e.key)
  const blocks: EmailBlock[] = e.blocks.map((b, i) => ({
    id: `${e.key}-${i + 1}-${b.type}`,
    type: b.type as EmailBlock['type'],
    properties: resolveDeep(b.properties) as Record<string, unknown>,
  }))
  return {
    key: e.key,
    name: `${ROLE_LABEL[e.role] || e.role} ${e.n} · ${e.name}`,
    subject: e.subject,
    preheader: e.preheader,
    description: `${manual ? 'Sent by hand. ' : ''}${e.timing}. ${e.why}`,
    category: ROLE_CATEGORY[e.role] || 'general',
    blocks,
    group: e.role,
  }
}

export const CAMPAIGN_TEMPLATES: StarterTemplate[] = CAMPAIGN.emails
  .filter(e => CAMPAIGN_TEMPLATE_KEYS.includes(e.key))
  .map(campaignTemplate)

export const CAMPAIGN_ROLES = CAMPAIGN.roles

export const STARTER_TEMPLATES: StarterTemplate[] = [VAA_INTRO_TEMPLATE, ...CAMPAIGN_TEMPLATES]

export function getStarterTemplate(key: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find(t => t.key === key)
}

/**
 * Row shape for inserting into `email_templates`.
 */
export function starterTemplateRow(starter: StarterTemplate) {
  return {
    name: starter.name,
    subject: starter.subject,
    preheader: starter.preheader || null,
    description: starter.description,
    category: starter.category,
    body: JSON.stringify(starter.blocks),
    body_html: blocksToHtml(starter.blocks),
    is_active: true,
    starter_key: starter.key,
  }
}
