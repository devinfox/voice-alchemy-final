/**
 * Email template variables and rendering for Voice Alchemy Academy.
 *
 * Templates (built in the block builder) and funnel phases are rendered
 * through `renderEmailTemplate` so the one-off "Send" action, the funnel
 * worker, and the preview modal all substitute the same variables.
 */

import { stripHtml } from '@/lib/email-utils'
import { unsubscribeUrl } from '@/lib/email-unsubscribe'

export interface EmailVariable {
  key: string
  label: string
  description?: string
}

export interface EmailVariableGroup {
  name: string
  variables: EmailVariable[]
}

export const ACADEMY_NAME = 'Voice Alchemy Academy'
export const ACADEMY_WEBSITE = 'https://www.voicealchemyacademy.com'

export const EMAIL_VARIABLES: EmailVariableGroup[] = [
  {
    name: 'Student',
    variables: [
      { key: '{{first_name}}', label: 'First Name', description: "Student's first name" },
      { key: '{{last_name}}', label: 'Last Name', description: "Student's last name" },
      { key: '{{full_name}}', label: 'Full Name', description: "Student's full name" },
      { key: '{{email}}', label: 'Email', description: "Student's email address" },
    ],
  },
  {
    name: 'Teacher',
    variables: [
      { key: '{{teacher_name}}', label: 'Teacher Name', description: 'Full name of the teacher sending the email' },
      { key: '{{teacher_first_name}}', label: 'Teacher First Name', description: "Teacher's first name" },
      { key: '{{teacher_email}}', label: 'Teacher Email', description: 'Reply-to address for the teacher' },
    ],
  },
  {
    name: 'Academy',
    variables: [
      { key: '{{academy_name}}', label: 'Academy Name', description: ACADEMY_NAME },
      { key: '{{academy_website}}', label: 'Website', description: ACADEMY_WEBSITE },
      { key: '{{login_url}}', label: 'Login Link', description: 'Link to the student dashboard login' },
      { key: '{{unsubscribe_url}}', label: 'Unsubscribe Link', description: 'Signed one-click unsubscribe link for this recipient' },
    ],
  },
]

export const ALL_VARIABLES = EMAIL_VARIABLES.flatMap(group => group.variables)
export const VARIABLE_KEYS = ALL_VARIABLES.map(v => v.key)

/**
 * Replace `{{key}}` placeholders. Keys are matched without braces so callers
 * pass `{ first_name: 'Ava' }`. Unknown placeholders are left untouched so a
 * typo is visible in the preview instead of silently vanishing.
 */
export function replaceVariables(
  template: string,
  values: Record<string, string | number | null | undefined>
): string {
  let result = template
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g')
    result = result.replace(pattern, String(value ?? ''))
  }
  return result
}

export interface RecipientContext {
  first_name?: string | null
  last_name?: string | null
  name?: string | null
  email?: string | null
}

export interface SenderContext {
  name?: string | null
  first_name?: string | null
  email?: string | null
}

/** Split a display name into first/last when the profile only stores `name`. */
export function splitName(r: RecipientContext): { first: string; last: string; full: string } {
  const first = (r.first_name || r.name?.trim().split(/\s+/)[0] || '').trim()
  const last = (r.last_name || r.name?.trim().split(/\s+/).slice(1).join(' ') || '').trim()
  const full = (r.name?.trim() || `${first} ${last}`.trim())
  return { first, last, full }
}

function loginUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  return base ? `${base}/login` : `${ACADEMY_WEBSITE}/login`
}

/**
 * Build the full variable map for one recipient + sender pair.
 */
export function buildVariableValues(data: {
  recipient?: RecipientContext | null
  sender?: SenderContext | null
}): Record<string, string> {
  const values: Record<string, string> = {
    academy_name: ACADEMY_NAME,
    academy_website: ACADEMY_WEBSITE,
    login_url: loginUrl(),
  }

  if (data.recipient) {
    const { first, last, full } = splitName(data.recipient)
    values.first_name = first
    values.last_name = last
    values.full_name = full
    values.email = data.recipient.email || ''
    values.unsubscribe_url = data.recipient.email ? unsubscribeUrl(data.recipient.email) : ''
  }
  if (!values.unsubscribe_url) values.unsubscribe_url = ''

  const sender = data.sender
  const senderName = (sender?.name || '').trim()
  values.teacher_name = senderName || ACADEMY_NAME
  values.teacher_first_name = (sender?.first_name || senderName.split(/\s+/)[0] || ACADEMY_NAME).trim()
  values.teacher_email = sender?.email || ''

  return values
}

export interface RenderableTemplate {
  subject: string | null
  body: string | null
  body_html?: string | null
  /** Inbox preview text shown after the subject. Hidden inside the email body. */
  preheader?: string | null
}

/**
 * Inject preheader text as a hidden span right after <body>. Mail clients
 * show it next to the subject in the inbox list; readers never see it.
 */
export function injectPreheader(html: string, preheader: string | null | undefined): string {
  const text = (preheader || '').trim()
  if (!text) return html
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Trailing whitespace stops clients from pulling body copy into the preview.
  const filler = '&nbsp;&zwnj;'.repeat(60)
  const span = `<div class="preheader" style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:transparent;">${escaped}${filler}</div>`
  const bodyTag = /<body[^>]*>/i.exec(html)
  if (bodyTag) {
    const at = bodyTag.index + bodyTag[0].length
    return html.slice(0, at) + span + html.slice(at)
  }
  return span + html
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/**
 * Resolve the HTML for a template row.
 *
 * `body` holds the block-builder JSON (or legacy raw HTML for hand-written
 * templates); `body_html` holds the rendered HTML. Prefer `body_html`, fall
 * back to `body` only when it is not JSON.
 */
export function templateHtml(template: RenderableTemplate): string {
  if (template.body_html && template.body_html.trim()) return template.body_html
  const body = template.body || ''
  const trimmed = body.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      JSON.parse(trimmed)
      return '' // block JSON without rendered HTML; nothing sendable
    } catch {
      /* not JSON, treat as HTML */
    }
  }
  return body
}

/**
 * Render subject/html/text for a recipient. Used by the send route, the
 * funnel worker, and the preview modal (with sample values).
 */
export function renderEmailTemplate(
  template: RenderableTemplate,
  context: { recipient?: RecipientContext | null; sender?: SenderContext | null }
): RenderedEmail {
  const values = buildVariableValues(context)
  const subject = replaceVariables(template.subject || '', values)
  const bodyHtml = replaceVariables(templateHtml(template), values)
  const text = stripHtml(bodyHtml).replace(/\s+\n/g, '\n').trim()
  const html = injectPreheader(bodyHtml, replaceVariables(template.preheader || '', values))
  return { subject, html, text }
}

/**
 * Sample values for template preview
 */
export const SAMPLE_RECIPIENT: RecipientContext = {
  first_name: 'Ava',
  last_name: 'Reyes',
  name: 'Ava Reyes',
  email: 'ava.reyes@example.com',
}

export const SAMPLE_SENDER: SenderContext = {
  name: 'Julia',
  first_name: 'Julia',
  email: 'hello@voicealchemyacademy.com',
}

export const SAMPLE_VALUES: Record<string, string> = buildVariableValues({
  recipient: SAMPLE_RECIPIENT,
  sender: SAMPLE_SENDER,
})

/**
 * Template categories with labels and badge styling
 */
export const TEMPLATE_CATEGORIES = [
  { value: 'welcome', label: 'Welcome' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'lesson', label: 'Lessons' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'course', label: 'Courses' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'general', label: 'General' },
] as const

export type TemplateCategoryValue = (typeof TEMPLATE_CATEGORIES)[number]['value']

const CATEGORY_STYLES: Record<string, string> = {
  welcome: 'bg-green-500/20 text-green-300 border-green-500/30',
  onboarding: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  lesson: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  follow_up: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  course: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  announcement: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  general: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
}

export function getCategoryStyle(category: string | null | undefined): string {
  return CATEGORY_STYLES[category || 'general'] || CATEGORY_STYLES.general
}

export function getCategoryLabel(category: string | null | undefined): string {
  const found = TEMPLATE_CATEGORIES.find(c => c.value === category)
  return found?.label || 'General'
}
